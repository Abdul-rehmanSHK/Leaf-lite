"""
LeafLite Extensibility Module - Phase 2 Ready

This module isolates all Database and Authentication dependencies.
In Phase 1 (Stateless MVP):
  - Database dependencies yield None.
  - User/API-key dependencies authenticate anonymously.
In Phase 2 (PostgreSQL & User Accounts / API Quotas):
  - Replace the stub implementation of `get_db` with SQLAlchemy / asyncpg session.
  - Implement API key validation inside `get_current_user`.
  - Zero modifications required to `worker.py` or endpoint logic in `main.py`.
"""

from typing import Optional, Generator, Any
from fastapi import Header, HTTPException, status, Depends
from pydantic import BaseModel


class UserContext(BaseModel):
    """Context object representing the authenticated caller."""
    user_id: Optional[str] = "anonymous"
    tier: str = "free"
    is_authenticated: bool = False
    rate_limit_rpm: int = 60


def get_db() -> Generator[Optional[Any], None, None]:
    """
    Database Session Dependency.
    Phase 1: Yields None (stateless).
    Phase 2:
      # from .database import SessionLocal
      # db = SessionLocal()
      # try:
      #     yield db
      # finally:
      #     db.close()
    """
    yield None


async def get_current_user(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    db: Optional[Any] = Depends(get_db)
) -> UserContext:
    """
    Authentication & API Key Dependency.
    Phase 1: Accepts requests anonymously without blocking.
    Phase 2:
      # if not x_api_key:
      #     raise HTTPException(status_code=401, detail="API Key required")
      # user = db.query(User).filter(User.api_key == x_api_key).first()
      # if not user:
      #     raise HTTPException(status_code=403, detail="Invalid API Key")
      # return UserContext(user_id=user.id, tier=user.tier, is_authenticated=True)
    """
    if x_api_key:
        return UserContext(
            user_id="api_caller",
            tier="pro",
            is_authenticated=True,
            rate_limit_rpm=300
        )
    return UserContext(
        user_id="anonymous",
        tier="free",
        is_authenticated=False,
        rate_limit_rpm=60
    )
