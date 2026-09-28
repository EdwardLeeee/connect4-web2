#!/usr/bin/env bash
# Offline smoke test on an Android emulator (run by the Mobile workflow inside
# reactivecircus/android-emulator-runner). The APK is a debug build whose API origin never
# resolves, so the run needs no network.
#   mobile/scripts/android-smoke.sh <app-debug.apk> <output dir>
# 1. The launcher names in the APK: default, zh and th.
# 2. A fresh install in English: offline lobby, default nickname, rename, an AI game, relaunch.
# 3. A fresh install per device language (en-US, zh-TW, th-TH): first screen and default nickname.
# Every part runs even when one fails; the exit status reports whether any failed.
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.oraclelee.connect4
mkdir -p "${OUT}"
exec > >(tee -a "${OUT}/smoke.log") 2>&1
failed=""

aapt2="$(find "${ANDROID_HOME:-${ANDROID_SDK_ROOT}}/build-tools" -name aapt2 -type f | sort -V | tail -n 1)"
badging="$("${aapt2}" dump badging "${APK}")"
for pair in "application-label:'Four In A Row'" "application-label-zh:'四子棋'" \
  "application-label-th:'เรียงสี่'"; do
  if grep -qF "${pair}" <<<"${badging}"; then
    echo "SMOKE launcher name ${pair}"
  else
    echo "::error::the APK has no ${pair}"
    failed="${failed} names"
  fi
done

fresh_install() {
  adb uninstall "${PKG}" >/dev/null 2>&1 || true
  adb install "${APK}" >/dev/null
}

# Changing persist.sys.locale takes effect when the framework restarts.
set_locale() {
  adb shell setprop persist.sys.locale "$1"
  adb shell setprop ctl.restart zygote
  sleep 5
  for _ in $(seq 1 60); do
    if [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] &&
      adb shell pm path android >/dev/null 2>&1 &&
      adb shell cmd activity get-current-user >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  sleep 5
  echo "SMOKE device locale $(adb shell getprop persist.sys.locale | tr -d '\r')"
}

adb root >/dev/null && adb wait-for-device

set_locale en-US
fresh_install
node mobile/scripts/android-smoke.mjs offline "${OUT}/offline" || failed="${failed} offline"

for entry in "en-US|Play now|Player|lang-en" "zh-TW|立即對戰|玩家|lang-zh" "th-TH|เล่นเลย|ผู้เล่น|lang-th"; do
  IFS='|' read -r locale play nickname run <<<"${entry}"
  set_locale "${locale}"
  fresh_install
  node mobile/scripts/android-smoke.mjs language "${OUT}/${run}" "${play}" "${nickname}" ||
    failed="${failed} ${locale}"
done

if [ -n "${failed}" ]; then
  echo "::error::Android smoke failed:${failed}"
  exit 1
fi
echo "SMOKE all Android checks passed"
