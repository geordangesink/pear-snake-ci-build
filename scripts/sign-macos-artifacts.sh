#!/usr/bin/env bash
set -euo pipefail

arch="${1:?Expected arm64 or x64}"
case "$arch" in
  arm64|x64) ;;
  *) echo "Unsupported macOS architecture: $arch" >&2; exit 1 ;;
esac

: "${MACOS_CODESIGN_IDENTITY:?Missing macOS signing identity}"
: "${RUNNER_TEMP:?Missing runner temporary directory}"

shopt -s nullglob
apps=(out/*-darwin-"$arch"/*.app)
dmgs=()
while IFS= read -r -d '' dmg; do
  dmgs+=("$dmg")
done < <(find out/make -type f -name '*.dmg' -print0)

if [[ ${#apps[@]} -ne 1 || ${#dmgs[@]} -eq 0 ]]; then
  echo 'Expected one macOS app bundle and at least one DMG.' >&2
  exit 1
fi

app="${apps[0]}"
codesign --verify --deep --strict --verbose=2 "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

credentials=(--keychain-profile notary --keychain "$RUNNER_TEMP/app-signing.keychain-db")
result="$RUNNER_TEMP/snake-darwin-$arch-notarization.json"
for dmg in "${dmgs[@]}"; do
  codesign --force --sign "$MACOS_CODESIGN_IDENTITY" --timestamp "$dmg"
  if ! xcrun notarytool submit "$dmg" "${credentials[@]}" --wait --output-format json > "$result"; then
    cat "$result" >&2
    exit 1
  fi
  if ! node - "$result" <<'NODE'
const fs = require('node:fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.status !== 'Accepted') {
  console.error(JSON.stringify(result))
  process.exit(1)
}
NODE
  then
    submission_id="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).id' "$result")"
    xcrun notarytool log "$submission_id" "${credentials[@]}" >&2 || true
    exit 1
  fi
  xcrun stapler staple "$dmg"
  xcrun stapler validate "$dmg"
  codesign --verify --strict --verbose=2 "$dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
done

ditto -c -k --sequesterRsrc --keepParent "$app" "$RUNNER_TEMP/snake-darwin-$arch-app.zip"
