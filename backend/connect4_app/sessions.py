from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from enum import Enum
from typing import Literal

SESSION_COOKIE = "c4_session"
NICKNAME_PATTERN = re.compile(r"^[^\x00-\x1f\x7f]{1,18}$")
LOCALES = ("zh-TW", "en")
# docs/protocol.md "預設暱稱". frontend/src/i18n.ts session.defaultNickname must match;
# tests/test_local_parity.py checks it.
DEFAULT_NICKNAMES = {"zh-TW": "玩家 {n}", "en": "Player {n}"}
DEFAULT_NUMBERS = range(1000, 10000)


class _Unset(Enum):
    UNSET = "unset"


# A PATCH that leaves out default_number, as clients before 3.2.0 do, unlike an explicit null.
UNSET = _Unset.UNSET


def default_nickname(number: int, locale: str) -> str:
    return DEFAULT_NICKNAMES[locale].format(n=number)


@dataclass
class Session:
    id: str
    nickname: str
    locale: str = "zh-TW"
    # The number of a default nickname, which follows the locale; None once the player has
    # chosen a name of their own.
    default_number: int | None = None


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def resolve(self, token: str | None) -> tuple[Session, bool]:
        if token and token in self.sessions:
            return self.sessions[token], False
        session_id = secrets.token_urlsafe(32)
        number = secrets.randbelow(len(DEFAULT_NUMBERS)) + DEFAULT_NUMBERS.start
        session = Session(
            id=session_id,
            nickname=default_nickname(number, "zh-TW"),
            default_number=number,
        )
        self.sessions[session_id] = session
        return session, True

    def get(self, token: str | None) -> Session | None:
        return self.sessions.get(token or "")

    def update(
        self,
        session: Session,
        nickname: str | None,
        locale: str,
        default_number: object | Literal[_Unset.UNSET] = UNSET,
    ) -> Session:
        """Apply a profile update.

        An integer default_number keeps a default nickname with that number and ignores
        `nickname`. An explicit None marks `nickname` as the player's own, even if it looks
        like a default one. Without the field, re-sending the session's own default nickname
        in either language changes nothing but the language.
        """
        number: int | None
        if default_number is not UNSET and default_number is not None:
            # bool is an int subclass, but a JSON true is not a number.
            if type(default_number) is not int or default_number not in DEFAULT_NUMBERS:
                raise ValueError("invalid_default_number")
            number = default_number
            clean_name = ""
        else:
            clean_name = (nickname or "").strip()
            if not NICKNAME_PATTERN.fullmatch(clean_name):
                raise ValueError("invalid_nickname")
            number = None
            current = session.default_number
            if (
                default_number is UNSET
                and current is not None
                and clean_name in {default_nickname(current, other) for other in LOCALES}
            ):
                number = current
        if locale not in LOCALES:
            raise ValueError("invalid_locale")
        session.locale = locale
        session.default_number = number
        session.nickname = default_nickname(number, locale) if number is not None else clean_name
        return session
