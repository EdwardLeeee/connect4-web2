from __future__ import annotations

from dataclasses import dataclass

try:
    from . import _solver as native
except ImportError as error:  # The health endpoint reports this; gameplay never falls back.
    native = None
    _IMPORT_ERROR: ImportError | None = error
else:
    _IMPORT_ERROR = None


class SolverUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class SolverStatus:
    ready: bool
    engine: str
    version: str
    guarantee: str
    error: str | None = None
    # The precomputed exact scores for the positions the AI meets after 9, 11 and 13 moves.
    reply_table_loaded: bool = False
    reply_table_entries: int = 0


class PerfectSolver:
    """Thin adapter around the Rust exact solver. There is intentionally no fallback."""

    guarantee = "exact-perfect-play"

    def best_move(self, history: str) -> int:
        if native is None:
            raise SolverUnavailable(f"native solver unavailable: {_IMPORT_ERROR}")
        return int(native.best_move(history))

    def score_moves(self, history: str) -> list[int | None]:
        if native is None:
            raise SolverUnavailable(f"native solver unavailable: {_IMPORT_ERROR}")
        return list(native.score_moves(history))

    def status(self, *, self_test: bool = False) -> SolverStatus:
        if native is None:
            return SolverStatus(
                ready=False,
                engine="connect-four-ai",
                version="1.0.0",
                guarantee=self.guarantee,
                error=str(_IMPORT_ERROR),
            )
        try:
            engine, version, ready = native.engine_info()
            table_loaded, table_entries = native.reply_table_info()
            if self_test:
                move = self.best_move("4")
                ready = ready and 0 <= move < 7
            return SolverStatus(
                ready=bool(ready),
                engine=str(engine),
                version=str(version),
                guarantee=self.guarantee,
                reply_table_loaded=bool(table_loaded),
                reply_table_entries=int(table_entries),
            )
        except Exception as error:  # pragma: no cover - native failures are surfaced verbatim.
            return SolverStatus(
                ready=False,
                engine="connect-four-ai",
                version="1.0.0",
                guarantee=self.guarantee,
                error=str(error),
            )
