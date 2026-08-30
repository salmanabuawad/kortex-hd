from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import schemas
from ..db import get_db
from ..models import User
from ..security import (
    create_token, hash_password, password_problem, reset_rate_limit, verify_password,
)
from ..services import audit
from .deps import client_key, current_user, login_rate_limit
from .serializers import user_full

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login")
def login(
    data: schemas.LoginIn,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(login_rate_limit),
):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    # Same message and same work for unknown email and wrong password.
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "כתובת דוא״ל או סיסמה שגויים")
    if not user.active:
        raise HTTPException(403, "המשתמש אינו פעיל. פנו למנהל המערכת.")

    reset_rate_limit(client_key(request, "login"))
    user.last_login_at = datetime.now(timezone.utc)
    audit.record(db, action="user_login", actor=user)
    db.commit()

    return {
        "token": create_token(user.id, user.role),
        "user": user_full(user),
    }


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_full(user)


@router.post("/me/password")
def change_own_password(
    data: schemas.PasswordChange,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "הסיסמה הנוכחית שגויה")
    problem = password_problem(data.new_password)
    if problem:
        raise HTTPException(400, problem)
    if verify_password(data.new_password, user.password_hash):
        raise HTTPException(400, "הסיסמה החדשה זהה לנוכחית")

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    audit.record(db, action="password_changed", actor=user)
    db.commit()
    return {"ok": True}
