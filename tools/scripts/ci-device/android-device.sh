#!/usr/bin/env bash
# One Android shard, run inside android-emulator-runner once the emulator has booted: settle the
# device, check it reaches the api (network-preflight.ts), install the patched APK
# (patch-android-apk.sh), check the app starts, then run the flows.
#
#   tools/scripts/ci-device/android-device.sh <patched.apk> <out dir> "<flow.yaml …>"
#
# Env: APPEARANCE (light|dark), RECORD_VIDEO, SAVE_HIERARCHY, TSX_VERSION, E2E_API_BASE_URL (the api
# the pre-flight reaches), FLOW_TIMEOUT_MINUTES, and whatever the flows read (JS_COMMIT, OTP_TEST_CODE).
set -euo pipefail

apk=$1
out_dir=$2
flows=$3
package=app.critterpass.dev
here=$(cd "$(dirname "$0")" && pwd)
serial=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
mkdir -p "$out_dir"
device() { adb -s "$serial" shell "$@"; }

# sys.boot_completed comes before the package manager and the launcher are ready to take work.
for _ in $(seq 1 60); do
  device pm path android >/dev/null 2>&1 && [ "$(device getprop init.svc.bootanim | tr -d '\r')" != running ] && break
  sleep 2
done

# No lock screen, screen always on, no install verification, no first-use hints, and no
# "isn't responding" dialogs: a slow software-rendered emulator often trips an ANR in the launcher,
# and the dialog covers the app for the rest of the flow.
device settings put global hide_error_dialogs 1
device settings put secure anr_show_background 0
device locksettings set-disabled true || true
device svc power stayon true
device settings put system screen_off_timeout 2147483647
device settings put global verifier_verify_adb_installs 0
device settings put global package_verifier_enable 0
device settings put secure immersive_mode_confirmations confirmed
device input keyevent 82
device cmd uimode night "$([ "${APPEARANCE:-light}" = dark ] && echo yes || echo no)"

# The emulator must resolve and reach the api before anything else is worth doing: without it every
# flow waits out its longest timeout on data that cannot arrive.
npx --yes "tsx@${TSX_VERSION:-4}" "$here/network-preflight.ts" --platform android --device "$serial" \
  --url "${E2E_API_BASE_URL:-}"

# A full (not incremental) install, so the manifest's extractNativeLibs is honoured at install time;
# -g grants every runtime permission.
adb -s "$serial" install --no-incremental -r -g "$apk"
# Notifications start undecided, as on a fresh install, so the permission primer flows see the OS
# prompt still to come (a grant from -g, once Maestro unsets it, would read as blocked instead).
device pm revoke "$package" android.permission.POST_NOTIFICATIONS || true
device pm clear-permission-flags "$package" android.permission.POST_NOTIFICATIONS \
  user-set user-fixed review-required || true
echo "Device ABIs: $(device getprop ro.product.cpu.abilist | tr -d '\r')"
device dumpsys package "$package" | grep -E 'primaryCpuAbi|legacyNativeLibraryDir|flags=' | head -4 || true

# Launch once outside Maestro: a native crash on start is reported here in seconds, with its log,
# instead of as a missing element after every flow's timeout.
device am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb -s "$serial" logcat -c
device monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
started=false
for _ in $(seq 1 30); do
  sleep 2
  if device pidof "$package" >/dev/null 2>&1 && device dumpsys activity activities | grep -q "topResumedActivity.*$package"; then
    started=true
    break
  fi
done
sleep 5
if [ "$started" != true ] || ! device pidof "$package" >/dev/null 2>&1; then
  mkdir -p "$out_dir/failures"
  adb -s "$serial" logcat -d -b all >"$out_dir/failures/launch.logcat.txt" || true
  adb -s "$serial" exec-out screencap -p >"$out_dir/failures/launch.png" || true
  echo "::error title=App did not start::$package is not running after launch"
  adb -s "$serial" logcat -d -b crash | tail -60
  grep -E 'SoLoader|DSO|FATAL|AndroidRuntime' "$out_dir/failures/launch.logcat.txt" | tail -40 || true
  exit 1
fi
echo "App started ($(device dumpsys window | grep -m1 mCurrentFocus | tr -d '\r' | xargs))"
device am force-stop "$package"

# RECORD_VIDEO=true records every flow (the release gate).
video=$([ "${RECORD_VIDEO:-}" = true ] && echo --video || true)
# shellcheck disable=SC2086 # the flow list is intentionally word-split
npx --yes "tsx@${TSX_VERSION:-4}" "$here/run-shard.ts" --platform android --device "$serial" \
  --out "$out_dir" --env JS_COMMIT --env OTP_TEST_CODE --env CREW_ID --env CREW_NAME $video $flows
