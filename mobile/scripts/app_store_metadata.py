#!/usr/bin/env python3
"""Upload the App Store listing from mobile/store/app-store/ through the App Store Connect API.

It also checks the Google Play assets in mobile/store/google-play/, which are uploaded by hand.

Usage:
  mobile/scripts/app_store_metadata.py --version 3.2.0 [--build 7]          # dry run (default)
  mobile/scripts/app_store_metadata.py --version 3.2.0 [--build 7] --apply  # upload
  mobile/scripts/app_store_metadata.py --check                              # files only, no API

--check reads no credentials and never contacts Apple: it checks the texts, screenshots, previews
and Google Play assets in the repository and exits 1 on any problem (the Mobile workflow runs it).

The dry run only reads App Store Connect and prints every change it would make. --apply refuses
to run unless mobile/store/app-store/status.json says "approved" and every required text is filled
in; it asks for the review contact details at run time (they never go into the repository) and
asks for confirmation before it writes anything. It never submits the version for review.

Credentials: ~/.config/connect4-mobile/ios/asc.json ({"key_id": ..., "issuer_id": ...}) and the
matching AuthKey_<key_id>.p8 next to it. Needs PyJWT and cryptography (not for --check) and
ffprobe (for previews).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "com.oraclelee.connect4"
STORE = Path(__file__).resolve().parents[1] / "store" / "app-store"
CREDENTIALS = Path.home() / ".config" / "connect4-mobile" / "ios"
LOCALES = ("en-US", "zh-Hant", "th")
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"}
# 6.9" iPhone screenshots (1320x2868, 1290x2796, 1260x2736). Apple's enum still lists them as
# APP_IPHONE_67; confirm on the first real upload.
SCREENSHOT_TYPE = "APP_IPHONE_67"
SCREENSHOT_SIZES = {(1320, 2868), (1290, 2796), (1260, 2736)}
# 6.9" app previews (App Store Connect Help, "App preview specifications"): 886x1920 portrait or
# 1920x886 landscape, 15-30 s, up to 30 fps, H.264 (High Profile, up to level 4.0) in .mov, .m4v or
# .mp4 or ProRes 422 HQ in .mov, 500 MB at most, an audio track (stereo AAC, 44.1 or 48 kHz; a
# silent one is fine). The API type name for 6.9" is not documented; IPHONE_67 is assumed like
# the screenshots and is confirmed on the first real upload.
PREVIEW_TYPE = "IPHONE_67"
PREVIEW_SIZES = {(886, 1920), (1920, 886)}
PREVIEW_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime"}
PLAY = STORE.parent / "google-play"
PLAY_LOCALES = ("en-US", "zh-TW", "th")

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
TRADEMARK_BLOCKED = ("name.txt", "subtitle.txt", "description.txt", "promotional_text.txt")
KEYWORD_TRADEMARK_NOTE = "使用者 2026-09-27 決定保留，退件就拿掉"


class Api:
    def __init__(self) -> None:
        config = json.loads((CREDENTIALS / "asc.json").read_text())
        self.key_id = config["key_id"]
        self.issuer_id = config["issuer_id"]
        self.key = (CREDENTIALS / f"AuthKey_{self.key_id}.p8").read_text()

    def _token(self) -> str:
        import jwt  # only the API needs it, so --check runs without PyJWT

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


def mentions_trademark(text: str) -> bool:
    return any(word in text.lower() for word in FORBIDDEN)


def read_listing() -> tuple[dict[str, dict[str, str]], str, list[str], list[str]]:
    """Return {locale: {file: text}}, the review notes, problems and warnings."""
    problems: list[str] = []
    warnings: list[str] = []
    listing: dict[str, dict[str, str]] = {}
    for locale in LOCALES:
        listing[locale] = {}
        for name, (_attr, _resource, limit, required) in FIELDS.items():
            file = STORE / locale / name
            text = file.read_text(encoding="utf-8").strip() if file.exists() else ""
            listing[locale][name] = text
            if required and not text:
                problems.append(f"{locale}/{name} is {'empty' if file.exists() else 'missing'}")
            if len(text) > limit:
                problems.append(f"{locale}/{name} has {len(text)} characters (limit {limit})")
            if name.endswith("_url.txt") and text and not text.startswith("https://"):
                problems.append(f"{locale}/{name} is not an https:// URL")
            if mentions_trademark(text) and name in TRADEMARK_BLOCKED:
                problems.append(f"{locale}/{name} mentions Connect 4 (Hasbro trademark)")
            elif mentions_trademark(text) and name == "keywords.txt":
                note = KEYWORD_TRADEMARK_NOTE
                warnings.append(f"{locale}/keywords.txt contains connect4 (Apple 2.3.7): {note}")
    notes = (STORE / "review_notes.txt").read_text(encoding="utf-8").strip()
    if not notes:
        problems.append("review_notes.txt is empty")
    if len(notes) > 4000:
        problems.append(f"review_notes.txt has {len(notes)} characters (limit 4000)")
    return listing, notes, problems, warnings


def png_info(path: Path) -> tuple[int, int, bool]:
    """Width, height and whether the PNG has an alpha channel (colour type 4 or 6, or tRNS)."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    width, height = struct.unpack(">II", data[16:24])
    return width, height, data[25] in (4, 6) or b"tRNS" in data[:4096]


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
                width, height, alpha = png_info(path)
            except ValueError as error:
                problems.append(str(error))
                continue
            if (width, height) not in SCREENSHOT_SIZES:
                problems.append(f"{path.name} is {width}x{height}, not a 6.9-inch iPhone size")
            if alpha:
                problems.append(f"{path.name} has an alpha channel (App Store rejects it)")
    return shots, problems


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ValueError(f"{path.name}: ffprobe failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def fps(rate: str) -> float:
    num, _, den = rate.partition("/")
    return float(num) / float(den or 1) if float(den or 1) else 0.0


def check_preview(path: Path) -> tuple[list[str], list[str]]:
    """Problems and warnings for one app preview against Apple's specification."""
    problems: list[str] = []
    warnings: list[str] = []
    name = path.name
    if path.suffix.lower() not in PREVIEW_TYPES:
        return [f"{name}: use .mp4, .m4v or .mov"], []
    info = probe(path)
    fmt = info.get("format", {})
    size = int(fmt.get("size", path.stat().st_size))
    duration = float(fmt.get("duration", 0))
    if size > 500 * 1024 * 1024:
        problems.append(f"{name}: {size / 1048576:.0f} MB (limit 500 MB)")
    if not 15 <= duration <= 30:
        problems.append(f"{name}: {duration:.2f} s long (must be 15-30 s)")
    videos = [s for s in info["streams"] if s.get("codec_type") == "video"]
    audios = [s for s in info["streams"] if s.get("codec_type") == "audio"]
    if len(videos) != 1:
        problems.append(f"{name}: {len(videos)} video streams (need exactly 1)")
    else:
        video = videos[0]
        dims = (video.get("width"), video.get("height"))
        if dims not in PREVIEW_SIZES:
            problems.append(f"{name}: {dims[0]}x{dims[1]} (need 886x1920 or 1920x886)")
        codec = video.get("codec_name")
        if codec == "h264":
            if (video.get("level") or 0) > 40:
                problems.append(f"{name}: H.264 level {video['level'] / 10} (at most 4.0)")
            if video.get("profile") != "High":
                warnings.append(f"{name}: H.264 profile {video.get('profile')} (Apple asks High)")
            if video.get("pix_fmt") != "yuv420p":
                warnings.append(f"{name}: pixel format {video.get('pix_fmt')} (yuv420p is safest)")
        elif codec == "prores":
            if path.suffix.lower() != ".mov":
                problems.append(f"{name}: ProRes must be in a .mov")
        else:
            problems.append(f"{name}: video codec {codec} (need H.264 or ProRes 422 HQ)")
        rate = max(fps(video.get("r_frame_rate", "0/1")), fps(video.get("avg_frame_rate", "0/1")))
        if rate > 30.01:
            problems.append(f"{name}: {rate:.2f} fps (at most 30)")
        bitrate = int(video.get("bit_rate") or fmt.get("bit_rate") or 0) / 1e6
        if codec == "h264" and bitrate > 12:
            warnings.append(f"{name}: video {bitrate:.1f} Mbps (Apple targets 10-12)")
    if not audios:
        problems.append(f"{name}: no audio track (add a silent stereo AAC track)")
    else:
        audio = audios[0]
        if audio.get("codec_name") != "aac":
            problems.append(f"{name}: audio codec {audio.get('codec_name')} (need AAC)")
        if audio.get("channels") != 2:
            problems.append(f"{name}: {audio.get('channels')} audio channels (need stereo)")
        if audio.get("sample_rate") not in ("44100", "48000"):
            problems.append(f"{name}: audio at {audio.get('sample_rate')} Hz (need 44.1 or 48 kHz)")
    return problems, warnings


def read_previews() -> tuple[dict[str, list[Path]], list[str], list[str]]:
    """previews/<locale>/ wins; a locale without its own videos uses previews/common/."""
    problems: list[str] = []
    warnings: list[str] = []
    previews: dict[str, list[Path]] = {}
    common = sorted(
        p
        for p in (STORE / "previews" / "common").glob("*")
        if p.is_file() and not p.name.startswith(".")
    )
    for locale in LOCALES:
        own = sorted(
            p
            for p in (STORE / "previews" / locale).glob("*")
            if p.is_file() and not p.name.startswith(".")
        )
        previews[locale] = own or common
    for files in {tuple(files) for files in previews.values() if files}:
        if len(files) > 3:
            problems.append(f"{len(files)} previews in one set (limit 3)")
        if any(True for _ in files):
            try:
                subprocess.run(["ffprobe", "-version"], capture_output=True, check=True)
            except (OSError, subprocess.CalledProcessError):
                return previews, ["ffprobe is needed to check the previews"], warnings
        for path in files:
            try:
                bad, soft = check_preview(path)
            except ValueError as error:
                bad, soft = [str(error)], []
            problems += bad
            warnings += soft
    return previews, problems, warnings


def check_play() -> list[str]:
    """Google Play assets are uploaded by hand; report what would not be accepted."""
    if not PLAY.is_dir():
        return []
    problems: list[str] = []
    limits = {"title.txt": 30, "short_description.txt": 80, "full_description.txt": 4000}
    for locale in PLAY_LOCALES:
        folder = PLAY / locale
        for name, limit in limits.items():
            file = folder / name
            if not file.exists():
                problems.append(f"google-play/{locale}/{name} is missing")
                continue
            text = file.read_text(encoding="utf-8").strip()
            if not text:
                problems.append(f"google-play/{locale}/{name} is empty")
            if len(text) > limit:
                problems.append(
                    f"google-play/{locale}/{name} has {len(text)} characters (limit {limit})"
                )
            if mentions_trademark(text):
                problems.append(
                    f"google-play/{locale}/{name} mentions Connect 4 (Hasbro trademark)"
                )
        graphic = folder / "feature-graphic.png"
        if not graphic.exists():
            problems.append(f"google-play/{locale}/feature-graphic.png is missing")
        else:
            width, height, alpha = png_info(graphic)
            if (width, height) != (1024, 500):
                problems.append(
                    f"google-play/{locale}/feature-graphic.png is {width}x{height} (need 1024x500)"
                )
            if alpha:
                problems.append(f"google-play/{locale}/feature-graphic.png has an alpha channel")
        shots = sorted((folder / "phone-screenshots").glob("*.png"))
        if not 2 <= len(shots) <= 8:
            problems.append(
                f"google-play/{locale}/phone-screenshots has {len(shots)} PNGs (need 2-8)"
            )
        for shot in shots:
            width, height, alpha = png_info(shot)
            if not (320 <= min(width, height) and max(width, height) <= 3840):
                problems.append(f"{shot.name}: {width}x{height} (each side 320-3840 px)")
            if max(width, height) > 2 * min(width, height):
                problems.append(f"{shot.name}: {width}x{height} is longer than 2:1")
            if alpha:
                problems.append(f"{shot.name}: has an alpha channel (Play needs 24-bit PNG)")
    return problems


def short(text: str | None, width: int = 70) -> str:
    if not text:
        return "(empty)"
    flat = " ".join(text.split())
    return flat if len(flat) <= width else flat[: width - 1] + "…"


def report(warnings: list[str], problems: list[str], play_problems: list[str]) -> None:
    if warnings:
        print("\nWarnings (do not block --apply):")
        for warning in warnings:
            print(f"  ~ {warning}")
    if problems:
        print("\nProblems (must be fixed before --apply):")
        for problem in problems:
            print(f"  ! {problem}")
    if PLAY.is_dir():
        print("\nGoogle Play assets (uploaded by hand in Play Console):")
        for problem in play_problems or ["all checks passed"]:
            print(f"  {'!' if play_problems else '-'} {problem}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--version", help="App version to submit, e.g. 3.2.0")
    parser.add_argument(
        "--build", help="Build number (default: the newest VALID build of --version)"
    )
    parser.add_argument(
        "--apply", action="store_true", help="Upload instead of the default dry run"
    )
    parser.add_argument(
        "--check", action="store_true", help="Check the files only, without credentials or the API"
    )
    args = parser.parse_args()
    if args.check and (args.apply or args.build or args.version):
        parser.error("--check takes no other option")
    if not args.check and not args.version:
        parser.error("--version is required unless --check")

    status = json.loads((STORE / "status.json").read_text(encoding="utf-8"))["status"]
    listing, notes, problems, warnings = read_listing()
    shots, shot_problems = read_screenshots()
    problems += shot_problems
    previews, preview_problems, preview_warnings = read_previews()
    problems += preview_problems
    warnings += preview_warnings
    play_problems = check_play()

    if args.check:
        print(f"Store files (listing status: {status}); nothing is read from App Store Connect")
        report(warnings, problems, play_problems)
        if problems or play_problems:
            sys.exit(1)
        print("\nAll store file checks passed.")
        return

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

    for locale in LOCALES:
        if previews[locale]:
            names = ", ".join(p.name for p in previews[locale])
            plan.append(
                (f"replace {locale} {PREVIEW_TYPE} app previews with: {names}", "previews", {})
            )

    print("\nPlanned changes:")
    for description, _kind, _payload in plan:
        print(f"  - {description}")
    report(warnings, problems, play_problems)

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
            # Creating an appInfo localization can make App Store Connect add this version's
            # localization for the same locale; update that one instead of creating a duplicate.
            existing = next(
                (
                    loc
                    for loc in api.get(f"/appStoreVersions/{vid}/appStoreVersionLocalizations")[
                        "data"
                    ]
                    if loc["attributes"]["locale"] == payload["locale"]
                ),
                None,
            )
            if existing:
                attributes = {k: v for k, v in payload.items() if k != "locale"}
                api.call(
                    "PATCH",
                    f"/appStoreVersionLocalizations/{existing['id']}",
                    {
                        "data": {
                            "type": "appStoreVersionLocalizations",
                            "id": existing["id"],
                            "attributes": attributes,
                        }
                    },
                )
                version_locs[payload["locale"]] = existing
                continue
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
        if previews[locale]:
            upload_previews(api, version_locs[locale]["id"], previews[locale])

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


def upload_asset(api: Api, kind: str, set_kind: str, set_id: str, path: Path, extra: dict) -> None:
    """Reserve, upload in the parts Apple asks for, then commit with the MD5 checksum."""
    data = path.read_bytes()
    asset = api.call(
        "POST",
        f"/{kind}",
        {
            "data": {
                "type": kind,
                "attributes": {"fileName": path.name, "fileSize": len(data), **extra},
                "relationships": {set_kind[:-1]: {"data": {"type": set_kind, "id": set_id}}},
            }
        },
    )["data"]
    for op in asset["attributes"]["uploadOperations"]:
        chunk = data[op["offset"] : op["offset"] + op["length"]]
        headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
        request = urllib.request.Request(
            op["url"], data=chunk, method=op["method"], headers=headers
        )
        with urllib.request.urlopen(request, timeout=300):
            pass
    api.call(
        "PATCH",
        f"/{kind}/{asset['id']}",
        {
            "data": {
                "type": kind,
                "id": asset["id"],
                "attributes": {
                    "uploaded": True,
                    "sourceFileChecksum": hashlib.md5(data).hexdigest(),
                },
            }
        },
    )
    print(f"  uploaded {path.name}")


def upload_previews(api: Api, localization_id: str, files: list[Path]) -> None:
    sets = api.get(f"/appStoreVersionLocalizations/{localization_id}/appPreviewSets")["data"]
    target = next((s for s in sets if s["attributes"]["previewType"] == PREVIEW_TYPE), None)
    if target is None:
        target = api.call(
            "POST",
            "/appPreviewSets",
            {
                "data": {
                    "type": "appPreviewSets",
                    "attributes": {"previewType": PREVIEW_TYPE},
                    "relationships": {
                        "appStoreVersionLocalization": {
                            "data": {"type": "appStoreVersionLocalizations", "id": localization_id}
                        }
                    },
                }
            },
        )["data"]
    for old in api.get(f"/appPreviewSets/{target['id']}/appPreviews")["data"]:
        api.call("DELETE", f"/appPreviews/{old['id']}")
    for path in files:
        mime = PREVIEW_TYPES[path.suffix.lower()]
        upload_asset(api, "appPreviews", "appPreviewSets", target["id"], path, {"mimeType": mime})


if __name__ == "__main__":
    main()
