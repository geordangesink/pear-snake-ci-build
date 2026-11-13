#!/usr/bin/env bash
set -euo pipefail

for variable in ARTIFACT_DIR ANDROID_HOME JAVA_HOME ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing environment variable: $variable" >&2
    exit 1
  fi
done

umask 077
OUTPUT_DIR="$PWD/dist/android"
mkdir -p "$OUTPUT_DIR"
exec > >(tee "$OUTPUT_DIR/signing.log") 2>&1
SIGNING_DIR=$(mktemp -d "$RUNNER_TEMP/snake-android.XXXXXX")
trap 'rm -rf "$SIGNING_DIR"' EXIT
BUILD_TOOLS="$ANDROID_HOME/build-tools/36.0.0"
KEYSTORE="$SIGNING_DIR/upload.keystore"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE"

"$BUILD_TOOLS/zipalign" -f -P 16 4 "$ARTIFACT_DIR/Snake.apk" "$SIGNING_DIR/aligned.apk"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$ANDROID_KEY_ALIAS" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD \
  --out "$OUTPUT_DIR/Snake.apk" "$SIGNING_DIR/aligned.apk"
"$BUILD_TOOLS/apksigner" verify --verbose "$OUTPUT_DIR/Snake.apk"
"$BUILD_TOOLS/zipalign" -c -P 16 4 "$OUTPUT_DIR/Snake.apk"

"$JAVA_HOME/bin/jarsigner" \
  -keystore "$KEYSTORE" -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD \
  -digestalg SHA-256 -signedjar "$OUTPUT_DIR/Snake.aab" "$ARTIFACT_DIR/Snake.aab" "$ANDROID_KEY_ALIAS"
"$JAVA_HOME/bin/jarsigner" -verify -strict \
  -keystore "$KEYSTORE" -storepass:env ANDROID_KEYSTORE_PASSWORD "$OUTPUT_DIR/Snake.aab"
cp "$ARTIFACT_DIR/build-metadata.json" "$OUTPUT_DIR/build-metadata.json"
