#!/usr/bin/env bash
set -euo pipefail

platform="${1:?Expected ios or android}"
case "$platform" in ios|android) ;; *) exit 1 ;; esac
results="$GITHUB_WORKSPACE/e2e-results/$platform"
mkdir -p "$results"
exec > >(tee "$results/build.log") 2>&1
cd "$GITHUB_WORKSPACE/source"
git rev-parse HEAD > "$results/source-commit.txt"

if [[ "$platform" == ios ]]; then
  sfw npm run bundle:bare
else
  sfw npm run bundle:bare -- --host android-x64
fi
sfw npm run prebuild -- --platform "$platform" --no-install

if [[ "$platform" == ios ]]; then
  pod install --project-directory=ios
  workspaces=(ios/*.xcworkspace)
  [[ ${#workspaces[@]} == 1 && -d "${workspaces[0]}" ]] || { echo 'Expected one iOS workspace'; exit 1; }
  workspace="${workspaces[0]}"
  scheme="$(basename "$workspace" .xcworkspace)"
  derived_data="$RUNNER_TEMP/snake-e2e-derived-data"
  xcodebuild -workspace "$workspace" -scheme "$scheme" \
    -configuration Release -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$derived_data" -resultBundlePath "$results/build.xcresult" \
    CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES "ARCHS=$(uname -m)" build
  apps=("$derived_data/Build/Products/Release-iphonesimulator/"*.app)
  [[ ${#apps[@]} == 1 && -d "${apps[0]}" ]] || { echo 'Expected one simulator app'; exit 1; }
  printf '%s\n' "${apps[0]}" > "$results/app-path.txt"
else
  (
    cd android
    gradle :app:assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2
  )
  app="$PWD/android/app/build/outputs/apk/release/app-release.apk"
  test -f "$app"
  printf '%s\n' "$app" > "$results/app-path.txt"
fi
