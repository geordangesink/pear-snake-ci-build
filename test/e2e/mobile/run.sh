#!/usr/bin/env bash
set -euo pipefail

platform="${1:?Expected ios or android}"
case "$platform" in ios|android) ;; *) exit 1 ;; esac
results="$GITHUB_WORKSPACE/e2e-results/$platform"
app=$(cat "$results/app-path.txt")
simulator=''
app_executable=''

cleanup() {
  status=$?
  trap - EXIT
  if [[ "$platform" == ios && -n "$simulator" ]]; then
    xcrun simctl io "$simulator" screenshot "$results/final-screen.png" || true
    xcrun simctl spawn "$simulator" log show --last 10m --style compact \
      --predicate "process == '$app_executable'" > "$results/device.log" 2>&1 || true
    xcrun simctl shutdown "$simulator" || true
    xcrun simctl delete "$simulator" || true
  elif [[ "$platform" == android ]]; then
    adb logcat -d > "$results/device.log" 2>&1 || true
    adb exec-out screencap -p > "$results/final-screen.png" || true
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ "$platform" == ios ]]; then
  xcrun simctl list devices available --json > "$results/devices.json"
  export RESULTS_DIRECTORY="$results"
  node <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const directory = process.env.RESULTS_DIRECTORY
const { devices } = JSON.parse(fs.readFileSync(path.join(directory, 'devices.json'), 'utf8'))
const runtimes = Object.keys(devices).filter(id => id.includes('.iOS-')).sort((a, b) =>
  b.localeCompare(a, undefined, { numeric: true })
)
for (const runtime of runtimes) {
  const device = devices[runtime].find(device => device.isAvailable && device.name.startsWith('iPhone'))
  if (!device) continue
  fs.writeFileSync(path.join(directory, 'simulator.json'), JSON.stringify({ runtime, type: device.deviceTypeIdentifier }))
  process.exit(0)
}
throw new Error('No available iPhone simulator runtime')
NODE
  runtime=$(node -p 'require(process.env.RESULTS_DIRECTORY + "/simulator.json").runtime')
  device_type=$(node -p 'require(process.env.RESULTS_DIRECTORY + "/simulator.json").type')
  simulator=$(xcrun simctl create SnakeE2E "$device_type" "$runtime")
  xcrun simctl bootstatus "$simulator" -b
  xcrun simctl install "$simulator" "$app"
  app_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
  app_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")
  device="$simulator"
else
  adb wait-for-device
  adb install -r "$app"
  app_id="$ANDROID_PACKAGE"
  device=$(adb get-serialno)
fi

maestro --device "$device" test \
  --env "APP_ID=$app_id" --format junit --output "$results/report.xml" \
  --debug-output "$results/maestro" \
  "$GITHUB_WORKSPACE/test/e2e/mobile/smoke.yaml" 2>&1 | tee "$results/test.log"
