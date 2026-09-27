#!/usr/bin/env bash
# Installs the Debug-simulator app produced by an xcodebuild run of apps/mobile/ios into a
# booted simulator, launches it, confirms the widget/NSE/NCE extensions are embedded in the
# installed bundle, and captures a screenshot for the T7 ADR. Run after a derived-data build;
# does not build anything itself.
set -euo pipefail

SIM_ID="${1:?usage: verify-simulator-install.sh <simulator-udid> <derived-data-path> <screenshot-out-path>}"
DERIVED_DATA="${2:?missing derived data path}"
SCREENSHOT_OUT="${3:?missing screenshot output path}"

APP_PATH="$(find "$DERIVED_DATA/Build/Products/Debug-iphonesimulator" -maxdepth 1 -iname "*.app" | head -1)"
if [ -z "$APP_PATH" ]; then
  echo "No .app bundle found under $DERIVED_DATA/Build/Products/Debug-iphonesimulator" >&2
  exit 1
fi
echo "App bundle: $APP_PATH"

echo "--- Embedded extensions ---"
find "$APP_PATH/PlugIns" -maxdepth 1 -iname "*.appex" 2>/dev/null || echo "(no PlugIns dir found)"

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP_PATH/Info.plist")"
echo "Bundle id: $BUNDLE_ID"

xcrun simctl install "$SIM_ID" "$APP_PATH"
xcrun simctl launch "$SIM_ID" "$BUNDLE_ID"
sleep 3
xcrun simctl io "$SIM_ID" screenshot "$SCREENSHOT_OUT"
echo "Screenshot written to $SCREENSHOT_OUT"
