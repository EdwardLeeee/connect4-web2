"""The app's on-device AI (frontend/src/local) must play exactly like the server."""

import json
import re
from pathlib import Path

import local_parity
from connect4_app import difficulty
from connect4_app.domain import COLUMNS, ROWS
from connect4_app.manager import AI_MIN_THINK_SECONDS, AI_NICKNAMES
from connect4_app.sessions import DEFAULT_NICKNAMES, LOCALES, default_nickname

ROOT = Path(__file__).resolve().parents[1]
CONSTANTS = (ROOT / "frontend" / "src" / "local" / "constants.ts").read_text(encoding="utf-8")
PORT = (ROOT / "frontend" / "src" / "local" / "difficulty.ts").read_text(encoding="utf-8")


def ts_number(name: str, source: str = CONSTANTS) -> int:
    match = re.search(rf"export const {name} = (\d+);", source)
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

    for level, nickname in AI_NICKNAMES.items():
        assert re.search(rf'^  {level}: "{re.escape(nickname)}",$', CONSTANTS, re.M), level


def test_difficulty_constants_match_the_server() -> None:
    numbers = ["EASY_RANDOM_PERCENT", "NORMAL_OPENING_STONES", "NORMAL_MISTAKE_PERCENT"]
    for name in [*numbers, "NORMAL_MISTAKE_DEPTH"]:
        assert ts_number(name, PORT) == getattr(difficulty, name), name
    safe = re.search(r"export const EASY_RANDOM_IS_SAFE = (true|false);", PORT)
    assert safe and (safe.group(1) == "true") is difficulty.EASY_RANDOM_IS_SAFE

    levels = re.search(r"DIFFICULTIES: readonly Difficulty\[\] = \[([^\]]+)\]", PORT)
    assert levels and re.findall(r'"(\w+)"', levels.group(1)) == list(difficulty.DIFFICULTIES)
    # Each draw's salt is the same number on both sides.
    for name in ["RANDOM_OR_BEST", "WHICH_COLUMN", "MISTAKE_OR_BEST", "WHICH_MISTAKE"]:
        salt = re.search(rf"const {name} = (\d+)n;", PORT)
        assert salt and int(salt.group(1)) == getattr(difficulty, name), name


def test_the_difficulty_fixture_exercises_every_rule() -> None:
    fixture = json.loads((local_parity.FIXTURES / "difficulty-parity.json").read_text("utf-8"))
    seen = local_parity.difficulty_coverage(fixture)
    least = {
        "easy: win": 3,
        "easy: block": 3,
        "easy: best": 3,
        "easy: random, avoiding a column": 3,
        "easy: random": 3,
        "normal: opening": 3,
        "normal: win": 3,
        "normal: block": 3,
        "normal: best": 3,
        "normal: mistake asked, none found": 10,
        "normal: mistake next to a column that hands over a win": 10,
    }
    for rule, count in least.items():
        assert seen[rule] >= count, (rule, seen)
    taken = seen["normal: mistake"] + seen["normal: mistake next to a column that hands over a win"]
    assert taken >= 50, seen
    easy = [move["column"] for move in fixture["moves"] if move["difficulty"] == "easy"]
    assert set(range(7)) <= set(easy)
    # A column that hands over a win at once is never a mistake, at any depth.
    lists = fixture["mistakes"]
    assert all(not entry["columns"] for entry in lists if entry["depth"] == 1)
    assert sum(1 for entry in lists if entry["depth"] == 2 and entry["columns"]) >= 50
    assert sum(1 for entry in lists if entry["depth"] == 3 and entry["columns"]) >= 50


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
