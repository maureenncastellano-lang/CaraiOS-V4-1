"""
Governance — Secrets Vault.

Encrypts Flow script credentials at rest. Derives its Fernet key from
JWT_SECRET via a proper KDF rather than requiring yet another secret to be
configured and pinned — JWT_SECRET is already required to be set (Session 6
found the unpinned-default problem), so this reuses that requirement
instead of adding a second one a real deployment could just as easily
forget to set.

This is genuinely different from JWT signing: HMAC-signing a token and
Fernet-encrypting a credential are different cryptographic operations with
different key requirements, so the JWT_SECRET string is passed through
PBKDF2 first, not used directly as a Fernet key.
"""
import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken

from core.config import settings


def _derive_fernet_key() -> bytes:
    # PBKDF2-HMAC-SHA256, fixed salt (a per-secret random salt would need
    # its own storage, and the actual security boundary here is
    # "don't store secrets in plaintext in the DB," not "resist an
    # attacker who already has the derived key + your database" — assuming
    # JWT_SECRET itself is a strong, real random value, per Session 6/22's
    # .env.example guidance).
    salt = b"caraios-secrets-vault-v1"
    key = hashlib.pbkdf2_hmac("sha256", settings.JWT_SECRET.encode(), salt, 100_000)
    return base64.urlsafe_b64encode(key)


_fernet = Fernet(_derive_fernet_key())


async def get_user_secrets_dict(db, user_id: str) -> dict[str, str]:
    """Fetches and decrypts all of a user's stored secrets, keyed by name,
    for injection into a script's environment at execution time (see
    api/routes/scripts.py's run_script and governance/sandbox.py's
    _build_safe_env, which prefixes each key as SECRET_<NAME>). A secret
    that fails to decrypt (see decrypt()'s ValueError above) is skipped
    with a logged warning rather than crashing the whole script run over
    one bad credential."""
    import logging
    from sqlalchemy import select
    from core.database import Secret
    logger = logging.getLogger("caraios.secrets_vault")

    result = await db.execute(select(Secret).where(Secret.owner_id == user_id))
    secrets_dict = {}
    for s in result.scalars().all():
        try:
            secrets_dict[s.name] = decrypt(s.encrypted_value)
        except ValueError as e:
            logger.warning(f"[secrets_vault] skipping undecryptable secret '{s.name}': {e}")
    return secrets_dict


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        # Most likely cause: JWT_SECRET changed since this secret was
        # encrypted (e.g. the unpinned-default problem from Session 6,
        # before it's fixed in a given deployment) — surfaced as a clear
        # error rather than a cryptic Fernet exception.
        raise ValueError(
            "Could not decrypt this secret — likely JWT_SECRET changed since it was "
            "stored. Re-create the secret with the current JWT_SECRET."
        )
