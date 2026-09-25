#!/usr/bin/env bash
# Create the Google Play upload key once and hand it to GitHub Actions.
#
# Usage: mobile/scripts/android-upload-key.sh
#
# The keystore and its password stay in ~/.config/connect4-mobile/android (mode 700),
# outside every repository; back both up to a password manager. GitHub receives them
# through stdin only, so no secret appears in arguments, output or history. keytool runs
# in a throwaway Temurin container, so the host needs no JDK.
set -euo pipefail

DIR="${HOME}/.config/connect4-mobile/android"
IMAGE="docker.io/library/eclipse-temurin:21-jdk"
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

umask 077
install -d -m 700 "${HOME}/.config/connect4-mobile" "${DIR}"
if [ -e "${DIR}/upload-keystore.jks" ]; then
    echo "${DIR}/upload-keystore.jks already exists; an upload key is created only once" >&2
    exit 1
fi

keytool() {
    podman run --rm --userns=keep-id -v "${DIR}:/work" "${IMAGE}" keytool "$@"
}

# PKCS12 keystores use the store password for the key as well.
openssl rand -base64 32 | tr -d '\n' > "${DIR}/store-password.txt"
keytool -genkeypair -keystore /work/upload-keystore.jks -storetype PKCS12 -alias upload \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -dname "CN=Four In A Row Upload, O=connect4.oraclelee.com" \
    -storepass:file /work/store-password.txt -keypass:file /work/store-password.txt
# keytool writes with the container's umask (0644); the key must be private like the password.
chmod 600 "${DIR}/upload-keystore.jks"
fingerprint="$(keytool -list -v -keystore /work/upload-keystore.jks -alias upload \
    -storepass:file /work/store-password.txt | sed -n 's/^[[:space:]]*SHA256: //p')"
[ -n "${fingerprint}" ] || { echo "could not read the certificate fingerprint" >&2; exit 1; }

base64 -w0 "${DIR}/upload-keystore.jks" | gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64 --repo "${REPO}"
gh secret set ANDROID_UPLOAD_KEYSTORE_PASSWORD --repo "${REPO}" < "${DIR}/store-password.txt"
gh secret set ANDROID_UPLOAD_KEY_PASSWORD --repo "${REPO}" < "${DIR}/store-password.txt"
printf upload | gh secret set ANDROID_UPLOAD_KEY_ALIAS --repo "${REPO}"
# The fingerprint is public; the release workflow checks the signed bundle against it.
gh api --method POST "repos/${REPO}/actions/variables" \
    -f name=ANDROID_UPLOAD_CERT_SHA256 -f value="${fingerprint}" >/dev/null

echo "upload key created: ${DIR}/upload-keystore.jks"
echo "certificate SHA-256: ${fingerprint}"
echo "back up ${DIR}/upload-keystore.jks and ${DIR}/store-password.txt to a password manager"
