#!/usr/bin/env bash
# Founder checklist script (phase-02 device-evidence split): resets gfxinfo counters, waits for a
# manual pan/zoom gesture on the map spike screen (apps/mobile/src/app/(dev)/spikes/map.tsx,
# Da Nang extract), then reads the janky-frame stats `dumpsys gfxinfo` computed from real frame
# timings. Run against a real Samsung Galaxy A15-class device per phase-02 open question 3 — an
# emulator's GPU path does not reproduce mid-range Android jank and its numbers do not count as
# fps evidence (docs/system-architecture.md, phase-02 "Device evidence").
#
# Usage: measure-pan-zoom-fps-android.sh [serial]
#   1. Open the map spike screen and let the style finish loading.
#   2. Run this script — it resets counters immediately, then waits for Enter.
#   3. Pan and pinch-zoom around the Da Nang extract for ~10s.
#   4. Press Enter — it prints the frame-stats summary (Number Missed Vsync, Number Slow UI thread,
#      Number Jank y, 90th/95th/99th percentile frame times).
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL="${1:-emulator-5554}"
PACKAGE="app.critterpass.dev"

"$ADB" -s "$SERIAL" shell dumpsys gfxinfo "$PACKAGE" reset
echo "Counters reset. Pan/pinch-zoom the map for ~10s, then press Enter." >&2
read -r _

"$ADB" -s "$SERIAL" shell dumpsys gfxinfo "$PACKAGE" framestats
