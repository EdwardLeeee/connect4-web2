from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

SESSION_COOKIE = "c4_session"
NICKNAME_PATTERN = re.compile(r"^[^\x00-\x1f\x7f]{1,18}$")


@dataclass
class Session:
    id: str
    nickname: str
    locale: str = "zh-TW"


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def resolve(self, token: str | None) -> tuple[Session, bool]:
        if token and token in self.sessions:
            return self.sessions[token], False
        session_id = secrets.token_urlsafe(32)
        suffix = secrets.randbelow(9000) + 1000
        session = Session(id=session_id, nickname=f"玩家 {suffix}")
        self.sessions[session_id] = session
        return session, True

    def get(self, token: str | None) -> Session | None:
        return self.sessions.get(token or "")

    def update(self, session: Session, nickname: str, locale: str) -> Session:
        clean_name = nickname.strip()
        if not NICKNAME_PATTERN.fullmatch(clean_name):
            raise ValueError("invalid_nickname")
        if locale not in {"zh-TW", "en"}:
            raise ValueError("invalid_locale")
        session.nickname = clean_name
        session.locale = locale
        return session
