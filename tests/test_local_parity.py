"""The app's on-device AI (frontend/src/local) must play exactly like the server."""

import json
import re
from pathlib import Path

import local_parity
from connect4_app.domain import COLUMNS, ROWS
from connect4_app.manager import AI_MIN_THINK_SECONDS

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
