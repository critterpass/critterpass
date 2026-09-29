#!/usr/bin/env bash
# One Android shard, run inside android-emulator-runner once the emulator has booted: install the
# patched APK (patch-android-apk.sh) and run the shard's flows.
#
#   tools/scripts/ci-device/android-device.sh <patched.apk> <out dir> "<flow.yaml …>"
#
# Env: APPEARANCE (light|dark), TSX_VERSION, and whatever the flows read (JS_COMMIT, OTP_TEST_CODE).
set -euo pipefail

apk=$1
out_dir=$2
flows=$3
here=$(cd "$(dirname "$0")" && pwd)
serial=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
mkdir -p "$out_dir"

adb -s "$serial" shell cmd uimode night "$([ "${APPEARANCE:-light}" = dark ] && echo yes || echo no)"
adb -s "$serial" install -r -g "$apk"
adb -s "$serial" shell getprop ro.product.cpu.abilist

# shellcheck disable=SC2086 # the flow list is intentionally word-split
npx --yes "tsx@${TSX_VERSION:-4}" "$here/run-shard.ts" --platform android --device "$serial" \
  --out "$out_dir" --env JS_COMMIT --env OTP_TEST_CODE $flows
