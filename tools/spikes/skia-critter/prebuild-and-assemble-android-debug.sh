#!/usr/bin/env bash
# Rerun: tools/spikes/skia-critter/prebuild-and-assemble-android-debug.sh
# Prebuilds the Android project and assembles the debug dev-client APK for the emulator only
# (arm64-v8a) — this machine has run low on disk before during the full 4-ABI native build, and the
# emulator only ever needs one ABI.
set -euo pipefail
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Users/quocs/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home"
cd "$(dirname "$0")/../../../apps/mobile"

MIN_FREE_GB=4
FREE_GB=$(df -g / | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  echo "BLOCKED: only ${FREE_GB} GB free (need >= ${MIN_FREE_GB} GB) — not starting an Android build." >&2
  exit 1
fi

npx expo prebuild --platform android --no-install

(cd android && ./gradlew :app:assembleDebug --console=plain -PreactNativeArchitectures=arm64-v8a)

APK_PATH=$(find android/app/outputs -iname 'app-debug.apk' | head -1)
if [ -z "$APK_PATH" ]; then
  echo "ASSEMBLE FAILED: no app-debug.apk found" >&2
  exit 1
fi
echo "APK_PATH=$(cd "$(dirname "$APK_PATH")" && pwd)/$(basename "$APK_PATH")"
