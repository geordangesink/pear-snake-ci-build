#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for variable in ARTIFACT_DIR IOS_PROVISIONING_PROFILE_BASE64 APPLE_TEAM_ID; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing environment variable: $variable" >&2
    exit 1
  fi
done

umask 077
OUTPUT_DIR="$PWD/dist/ios"
mkdir -p "$OUTPUT_DIR"
exec > >(tee "$OUTPUT_DIR/signing.log") 2>&1
SIGNING_DIR=$(mktemp -d "$RUNNER_TEMP/snake-ios.XXXXXX")
KEYCHAIN_PATH="$RUNNER_TEMP/app-signing.keychain-db"
PROFILE_PATH=""

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  [[ -z "$PROFILE_PATH" ]] || rm -f "$PROFILE_PATH"
  rm -rf "$SIGNING_DIR"
  exit "$status"
}
trap cleanup EXIT
export SIGNING_DIR

node "$SCRIPT_DIR/prepare-ios-signing.js"

IDENTITY=$(/usr/bin/security find-identity -v -p codesigning "$KEYCHAIN_PATH" |
  awk -F '"' '/"Apple Distribution:/ { print $2 }')
[[ -n "$IDENTITY" ]] || { echo 'Apple Distribution certificate not found' >&2; exit 1; }
/usr/bin/plutil -replace ApplicationProperties.SigningIdentity -string "$IDENTITY" \
  "$ARTIFACT_DIR/archive/Snake.xcarchive/Info.plist"

PROFILE_DIRECTORY="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$PROFILE_DIRECTORY"
PROFILE_PATH="$PROFILE_DIRECTORY/$(basename "$SIGNING_DIR").mobileprovision"
cp "$SIGNING_DIR/profile.mobileprovision" "$PROFILE_PATH"
APP_PATH=$(cat "$SIGNING_DIR/app-path.txt")
cp "$SIGNING_DIR/profile.mobileprovision" "$APP_PATH/embedded.mobileprovision"
while IFS= read -r -d '' target; do
  /usr/bin/codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN_PATH" "$target"
done < "$SIGNING_DIR/signing-paths"
/usr/bin/codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN_PATH" \
  --entitlements "$SIGNING_DIR/Entitlements.plist" --generate-entitlement-der "$APP_PATH"
/usr/bin/codesign --verify --deep --strict "$APP_PATH"

xcodebuild -exportArchive \
  -archivePath "$ARTIFACT_DIR/archive/Snake.xcarchive" \
  -exportOptionsPlist "$SIGNING_DIR/ExportOptions.plist" \
  -exportPath "$SIGNING_DIR/export" 2>&1 | tee "$OUTPUT_DIR/export.log"

IPAS=("$SIGNING_DIR/export"/*.ipa)
if [[ ${#IPAS[@]} != 1 || ! -f "${IPAS[0]}" ]]; then
  echo 'Expected one exported IPA' >&2
  exit 1
fi
cp "${IPAS[0]}" "$OUTPUT_DIR/Snake.ipa"
cp "$ARTIFACT_DIR/build-metadata.json" "$OUTPUT_DIR/build-metadata.json"
