"""Write design/tools/round2-jobs.json: every round-2 artboard (page ID x viewport).

Usage: python3 design/tools/round2-jobs.py
"""
import json
from pathlib import Path

VIEWPORTS = {
    "desktop-1440x900": dict(width=1440, height=900, vp="desktop"),
    "desktop-1366x768": dict(width=1366, height=768, vp="desktop"),
    "desktop-en-1440x900": dict(width=1440, height=900, vp="desktop", lang="en"),
    "tablet-768x1024": dict(width=768, height=1024, vp="tablet", mobile=True),
    "mobile-430x932": dict(width=430, height=932, vp="mobile", mobile=True),
    "mobile-en-430x932": dict(width=430, height=932, vp="mobile", mobile=True, lang="en"),
    "keyboard-430x932": dict(width=430, height=932, vp="keyboard", mobile=True),
    "safari-430x739": dict(width=430, height=739, vp="safari", mobile=True),
    "landscape-892x412": dict(width=892, height=412, vp="landscape", mobile=True),
}
D, D1366, DEN = "desktop-1440x900", "desktop-1366x768", "desktop-en-1440x900"
M, MEN, KB, SAF, LAND, TAB = (
    "mobile-430x932",
    "mobile-en-430x932",
    "keyboard-430x932",
    "safari-430x739",
    "landscape-892x412",
    "tablet-768x1024",
)

PAGES = [
    ("L01", "lobby-zh", [D, D1366]),
    ("L02", "lobby-en", [DEN, MEN]),
    ("L03", "lobby-tablet", [TAB]),
    ("L04", "lobby-collapsed", [M, SAF, LAND]),
    ("L05", "lobby-friends-expanded", [M]),
    ("L06", "lobby-matchmaking-expanded", [M]),
    ("L07", "lobby-offline", [D, M, MEN]),
    ("L08", "lobby-error-toast", [D, M]),
    ("L09", "profile-modal", [D]),
    ("L10", "profile-sheet-error", [M, KB]),
    ("L11", "lobby-invite-link", [D, M]),
    ("P01", "play-searching", [D, M]),
    ("P02", "play-waiting-friend", [D, M]),
    ("P03", "play-your-turn", [D, D1366, M, SAF, LAND]),
    ("P04", "play-opponent-turn", [D, M, LAND]),
    ("P05", "play-ai-thinking", [D, M]),
    ("P06", "play-opponent-paused", [D, M, MEN]),
    ("P07", "play-win", [D, D1366, M, SAF, LAND]),
    ("P08", "play-lose-ai", [D, M]),
    ("P09", "play-draw", [D, M]),
    ("P10", "play-forfeit-win", [D, M, MEN]),
    ("P11", "play-opponent-left", [D, M, MEN]),
    ("P12", "play-solver-error", [D, M, MEN]),
    ("P13", "play-rematch-sent", [D, M]),
    ("P14", "play-offline", [D, M]),
    ("P15", "play-other-tab", [D, M, MEN]),
    ("P16", "play-forfeit-lose", [D, M]),
    ("P17", "play-rematch-incoming", [D, M]),
    ("P18", "play-opponent-left-after-finish", [D, M]),
]

jobs = []
for page_id, slug, viewports in PAGES:
    for name in viewports:
        v = VIEWPORTS[name]
        lang = v.get("lang", "zh-TW")
        jobs.append(
            {
                "url": f"mockups/round2/screen.html?state={page_id}&vp={v['vp']}&lang={lang}",
                "out": f"{page_id}-{slug}-{name}.png",
                "width": v["width"],
                "height": v["height"],
                "mobile": v.get("mobile", False),
            }
        )
out = Path(__file__).with_name("round2-jobs.json")
out.write_text(json.dumps(jobs, indent=1) + "\n")
print(f"{len(jobs)} artboards -> {out}")
