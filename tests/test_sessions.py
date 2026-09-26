import pytest
from connect4_app.sessions import Session, SessionStore


def test_session_tokens_are_opaque_and_reusable() -> None:
    store = SessionStore()
    session, created = store.resolve(None)
    assert created
    assert len(session.id) >= 40
    same, created_again = store.resolve(session.id)
    assert same is session
    assert not created_again


@pytest.mark.parametrize("nickname", ["", "a" * 19, "bad\nname"])
def test_invalid_nickname_is_rejected(nickname: str) -> None:
    store = SessionStore()
    session, _ = store.resolve(None)
    with pytest.raises(ValueError, match="invalid_nickname"):
        store.update(session, nickname, "zh-TW")


def default_session() -> tuple[SessionStore, Session]:
    store = SessionStore()
    session, _ = store.resolve(None)
    store.update(session, None, "zh-TW", 4821)
    return store, session


def test_a_new_session_has_a_chinese_default_nickname() -> None:
    session, _ = SessionStore().resolve(None)
    assert session.default_number in range(1000, 10000)
    assert session.nickname == f"玩家 {session.default_number}"
    assert session.locale == "zh-TW"


def test_a_default_number_names_the_player_in_their_language() -> None:
    store, session = default_session()
    store.update(session, "ignored", "en", 4821)
    assert (session.nickname, session.default_number) == ("Player 4821", 4821)
    store.update(session, None, "zh-TW", 5555)
    assert (session.nickname, session.default_number) == ("玩家 5555", 5555)


@pytest.mark.parametrize("sent", ["玩家 4821", "Player 4821", "  玩家 4821 "])
def test_an_older_client_resending_the_default_nickname_only_changes_the_language(
    sent: str,
) -> None:
    store, session = default_session()
    store.update(session, sent, "en")
    assert (session.nickname, session.default_number, session.locale) == (
        "Player 4821",
        4821,
        "en",
    )


@pytest.mark.parametrize("sent", ["Ada", "玩家 1234", "Player 1234"])
def test_an_older_client_sending_any_other_name_chooses_it(sent: str) -> None:
    store, session = default_session()
    store.update(session, sent, "en")
    assert (session.nickname, session.default_number) == (sent, None)


def test_an_explicit_null_keeps_a_name_that_looks_like_a_default_one() -> None:
    store, session = default_session()
    store.update(session, "玩家 4821", "zh-TW", None)
    assert session.default_number is None
    store.update(session, "玩家 4821", "en")
    assert (session.nickname, session.locale) == ("玩家 4821", "en")


def test_a_chosen_name_never_turns_back_into_a_default_one_by_itself() -> None:
    store, session = default_session()
    store.update(session, "Ada", "zh-TW", None)
    store.update(session, "玩家 4821", "en")
    assert (session.nickname, session.default_number) == ("玩家 4821", None)


@pytest.mark.parametrize("number", [999, 10000, -1, True, "4821", 4821.0, [4821]])
def test_invalid_default_numbers_are_rejected_without_changes(number: object) -> None:
    store, session = default_session()
    with pytest.raises(ValueError, match="invalid_default_number"):
        store.update(session, None, "en", number)
    assert (session.nickname, session.locale, session.default_number) == (
        "玩家 4821",
        "zh-TW",
        4821,
    )


def test_a_bad_locale_changes_nothing() -> None:
    store, session = default_session()
    with pytest.raises(ValueError, match="invalid_locale"):
        store.update(session, None, "fr", 1234)
    assert (session.nickname, session.default_number) == ("玩家 4821", 4821)


def test_a_missing_nickname_without_a_default_number_is_invalid() -> None:
    store, session = default_session()
    with pytest.raises(ValueError, match="invalid_nickname"):
        store.update(session, None, "en")
