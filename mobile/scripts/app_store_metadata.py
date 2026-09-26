#!/usr/bin/env python3
"""Upload the App Store listing from mobile/store/app-store/ through the App Store Connect API.

Usage:
  mobile/scripts/app_store_metadata.py --version 3.2.0 [--build 7]          # dry run (default)
  mobile/scripts/app_store_metadata.py --version 3.2.0 [--build 7] --apply  # upload

The dry run only reads App Store Connect and prints every change it would make. --apply refuses
to run unless mobile/store/app-store/status.json says "approved" and every required text is filled
in; it asks for the review contact details at run time (they never go into the repository) and
asks for confirmation before it writes anything. It never submits the version for review.

Credentials: ~/.config/connect4-mobile/ios/asc.json ({"key_id": ..., "issuer_id": ...}) and the
matching AuthKey_<key_id>.p8 next to it. Needs PyJWT and cryptography.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt

API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "com.oraclelee.connect4"
STORE = Path(__file__).resolve().parents[1] / "store" / "app-store"
CREDENTIALS = Path.home() / ".config" / "connect4-mobile" / "ios"
LOCALES = ("en-US", "zh-Hant")
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"}
# 6.9" iPhone screenshots (1320x2868, 1290x2796, 1260x2736). Apple's enum still lists them as
# APP_IPHONE_67; confirm on the first real upload.
SCREENSHOT_TYPE = "APP_IPHONE_67"
SCREENSHOT_SIZES = {(1320, 2868), (1290, 2796), (1260, 2736)}

# file name -> (API attribute, resource, max characters, required)
FIELDS = {
    "name.txt": ("name", "appInfo", 30, True),
    "subtitle.txt": ("subtitle", "appInfo", 30, False),
    "privacy_policy_url.txt": ("privacyPolicyUrl", "appInfo", 255, True),
    "description.txt": ("description", "version", 4000, True),
    "keywords.txt": ("keywords", "version", 100, True),
    "promotional_text.txt": ("promotionalText", "version", 170, False),
    "support_url.txt": ("supportUrl", "version", 255, True),
}
FORBIDDEN = ("connect 4", "connect four", "connect4")  # Hasbro trademark; Apple 2.3.7


class Api:
    def __init__(self) -> None:
        config = json.loads((CREDENTIALS / "asc.json").read_text())
        self.key_id = config["key_id"]
        self.issuer_id = config["issuer_id"]
        self.key = (CREDENTIALS / f"AuthKey_{self.key_id}.p8").read_text()

    def _token(self) -> str:
        now = int(time.time())
        return jwt.encode(
            {"iss": self.issuer_id, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
            self.key,
            algorithm="ES256",
            headers={"kid": self.key_id, "typ": "JWT"},
        )

    def call(self, method: str, path: str, body: dict | None = None) -> dict | None:
        request = urllib.request.Request(
            API + path,
            method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {self._token()}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            if method == "GET" and error.code == 404:
                return None
            sys.exit(f"{method} {path} failed with HTTP {error.code}:\n{detail}")
        return json.loads(raw) if raw else None

    def get(self, path: str) -> dict | None:
        return self.call("GET", path)


def read_listing() -> tuple[dict[str, dict[str, str]], str, list[str]]:
    """Return {locale: {file: text}}, the review notes and a list of problems."""
    problems: list[str] = []
    listing: dict[str, dict[str, str]] = {}
    for locale in LOCALES:
        listing[locale] = {}
        for name, (_attr, _resource, limit, required) in FIELDS.items():
            text = (STORE / locale / name).read_text(encoding="utf-8").strip()
            listing[locale][name] = text
            if required and not text:
                problems.append(f"{locale}/{name} is empty")
            if len(text) > limit:
                problems.append(f"{locale}/{name} has {len(text)} characters (limit {limit})")
            if name.endswith("_url.txt") and text and not text.startswith("https://"):
                problems.append(f"{locale}/{name} is not an https:// URL")
            if name in ("name.txt", "subtitle.txt", "keywords.txt") and any(
                word in text.lower() for word in FORBIDDEN
            ):
                problems.append(f"{locale}/{name} mentions Connect 4 (Hasbro trademark)")
    notes = (STORE / "review_notes.txt").read_text(encoding="utf-8").strip()
    if not notes:
        problems.append("review_notes.txt is empty")
    if len(notes) > 4000:
        problems.append(f"review_notes.txt has {len(notes)} characters (limit 4000)")
    return listing, notes, problems


def png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    return struct.unpack(">II", header[16:24])


def read_screenshots() -> tuple[dict[str, list[Path]], list[str]]:
    problems: list[str] = []
    shots: dict[str, list[Path]] = {}
    for locale in LOCALES:
        files = sorted((STORE / "screenshots" / locale).glob("*.png"))
        shots[locale] = files
        if len(files) > 10:
            problems.append(f"screenshots/{locale} has {len(files)} files (limit 10)")
        for path in files:
            try:
                size = png_size(path)
            except ValueError as error:
                problems.append(str(error))
                continue
            if size not in SCREENSHOT_SIZES:
                problems.append(f"{path.name} is {size[0]}x{size[1]}, not a 6.9-inch iPhone size")
    return shots, problems


def short(text: str | None, width: int = 70) -> str:
    if not text:
        return "(empty)"
    flat = " ".join(text.split())
    return flat if len(flat) <= width else flat[: width - 1] + "…"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--version", required=True, help="App version to submit, e.g. 3.2.0")
    parser.add_argument(
        "--build", help="Build number (default: the newest VALID build of --version)"
    )
    parser.add_argument(
        "--apply", action="store_true", help="Upload instead of the default dry run"
    )
    args = parser.parse_args()

    status = json.loads((STORE / "status.json").read_text(encoding="utf-8"))["status"]
    listing, notes, problems = read_listing()
    shots, shot_problems = read_screenshots()
    problems += shot_problems

    api = Api()
    apps = api.get(f"/apps?filter[bundleId]={BUNDLE_ID}")["data"]
    if not apps:
        sys.exit(f"no App Store Connect app for {BUNDLE_ID}")
    app_id = apps[0]["id"]
    versions = api.get(f"/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=20")["data"]
    editable = [v for v in versions if v["attributes"]["appStoreState"] in EDITABLE]
    if not editable:
        sys.exit("no App Store version is open for editing")
    version = editable[0]
    build_filter = f"filter[app]={app_id}&filter[preReleaseVersion.version]={args.version}"
    build_filter += "&filter[processingState]=VALID&sort=-uploadedDate&limit=1"
    if args.build:
        build_filter += f"&filter[version]={args.build}"
    builds = api.get(f"/builds?{build_filter}")["data"]
    current_build = api.get(f"/appStoreVersions/{version['id']}/build")
    app_info = api.get(f"/apps/{app_id}/appInfos")["data"][0]
    info_locs = {
        loc["attributes"]["locale"]: loc
        for loc in api.get(f"/appInfos/{app_info['id']}/appInfoLocalizations")["data"]
    }
    version_locs = {
        loc["attributes"]["locale"]: loc
        for loc in api.get(f"/appStoreVersions/{version['id']}/appStoreVersionLocalizations")[
            "data"
        ]
    }
    review = api.get(f"/appStoreVersions/{version['id']}/appStoreReviewDetail")
    review = review["data"] if review else None

    plan: list[tuple[str, str, dict]] = []  # (description, kind, payload)
    print(f"App: {apps[0]['attributes']['name']} ({app_id}); listing status: {status}")
    if version["attributes"]["versionString"] != args.version:
        plan.append(
            (f"version {version['attributes']['versionString']} → {args.version}", "version", {})
        )
    if not builds:
        problems.append(
            f"no VALID build of {args.version}" + (f" ({args.build})" if args.build else "")
        )
    else:
        build = builds[0]
        now = current_build["data"]["id"] if current_build and current_build["data"] else None
        if now != build["id"]:
            plan.append(
                (f"select build {args.version} ({build['attributes']['version']})", "build", build)
            )

    for locale in LOCALES:
        for resource, existing in (
            ("appInfo", info_locs.get(locale)),
            ("version", version_locs.get(locale)),
        ):
            wanted = {
                FIELDS[name][0]: text
                for name, text in listing[locale].items()
                if FIELDS[name][1] == resource and text
            }
            if existing is None:
                if wanted:
                    fields = ", ".join(f"{k}={short(v, 40)}" for k, v in wanted.items())
                    plan.append(
                        (
                            f"create {resource} {locale}: {fields}",
                            f"create-{resource}",
                            {"locale": locale, **wanted},
                        )
                    )
                continue
            changes = {k: v for k, v in wanted.items() if existing["attributes"].get(k) != v}
            for key, value in changes.items():
                before = short(existing["attributes"].get(key))
                plan.append((f"{resource} {locale} {key}: {before} → {short(value)}", "noop", {}))
            if changes:
                plan.append(
                    (
                        f"  → update {resource} {locale}",
                        f"update-{resource}",
                        {"id": existing["id"], **changes},
                    )
                )

    old_notes = review["attributes"].get("notes") if review else None
    if old_notes != notes:
        plan.append((f"review notes: {short(old_notes)} → {short(notes)}", "review", {}))
    plan.append(("review contact name, phone and email: asked at run time", "review", {}))

    for locale in LOCALES:
        if shots[locale]:
            names = ", ".join(p.name for p in shots[locale])
            plan.append(
                (
                    f"replace {locale} {SCREENSHOT_TYPE} screenshots with: {names}",
                    "screenshots",
                    {"locale": locale},
                )
            )

    print("\nPlanned changes:")
    for description, _kind, _payload in plan:
        print(f"  - {description}")
    if problems:
        print("\nProblems (must be fixed before --apply):")
        for problem in problems:
            print(f"  ! {problem}")

    if not args.apply:
        print("\nDry run: nothing was sent. Submitting for review is always done by hand.")
        return
    if status != "approved":
        sys.exit("\nstatus.json is not 'approved'; only the dry run is allowed")
    if problems:
        sys.exit("\nfix the problems above first")

    contact = {
        "contactFirstName": os.environ.get("C4_REVIEW_FIRST_NAME")
        or input("Review contact first name: "),
        "contactLastName": os.environ.get("C4_REVIEW_LAST_NAME")
        or input("Review contact last name: "),
        "contactPhone": os.environ.get("C4_REVIEW_PHONE")
        or input("Review contact phone (+886…): "),
        "contactEmail": os.environ.get("C4_REVIEW_EMAIL") or input("Review contact email: "),
    }
    if input("\nType UPLOAD to write these changes to App Store Connect: ").strip() != "UPLOAD":
        sys.exit("cancelled; nothing was sent")

    vid = version["id"]
    if any(kind == "version" for _d, kind, _p in plan):
        api.call(
            "PATCH",
            f"/appStoreVersions/{vid}",
            {
                "data": {
                    "type": "appStoreVersions",
                    "id": vid,
                    "attributes": {"versionString": args.version},
                }
            },
        )
    for _d, kind, payload in plan:
        if kind == "build":
            api.call(
                "PATCH",
                f"/appStoreVersions/{vid}/relationships/build",
                {"data": {"type": "builds", "id": payload["id"]}},
            )
        elif kind == "create-appInfo":
            api.call(
                "POST",
                "/appInfoLocalizations",
                {
                    "data": {
                        "type": "appInfoLocalizations",
                        "attributes": payload,
                        "relationships": {
                            "appInfo": {"data": {"type": "appInfos", "id": app_info["id"]}}
                        },
                    }
                },
            )
        elif kind == "update-appInfo":
            loc_id = payload.pop("id")
            api.call(
                "PATCH",
                f"/appInfoLocalizations/{loc_id}",
                {"data": {"type": "appInfoLocalizations", "id": loc_id, "attributes": payload}},
            )
        elif kind == "create-version":
            created = api.call(
                "POST",
                "/appStoreVersionLocalizations",
                {
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "attributes": payload,
                        "relationships": {
                            "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}
                        },
                    }
                },
            )
            version_locs[payload["locale"]] = created["data"]
        elif kind == "update-version":
            loc_id = payload.pop("id")
            api.call(
                "PATCH",
                f"/appStoreVersionLocalizations/{loc_id}",
                {
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "id": loc_id,
                        "attributes": payload,
                    }
                },
            )

    review_attrs = {**contact, "demoAccountRequired": False, "notes": notes}
    if review:
        api.call(
            "PATCH",
            f"/appStoreReviewDetails/{review['id']}",
            {
                "data": {
                    "type": "appStoreReviewDetails",
                    "id": review["id"],
                    "attributes": review_attrs,
                }
            },
        )
    else:
        api.call(
            "POST",
            "/appStoreReviewDetails",
            {
                "data": {
                    "type": "appStoreReviewDetails",
                    "attributes": review_attrs,
                    "relationships": {
                        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}
                    },
                }
            },
        )

    for locale in LOCALES:
        if shots[locale]:
            upload_screenshots(api, version_locs[locale]["id"], shots[locale])

    print("\nUploaded. Review it in App Store Connect; submitting for review is done by hand.")


def upload_screenshots(api: Api, localization_id: str, files: list[Path]) -> None:
    sets = api.get(f"/appStoreVersionLocalizations/{localization_id}/appScreenshotSets")["data"]
    target = next(
        (s for s in sets if s["attributes"]["screenshotDisplayType"] == SCREENSHOT_TYPE), None
    )
    if target is None:
        target = api.call(
            "POST",
            "/appScreenshotSets",
            {
                "data": {
                    "type": "appScreenshotSets",
                    "attributes": {"screenshotDisplayType": SCREENSHOT_TYPE},
                    "relationships": {
                        "appStoreVersionLocalization": {
                            "data": {"type": "appStoreVersionLocalizations", "id": localization_id}
                        }
                    },
                }
            },
        )["data"]
    for old in api.get(f"/appScreenshotSets/{target['id']}/appScreenshots")["data"]:
        api.call("DELETE", f"/appScreenshots/{old['id']}")
    for path in files:
        data = path.read_bytes()
        shot = api.call(
            "POST",
            "/appScreenshots",
            {
                "data": {
                    "type": "appScreenshots",
                    "attributes": {"fileName": path.name, "fileSize": len(data)},
                    "relationships": {
                        "appScreenshotSet": {
                            "data": {"type": "appScreenshotSets", "id": target["id"]}
                        }
                    },
                }
            },
        )["data"]
        for op in shot["attributes"]["uploadOperations"]:
            chunk = data[op["offset"] : op["offset"] + op["length"]]
            headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
            request = urllib.request.Request(
                op["url"], data=chunk, method=op["method"], headers=headers
            )
            with urllib.request.urlopen(request, timeout=120):
                pass
        api.call(
            "PATCH",
            f"/appScreenshots/{shot['id']}",
            {
                "data": {
                    "type": "appScreenshots",
                    "id": shot["id"],
                    "attributes": {
                        "uploaded": True,
                        "sourceFileChecksum": hashlib.md5(data).hexdigest(),
                    },
                }
            },
        )
        print(f"  uploaded {path.name}")


if __name__ == "__main__":
    main()
