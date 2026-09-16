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
  npm run bundle:bare
else
  npx --no-install bare-pack --host android-x64 --linked --out ./src/worker.bundle.js ./workers/main.js
fi
npx --no-install expo prebuild --platform "$platform" --no-install

if [[ "$platform" == ios ]]; then
  pod install --project-directory=ios
  export RESULTS_DIRECTORY="$results"
  node <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const xcode = require('xcode')
const unquote = value => String(value || '').replace(/^"|"$/g, '')
const projects = fs.readdirSync('ios').filter(name => name.endsWith('.xcodeproj'))
if (projects.length !== 1) throw new Error('Expected one generated iOS application project')
const project = xcode.project(path.join('ios', projects[0], 'project.pbxproj'))
project.parseSync()
const targets = Object.values(project.pbxNativeTargetSection()).filter(target =>
  unquote(target.productType) === 'com.apple.product-type.application'
)
if (targets.length !== 1) throw new Error('Expected one iOS application target')
const scheme = unquote(targets[0].name)
const workspace = path.join('ios', projects[0].replace(/\.xcodeproj$/, '.xcworkspace'))
if (!fs.existsSync(workspace)) throw new Error('Generated iOS workspace is missing')
fs.writeFileSync(path.join(process.env.RESULTS_DIRECTORY, 'project.json'), JSON.stringify({ workspace, scheme }))
NODE
  workspace=$(node -p 'require(process.env.RESULTS_DIRECTORY + "/project.json").workspace')
  scheme=$(node -p 'require(process.env.RESULTS_DIRECTORY + "/project.json").scheme')
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
    ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2
  )
  app="$PWD/android/app/build/outputs/apk/release/app-release.apk"
  test -f "$app"
  printf '%s\n' "$app" > "$results/app-path.txt"
fi
