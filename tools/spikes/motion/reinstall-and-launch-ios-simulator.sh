#!/usr/bin/env bash
# Rerun: tools/spikes/motion/reinstall-and-launch-ios-simulator.sh <route>
# Reuses the dev-client .app already built by skia-critter's build script (same app, new spike
# routes) — boots the dedicated simulator (creating it if it was deleted to free disk earlier),
# installs, starts Metro, opens the given (dev)/spikes route.
set -uo pipefail
cd "$(dirname "$0")/../../../apps/mobile"

APP_PATH=$(find /tmp/cp-skia-critter-ios-derived/Build/Products -maxdepth 2 -iname 'CritterpassDev.app' 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
  APP_PATH="/tmp/cp-spike-artifacts/CritterpassDev.app" # preserved copy after DerivedData was cleaned for disk space
fi
ROUTE="${1:-grow-into-page}"
SIM_NAME="cp-skia-critter-spike"

UDID=$(xcrun simctl list devices | grep "$SIM_NAME" | grep -oE '[0-9A-F-]{36}' || true)
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl create "$SIM_NAME" "iPhone 17 Pro")
fi
echo "UDID=$UDID"
xcrun simctl bootstatus "$UDID" -b || xcrun simctl boot "$UDID"
xcrun simctl install "$UDID" "$APP_PATH"

pkill -f "expo start --dev-client --port 8098" 2>/dev/null || true
nohup npx expo start --dev-client --port 8098 > /tmp/cp-motion-metro.log 2>&1 &
echo "METRO_PID=$!"
sleep 10

xcrun simctl launch "$UDID" app.critterpass.dev >/tmp/cp-motion-launch.log 2>&1 || true
sleep 3
xcrun simctl openurl "$UDID" "critterpass-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8098"
sleep 6
xcrun simctl openurl "$UDID" "critterpass-dev:///(dev)/spikes/$ROUTE"
echo "DONE UDID=$UDID"
