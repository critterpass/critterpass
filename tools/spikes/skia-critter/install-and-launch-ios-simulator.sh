#!/usr/bin/env bash
# Rerun: tools/spikes/skia-critter/install-and-launch-ios-simulator.sh <route>
# Boots a dedicated simulator (not shared with other agents), installs the dev-client app already
# built by prebuild-and-build-ios-simulator.sh, starts Metro in the background, and deep-links into
# the given (dev)/spikes route.
set -euo pipefail
cd "$(dirname "$0")/../../../apps/mobile"

APP_PATH=$(find /tmp/cp-skia-critter-ios-derived/Build/Products -maxdepth 2 -iname 'CritterpassDev.app' | head -1)
ROUTE="${1:-critter}"
SIM_NAME="cp-skia-critter-spike"

UDID=$(xcrun simctl list devices | grep "$SIM_NAME" | grep -oE '[0-9A-F-]{36}' || true)
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl create "$SIM_NAME" "iPhone 17 Pro")
fi
echo "UDID=$UDID"
xcrun simctl bootstatus "$UDID" -b || xcrun simctl boot "$UDID"
xcrun simctl install "$UDID" "$APP_PATH"

nohup npx expo start --dev-client --port 8098 > /tmp/cp-skia-critter-metro.log 2>&1 &
echo "METRO_PID=$!"
sleep 8

xcrun simctl launch "$UDID" app.critterpass.dev >/tmp/cp-skia-critter-launch.log 2>&1 || true
sleep 3
xcrun simctl openurl "$UDID" "critterpass-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8098"
sleep 5
xcrun simctl openurl "$UDID" "critterpass-dev:///(dev)/spikes/$ROUTE"
echo "DONE UDID=$UDID"
