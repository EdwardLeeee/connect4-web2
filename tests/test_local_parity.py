"""The app's on-device AI (frontend/src/local) must play exactly like the server."""

import json
import re
from pathlib import Path

import local_parity
from connect4_app.domain import COLUMNS, ROWS
from connect4_app.manager import AI_MIN_THINK_SECONDS
from connect4_app.sessions import DEFAULT_NICKNAMES, LOCALES, default_nickname

ROOT = Path(__file__).resolve().parents[1]
CONSTANTS = (ROOT / "frontend" / "src" / "local" / "constants.ts").read_text(encoding="utf-8")


def ts_number(name: str) -> int:
    match = re.search(rf"export const {name} = (\d+);", CONSTANTS)
    assert match, name
    return int(match.group(1))


def test_committed_fixtures_match_the_server() -> None:
    for name, data in local_parity.build().items():
        committed = json.loads((local_parity.FIXTURES / name).read_text(encoding="utf-8"))
        assert json.loads(local_parity.encode(data)) == committed, (
            f"{name} no longer matches the server: run `python tests/local_parity.py`"
        )


def test_constants_match_the_server() -> None:
    assert ts_number("AI_MIN_THINK_MS") == round(AI_MIN_THINK_SECONDS * 1000)
    assert (ts_number("ROWS"), ts_number("COLUMNS")) == (ROWS, COLUMNS)

    ts_order = re.search(r"CENTRE_FIRST: readonly number\[\] = \[([\d, ]+)\]", CONSTANTS)
    choice = (ROOT / "native_solver" / "src" / "choice.rs").read_text(encoding="utf-8")
    rust_order = re.search(r"CENTRE_FIRST: \[usize; 7\] = \[([\d, ]+)\]", choice)
    assert ts_order and rust_order
    assert ts_order.group(1).replace(" ", "") == rust_order.group(1).replace(" ", "")

    manager = (ROOT / "backend" / "connect4_app" / "manager.py").read_text(encoding="utf-8")
    nickname = re.search(r'AI_NICKNAME = "([^"]+)"', CONSTANTS)
    assert nickname and f'"nickname": "{nickname.group(1)}"' in manager


def test_the_wasm_engine_is_the_native_engine_version() -> None:
    package = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    wasm_version = package["dependencies"]["connect-four-ai-wasm"]
    for manifest in ["native_solver/Cargo.toml", "native_solver/tools/reply-table/Cargo.toml"]:
        cargo = (ROOT / manifest).read_text(encoding="utf-8")
        native = re.search(r'connect-four-ai = "=([\d.]+)"', cargo)
        assert native and native.group(1) == wasm_version, manifest


def i18n_locale_blocks() -> dict[str, str]:
    """The messages of each language in frontend/src/i18n.ts, keyed by locale."""
    i18n = (ROOT / "frontend" / "src" / "i18n.ts").read_text(encoding="utf-8")
    messages = i18n.split("const messages = {\n", 1)[1].split("\n} as const;", 1)[0]
    starts = list(re.finditer(r'^  "?([A-Za-z-]+)"?: \{$', messages, re.M))
    ends = [start.start() for start in starts[1:]] + [len(messages)]
    return {
        start.group(1): messages[start.end() : end] for start, end in zip(starts, ends, strict=True)
    }


def test_the_frontend_offers_exactly_the_servers_languages() -> None:
    assert sorted(i18n_locale_blocks()) == sorted(LOCALES)


def test_default_nicknames_match_the_frontend_wording() -> None:
    blocks = i18n_locale_blocks()
    for locale in LOCALES:
        assert locale in blocks, f"frontend/src/i18n.ts has no {locale} messages"
        match = re.search(r'session: \{.*?defaultNickname: "([^"]+)"', blocks[locale], re.S)
        assert match, locale
        assert match.group(1) == DEFAULT_NICKNAMES[locale]
    assert default_nickname(4821, "zh-TW") == "玩家 4821"
    assert default_nickname(4821, "en") == "Player 4821"
    assert default_nickname(4821, "th") == "ผู้เล่น 4821"
