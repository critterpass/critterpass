#!/usr/bin/env bash
# Turns an e2e-test APK into one that runs this commit's JS, and nothing else.
#
#   tools/scripts/ci-device/patch-android-apk.sh <in.apk> <index.android.bundle> <out.apk>
#
# Replaces assets/index.android.bundle and, in the compiled manifest, sets
# expo.modules.updates.ENABLED to false (so the app never loads whatever was last published to the
# shared e2e-test channel) and extractNativeLibs to true; then
# zipaligns and signs the APK with a throwaway debug key. Needs ANDROID_HOME (build-tools), Java and
# `npx tsx`. New image assets that the APK's resources lack cannot be added this way: Android
# resolves bundled images from compiled resources.
set -euo pipefail

abs() { (cd "$(dirname "$1")" && echo "$PWD/$(basename "$1")"); }
in_apk=$(abs "$1")
bundle=$(abs "$2")
out_apk=$(abs "$3")
here=$(cd "$(dirname "$0")" && pwd)
build_tools=$(printf '%s\n' "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp "$in_apk" "$work/app.apk"
(cd "$work" && unzip -q -o app.apk AndroidManifest.xml)
manifest() { npx --yes "tsx@${TSX_VERSION:-4}" "$here/android-manifest.ts" "$work/AndroidManifest.xml" "$@"; }
manifest meta-data:expo.modules.updates.ENABLED false
# The build ships arm64-v8a libraries only, stored uncompressed and loaded straight from the APK.
# On an x86_64 emulator SoLoader then looks for lib/x86_64 in the APK and fails; extracted, the
# libraries land in the app's lib/arm64 directory, where ARM translation loads them.
manifest application@extractNativeLibs true

mkdir -p "$work/assets"
cp "$bundle" "$work/assets/index.android.bundle"
# Old signatures and the replaced entries go; the bundle is stored uncompressed like the original.
zip -q -d "$work/app.apk" 'META-INF/*' AndroidManifest.xml assets/index.android.bundle
(cd "$work" && zip -q app.apk AndroidManifest.xml && zip -q -0 app.apk assets/index.android.bundle)

"$build_tools/zipalign" -p -f 4 "$work/app.apk" "$work/aligned.apk"
keytool -genkeypair -keystore "$work/debug.keystore" -storepass android -keypass android \
  -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 \
  -dname 'CN=Android Debug,O=Android,C=US' >/dev/null 2>&1
"$build_tools/apksigner" sign --ks "$work/debug.keystore" --ks-pass pass:android \
  --key-pass pass:android --out "$out_apk" "$work/aligned.apk"
"$build_tools/apksigner" verify "$out_apk"
echo "$out_apk"
