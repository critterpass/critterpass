#!/usr/bin/env bash
# One iOS shard on a GitHub macOS runner: download the e2e-test simulator build, swap in this
# commit's JS, install it on a fresh simulator and run the shard's flows.
#
#   tools/scripts/ci-device/ios-device.sh boot
#   tools/scripts/ci-device/ios-device.sh <build url> <bundle dir> <out dir> "<flow.yaml …>"
#
# `boot` creates and boots the simulator on its own, as the job's first step, so its slow first boot
# runs while the job sets up; the run then picks it up (its id is in $RUNNER_TEMP/ios-sim-udid).
#
# Env: DEVICE (default "iPhone 17"), APPEARANCE (light|dark), RECORD_VIDEO, TSX_VERSION, E2E_API_BASE_URL
# (the api the pre-flight reaches), FLOW_TIMEOUT_MINUTES, and whatever the flows read (JS_COMMIT,
# OTP_TEST_CODE), forwarded to Maestro by run-shard.ts.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
udid_file=${RUNNER_TEMP:-/tmp}/ios-sim-udid
# Each setup step's start in the log, so the shard's setup time can be read step by step.
stamp() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Creates and boots the simulator. Its link scheme is pre-approved, so Maestro's openLink (simctl
# openurl) opens the app instead of leaving iOS's "Open in …?" prompt on screen for every flow.
boot_simulator() {
  local runtime udid approvals
  stamp "create and boot the simulator"
  runtime=$(xcrun simctl list runtimes -j |
    jq -r '[.runtimes[] | select(.isAvailable and .platform == "iOS")] | sort_by(.version | split(".") | map(tonumber)) | last | .identifier')
  udid=$(xcrun simctl create "CritterPass CI" "${DEVICE:-iPhone 17}" "$runtime")
  echo "Simulator ${DEVICE:-iPhone 17} on $runtime ($udid)"
  approvals="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist"
  mkdir -p "$(dirname "$approvals")"
  /usr/libexec/PlistBuddy -c "Add :com.apple.CoreSimulator.CoreSimulatorBridge-->critterpass-dev string app.critterpass.dev" "$approvals" >/dev/null
  # `simctl boot` returns only once the device is up, minutes on a new one: it boots in the
  # background, and `bootstatus -b` (which also boots it, should this fail) waits for it later.
  (xcrun simctl boot "$udid" >/dev/null 2>&1 &)
  echo "$udid" >"$udid_file"
}

if [ "${1:-}" = boot ]; then
  boot_simulator
  exit 0
fi

build_url=$1
bundle_dir=$2
out_dir=$3
flows=$4
tsx="tsx@${TSX_VERSION:-4}"
work=${RUNNER_TEMP:-$(mktemp -d)}/ios-build
mkdir -p "$work" "$out_dir"

stamp "download the build"
curl -fsSL --retry 3 -o "$work/build.tar.gz" "$build_url"
mkdir -p "$work/app" && tar -xzf "$work/build.tar.gz" -C "$work/app" && rm "$work/build.tar.gz"
# The host app's Info.plist (the bundle id and URL schemes) is the same before and after the patch.
plist=$(find "$work/app" -maxdepth 3 -name Info.plist -path '*.app/Info.plist' | head -1)

[ -s "$udid_file" ] || boot_simulator
udid=$(cat "$udid_file")

# While it boots: swap this commit's JS into the app, and check the runner reaches the api (a
# simulator uses the Mac's network, so the runner's own request is the check).
stamp "patch the app and check the network while the simulator boots"
app=$(npx --yes "$tsx" "$here/patch-ios-app.ts" "$work/app" "$bundle_dir" | tail -1)
npx --yes "$tsx" "$here/network-preflight.ts" --platform ios --device "$udid" --url "${E2E_API_BASE_URL:-}"

xcrun simctl bootstatus "$udid" -b >/dev/null
stamp "simulator booted: settings and install"
# Any other link scheme the build declares is approved the same way, now that it runs.
bundle_id=$(plutil -extract CFBundleIdentifier raw "$plist")
for scheme in $(plutil -extract CFBundleURLTypes json -o - "$plist" | jq -r '.[].CFBundleURLSchemes[]'); do
  xcrun simctl spawn "$udid" defaults write com.apple.launchservices.schemeapproval \
    "com.apple.CoreSimulator.CoreSimulatorBridge-->$scheme" -string "$bundle_id"
done
# A new simulator covers its first keyboard with the slide-to-type introduction ("Speed up your
# typing…", Continue), which hides the app's own elements from the flow until it is dismissed.
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences \
  DidShowContinuousPathIntroduction -bool true
xcrun simctl ui "$udid" appearance "${APPEARANCE:-light}"
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 --dataNetwork wifi
# Maestro's driver starts while the app installs; the flows reuse it.
maestro="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
warm_log=${RUNNER_TEMP:-/tmp}/driver-warmup.log
MAESTRO_DRIVER_STARTUP_TIMEOUT=360000 "$maestro" --device "$udid" test "$here/driver-warmup.yaml" \
  >"$warm_log" 2>&1 &
warmup=$!
xcrun simctl install "$udid" "$app"
# A first launch outside Maestro: the cold start (the JS loaded for the first time) happens here,
# and the first flow's taps land on an app that takes input (the first launch on a fresh simulator
# can leave its window without focus until it is brought forward again).
xcrun simctl launch "$udid" "$bundle_id" >/dev/null || true
sleep 12
xcrun simctl terminate "$udid" "$bundle_id" >/dev/null 2>&1 || true
if wait "$warmup"; then
  export MAESTRO_DRIVER_READY=true
  stamp "installed and launched once, Maestro's driver up: running the flows"
else
  tail -20 "$warm_log" || true
  stamp "installed and launched once (Maestro's driver did not warm up): running the flows"
fi

# RECORD_VIDEO=true records every flow (the release gate).
video=$([ "${RECORD_VIDEO:-}" = true ] && echo --video || true)
# shellcheck disable=SC2086 # the flow list is intentionally word-split
npx --yes "$tsx" "$here/run-shard.ts" --platform ios --device "$udid" --out "$out_dir" \
  --env JS_COMMIT --env OTP_TEST_CODE --env CREW_ID --env CREW_NAME \
  --flow-timeout "${FLOW_TIMEOUT_MINUTES:-}" $video $flows
