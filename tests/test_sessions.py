import pytest
from connect4_app.sessions import SessionStore


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
