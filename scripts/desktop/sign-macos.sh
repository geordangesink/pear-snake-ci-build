#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for variable in MACOS_CODESIGN_IDENTITY KEYCHAIN_PROFILE; do
  [[ -n "${!variable:-}" ]] || { echo "Missing signing secret: $variable" >&2; exit 1; }
done

SIGNING_DIR=$(mktemp -d "$RUNNER_TEMP/snake-desktop-signing.XXXXXX")
export KEYCHAIN_PATH="$RUNNER_TEMP/app-signing.keychain-db"
trap 'rm -rf "$SIGNING_DIR"' EXIT

node "$SCRIPT_DIR/../safe-extract.js" out/unsigned/payload.zip "$SIGNING_DIR/app"
APP="$SIGNING_DIR/app/Snake.app"
for directory in "$APP" "$APP/Contents" "$APP/Contents/MacOS"; do
  [[ -d "$directory" && ! -L "$directory" ]] || { echo 'Invalid macOS app layout' >&2; exit 1; }
done
[[ ! -L "$APP/Contents/Info.plist" && ! -L "$APP/Contents/MacOS/Snake" ]] || exit 1
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" == com.electron.snake ]] || { echo 'Unexpected macOS bundle ID' >&2; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")" == Snake ]] || { echo 'Unexpected macOS executable' >&2; exit 1; }
node "$SCRIPT_DIR/sign-macos.js" "$APP"
codesign --verify --deep --strict "$APP"
notarize() {
  xcrun notarytool submit "$1" --keychain-profile "$KEYCHAIN_PROFILE" --keychain "$KEYCHAIN_PATH" \
    --wait --output-format json > "$SIGNING_DIR/notarization.json"
  [[ "$(plutil -extract status raw -o - "$SIGNING_DIR/notarization.json")" == Accepted ]] || { echo 'Notarization failed' >&2; return 1; }
}
ditto -c -k --sequesterRsrc --keepParent "$APP" "$SIGNING_DIR/notarize.zip"
notarize "$SIGNING_DIR/notarize.zip"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute "$APP"

mkdir -p out/signed "$SIGNING_DIR/dmg"
ditto -c -k --sequesterRsrc --keepParent "$APP" out/signed/Snake-app.zip
ditto "$APP" "$SIGNING_DIR/dmg/Snake.app"
ln -s /Applications "$SIGNING_DIR/dmg/Applications"
hdiutil create -volname Snake -srcfolder "$SIGNING_DIR/dmg" -format UDZO -ov out/signed/Snake.dmg
codesign --force --sign "$MACOS_CODESIGN_IDENTITY" --keychain "$KEYCHAIN_PATH" --timestamp out/signed/Snake.dmg
notarize out/signed/Snake.dmg
xcrun stapler staple out/signed/Snake.dmg
xcrun stapler validate out/signed/Snake.dmg
codesign --verify --strict out/signed/Snake.dmg
