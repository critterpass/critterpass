#!/usr/bin/env bash
# Rerun: tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh
# Prebuilds the iOS project and builds the dev client for the simulator (Debug, unsigned — no
# device account exists in this environment, matching the T7/T8/T9 spikes' findings). Cleans its
# own DerivedData when done successfully; leaves it on failure so the error can be inspected.
set -euo pipefail
cd "$(dirname "$0")/../../../apps/mobile"

MIN_FREE_GB=4
FREE_GB=$(df -g / | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  echo "BLOCKED: only ${FREE_GB} GB free (need >= ${MIN_FREE_GB} GB) — not starting an iOS build." >&2
  exit 1
fi

npx expo prebuild --platform ios --no-install
(cd ios && pod install)

DERIVED_DATA=/tmp/cp-skia-critter-ios-derived
rm -rf "$DERIVED_DATA"

xcrun xcodebuild \
  -workspace ios/CritterpassDev.xcworkspace \
  -scheme CritterpassDev \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO

APP_PATH=$(find "$DERIVED_DATA/Build/Products" -maxdepth 2 -iname 'CritterpassDev.app' | head -1)
if [ -z "$APP_PATH" ]; then
  echo "BUILD FAILED: no .app product found under $DERIVED_DATA" >&2
  exit 1
fi
echo "APP_PATH=$APP_PATH"
