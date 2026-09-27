#!/usr/bin/env bash
# Rerun: tools/spikes/motion/measure-cold-start-android-emulator.sh [avd-serial]
# `am start -W` reports TotalTime (process start → first frame drawn) and WaitTime directly from the
# OS — no external trace-parsing needed. Requires the APK already installed (see
# tools/spikes/skia-critter/prebuild-and-assemble-android-debug.sh).
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL="${1:-emulator-5554}"
PACKAGE="app.critterpass.dev"
ACTIVITY=".MainActivity"

"$ADB" -s "$SERIAL" shell am force-stop "$PACKAGE"
"$ADB" -s "$SERIAL" shell am start -W -n "$PACKAGE/$ACTIVITY"
