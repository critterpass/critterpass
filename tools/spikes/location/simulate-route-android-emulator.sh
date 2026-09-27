#!/usr/bin/env bash
# Rerun: tools/spikes/location/simulate-route-android-emulator.sh [avd-serial]
# Feeds tools/spikes/location/sample-dwell-route.gpx into the running emulator via sequential
# `adb emu geo fix` calls (the emulator console has no GPX/route player, unlike simctl) — a real,
# scriptable stand-in for a walked route on the emulator.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL="${1:-emulator-5554}"
GPX="$(dirname "$0")/sample-dwell-route.gpx"
SLEEP_SECONDS=20

WAYPOINTS=$(python3 - "$GPX" <<'PYEOF'
import sys
import xml.etree.ElementTree as ET
ns = {"g": "http://www.topografix.com/GPX/1/1"}
tree = ET.parse(sys.argv[1])
for p in tree.findall(".//g:trkpt", ns):
    print(f"{p.get('lon')} {p.get('lat')}")
PYEOF
)

echo "$WAYPOINTS" | while read -r lon lat; do
  echo "geo fix $lon $lat"
  "$ADB" -s "$SERIAL" emu geo fix "$lon" "$lat"
  sleep "$SLEEP_SECONDS"
done

echo "Route finished on $SERIAL — open the location.tsx spike screen and watch the dwell ring."
