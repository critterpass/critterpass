#!/usr/bin/env bash
# One iOS shard on a GitHub macOS runner: download the e2e-test simulator build, swap in this
# commit's JS, install it on a fresh simulator and run the shard's flows.
#
#   tools/scripts/ci-device/ios-device.sh <build url> <bundle dir> <out dir> "<flow.yaml …>"
#
# Env: DEVICE (default "iPhone 17"), APPEARANCE (light|dark), TSX_VERSION, and whatever the flows
# read (JS_COMMIT, OTP_TEST_CODE), forwarded to Maestro by run-shard.ts.
set -euo pipefail

build_url=$1
bundle_dir=$2
out_dir=$3
flows=$4
here=$(cd "$(dirname "$0")" && pwd)
tsx="tsx@${TSX_VERSION:-4}"
work=${RUNNER_TEMP:-$(mktemp -d)}/ios-build
mkdir -p "$work" "$out_dir"

curl -fsSL --retry 3 -o "$work/build.tar.gz" "$build_url"
mkdir -p "$work/app" && tar -xzf "$work/build.tar.gz" -C "$work/app" && rm "$work/build.tar.gz"
app=$(npx --yes "$tsx" "$here/patch-ios-app.ts" "$work/app" "$bundle_dir" | tail -1)

runtime=$(xcrun simctl list runtimes -j |
  jq -r '[.runtimes[] | select(.isAvailable and .platform == "iOS")] | sort_by(.version | split(".") | map(tonumber)) | last | .identifier')
udid=$(xcrun simctl create "CritterPass CI" "${DEVICE:-iPhone 17}" "$runtime")
echo "Simulator ${DEVICE:-iPhone 17} on $runtime ($udid)"

# Pre-approve the app's URL schemes, so Maestro's openLink (simctl openurl) opens the app instead of
# leaving iOS's "Open in …?" prompt on screen for this and every later flow.
approvals="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist"
mkdir -p "$(dirname "$approvals")"
bundle_id=$(plutil -extract CFBundleIdentifier raw "$app/Info.plist")
for scheme in $(plutil -extract CFBundleURLTypes json -o - "$app/Info.plist" | jq -r '.[].CFBundleURLSchemes[]'); do
  /usr/libexec/PlistBuddy -c "Add :com.apple.CoreSimulator.CoreSimulatorBridge-->$scheme string $bundle_id" "$approvals" >/dev/null
done
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl ui "$udid" appearance "${APPEARANCE:-light}"
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 --dataNetwork wifi
xcrun simctl install "$udid" "$app"

# shellcheck disable=SC2086 # the flow list is intentionally word-split
npx --yes "$tsx" "$here/run-shard.ts" --platform ios --device "$udid" --out "$out_dir" \
  --env JS_COMMIT --env OTP_TEST_CODE $flows
