#!/usr/bin/env bash
# Prepare App Store signing once the Apple Developer Program membership exists.
# docs/ios-apple-setup.md walks the account holder through Apple's websites between steps.
#
# Usage:
#   mobile/scripts/ios-signing.sh csr
#       make the private key and a certificate signing request, copied to Downloads
#   mobile/scripts/ios-signing.sh p12 <distribution.cer>
#       combine Apple's certificate with the private key into a .p12
#   mobile/scripts/ios-signing.sh secrets <profile.mobileprovision> <AuthKey_XXXX.p8> <key id> <issuer id> <team id>
#       move the downloads next to the key and store everything as GitHub secrets
#
# Everything secret stays in ~/.config/connect4-mobile/ios (mode 700), outside every
# repository, and reaches GitHub through stdin only. No Mac is needed.
set -euo pipefail

DIR="${HOME}/.config/connect4-mobile/ios"
DOWNLOADS="$(xdg-user-dir DOWNLOAD 2>/dev/null || echo "${HOME}/Downloads")"
PROFILE_NAME="Four In A Row App Store"

usage() {
    sed -n '5,11p' "$0" >&2
    exit 2
}

case "${1:-}" in csr | p12 | secrets) ;; *) usage ;; esac
umask 077
install -d -m 700 "${HOME}/.config/connect4-mobile" "${DIR}"

case "$1" in
    csr)
        if [ -e "${DIR}/distribution.key" ]; then
            echo "${DIR}/distribution.key already exists; move it away to start over" >&2
            exit 1
        fi
        # Apple's upload dialog expects the .certSigningRequest extension. The request is not
        # secret, so a copy goes to Downloads where the browser's file picker starts.
        csr="${DIR}/FourInARow.certSigningRequest"
        openssl req -new -newkey rsa:2048 -nodes -keyout "${DIR}/distribution.key" \
            -out "${csr}" -subj "/CN=Four In A Row Distribution/C=TW"
        cp "${csr}" "${DOWNLOADS}/"
        echo "upload ${DOWNLOADS}/$(basename "${csr}") as an Apple Distribution certificate request"
        ;;
    p12)
        cer="${2:-}"
        [ -f "${cer}" ] || usage
        openssl x509 -inform DER -in "${cer}" -out "${DIR}/distribution.pem"
        [ "${cer}" -ef "${DIR}/distribution.cer" ] || cp "${cer}" "${DIR}/distribution.cer"
        openssl rand -base64 24 | tr -d '\n' > "${DIR}/p12-password.txt"
        # -legacy keeps the SHA-1/3DES encoding that every macOS keychain can import.
        openssl pkcs12 -export -legacy -inkey "${DIR}/distribution.key" -in "${DIR}/distribution.pem" \
            -out "${DIR}/distribution.p12" -passout "file:${DIR}/p12-password.txt"
        echo "wrote ${DIR}/distribution.p12"
        ;;
    secrets)
        [ "$#" -eq 6 ] || usage
        profile="$2" p8="$3" key_id="$4" issuer_id="$5" team_id="$6"
        [ -f "${DIR}/distribution.p12" ] || { echo "run the p12 step first" >&2; exit 1; }
        name="$(openssl smime -inform der -verify -noverify -in "${profile}" 2>/dev/null \
            | sed -n '/<key>Name<\/key>/{n;s/.*<string>\(.*\)<\/string>.*/\1/p;}')"
        if [ "${name}" != "${PROFILE_NAME}" ]; then
            echo "the profile is named '${name}'; the Xcode project expects '${PROFILE_NAME}'" >&2
            exit 1
        fi
        # Move the downloads here so the one-time .p8 does not linger in Downloads.
        [ "${profile}" -ef "${DIR}/app-store.mobileprovision" ] || mv "${profile}" "${DIR}/app-store.mobileprovision"
        key="${DIR}/$(basename "${p8}")"
        [ "${p8}" -ef "${key}" ] || mv "${p8}" "${key}"

        REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
        base64 -w0 "${DIR}/distribution.p12" | gh secret set IOS_DIST_CERT_P12_BASE64 --repo "${REPO}"
        gh secret set IOS_DIST_CERT_P12_PASSWORD --repo "${REPO}" < "${DIR}/p12-password.txt"
        base64 -w0 "${DIR}/app-store.mobileprovision" | gh secret set IOS_PROFILE_BASE64 --repo "${REPO}"
        base64 -w0 "${key}" | gh secret set ASC_API_KEY_P8_BASE64 --repo "${REPO}"
        printf '%s' "${key_id}" | gh secret set ASC_API_KEY_ID --repo "${REPO}"
        printf '%s' "${issuer_id}" | gh secret set ASC_API_ISSUER_ID --repo "${REPO}"
        printf '%s' "${team_id}" | gh secret set APPLE_TEAM_ID --repo "${REPO}"
        echo "iOS secrets stored; back up ${DIR} (the .p8 cannot be downloaded again)"
        ;;
    *)
        usage
        ;;
esac
