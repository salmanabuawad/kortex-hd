"""Grid field configuration, per-user grid state, and display preferences.

Three layers decide how a grid looks, in increasing priority:
  1. the column definitions in the frontend code (the defaults),
  2. field_configurations, which an administrator edits for everyone,
  3. grid_preferences, which each user adjusts for themselves.
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..db import get_db
from ..models import FieldConfiguration, GridPreference, User, UserPreference
from ..services import audit
from .deps import current_user, require_admin

router = APIRouter(prefix="/api", tags=["display"])

# Grids an administrator may configure. Anything else is rejected, so a typo
# cannot silently create configuration nothing reads.
KNOWN_GRIDS = {
    "tickets": "רשימת קריאות",
    "approvals": "אישורים",
    "directory": "משתמשים",
    "subtasks": "משימות משנה",
}

LANGUAGES = {"he", "en", "ar"}
FONT_SIZES = {"small", "normal", "large"}
CONTRASTS = {"light", "normal", "dark", "contrast"}


def _serialize(row: FieldConfiguration) -> dict:
    return {
        "id": row.id,
        "grid_name": row.grid_name,
        "field_name": row.field_name,
        "label_he": row.label_he,
        "label_en": row.label_en,
        "label_ar": row.label_ar,
        "width_chars": row.width_chars,
        "padding": row.padding,
        "visible": row.visible,
        "pinned": row.pinned,
        "pin_side": row.pin_side,
        "column_order": row.column_order,
    }


@router.get("/grids")
def list_grids(user: User = Depends(require_admin)):
    return {"items": [{"name": key, "label": label} for key, label in KNOWN_GRIDS.items()]}


@router.get("/field-configurations")
def list_field_configurations(
    grid_name: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Readable by any signed-in user: the grids they see are built from it."""
    query = db.query(FieldConfiguration)
    if grid_name:
        query = query.filter(FieldConfiguration.grid_name == grid_name)
    rows = query.order_by(
        FieldConfiguration.grid_name, FieldConfiguration.column_order,
        FieldConfiguration.id).all()
    return {"items": [_serialize(row) for row in rows]}


@router.put("/field-configurations/{grid_name}")
def replace_field_configurations(
    grid_name: str,
    payload: schemas.FieldConfigBulk,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Replace the whole configuration for one grid in a single call.

    The manager UI edits a grid as a unit -- ordering especially only makes
    sense as a set -- so a bulk replace avoids a half-applied ordering.
    """
    if grid_name not in KNOWN_GRIDS:
        raise HTTPException(400, "לוח לא מוכר")

    seen: set[str] = set()
    for index, item in enumerate(payload.fields):
        if item.field_name in seen:
            raise HTTPException(400, f"שדה כפול: {item.field_name}")
        seen.add(item.field_name)
        if item.pin_side and item.pin_side not in {"left", "right"}:
            raise HTTPException(400, "צד הצמדה לא חוקי")

        row = (
            db.query(FieldConfiguration)
            .filter(
                FieldConfiguration.grid_name == grid_name,
                FieldConfiguration.field_name == item.field_name,
            )
            .first()
        )
        if not row:
            row = FieldConfiguration(grid_name=grid_name, field_name=item.field_name)
            db.add(row)
        row.label_he = item.label_he or None
        row.label_en = item.label_en or None
        row.label_ar = item.label_ar or None
        row.width_chars = item.width_chars
        row.padding = item.padding
        row.visible = item.visible
        row.pinned = item.pinned
        row.pin_side = item.pin_side if item.pinned else None
        row.column_order = index
        row.updated_by_id = user.id

    # Drop configuration for fields the manager no longer lists.
    db.query(FieldConfiguration).filter(
        FieldConfiguration.grid_name == grid_name,
        ~FieldConfiguration.field_name.in_(seen or {""}),
    ).delete(synchronize_session=False)

    audit.record(db, action="field_config_updated", actor=user,
                 details={"grid": grid_name, "fields": len(payload.fields)})
    db.commit()
    return list_field_configurations(grid_name=grid_name, user=user, db=db)


@router.delete("/field-configurations/{grid_name}")
def reset_field_configurations(
    grid_name: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Drop the administrator's configuration so the code defaults apply again."""
    if grid_name not in KNOWN_GRIDS:
        raise HTTPException(400, "לוח לא מוכר")
    removed = db.query(FieldConfiguration).filter(
        FieldConfiguration.grid_name == grid_name).delete(synchronize_session=False)
    audit.record(db, action="field_config_reset", actor=user, details={"grid": grid_name})
    db.commit()
    return {"removed": removed}


# --- per-user grid state ----------------------------------------------------

@router.get("/grid-preferences/{grid_name}")
def get_grid_preference(
    grid_name: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(GridPreference)
        .filter(GridPreference.user_id == user.id, GridPreference.grid_name == grid_name)
        .first()
    )
    if not row:
        return {"grid_name": grid_name, "state": None}
    try:
        state = json.loads(row.state)
    except ValueError:
        state = None
    return {"grid_name": grid_name, "state": state}


@router.put("/grid-preferences/{grid_name}")
def save_grid_preference(
    grid_name: str,
    payload: schemas.GridStateIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    encoded = json.dumps(payload.state, ensure_ascii=False)
    if len(encoded) > 100_000:
        raise HTTPException(400, "מצב הטבלה גדול מדי")
    row = (
        db.query(GridPreference)
        .filter(GridPreference.user_id == user.id, GridPreference.grid_name == grid_name)
        .first()
    )
    if row:
        row.state = encoded
    else:
        db.add(GridPreference(user_id=user.id, grid_name=grid_name, state=encoded))
    db.commit()
    return {"ok": True}


@router.delete("/grid-preferences/{grid_name}")
def clear_grid_preference(
    grid_name: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    removed = (
        db.query(GridPreference)
        .filter(GridPreference.user_id == user.id, GridPreference.grid_name == grid_name)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"removed": removed}


# --- display preferences ----------------------------------------------------

@router.get("/me/preferences")
def get_preferences(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.get(UserPreference, user.id)
    return {
        "language": row.language if row else "he",
        "font_size": row.font_size if row else "normal",
        "contrast": row.contrast if row else "normal",
    }


@router.put("/me/preferences")
def save_preferences(
    payload: schemas.PreferencesIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if payload.language not in LANGUAGES:
        raise HTTPException(400, "שפה לא נתמכת")
    if payload.font_size not in FONT_SIZES:
        raise HTTPException(400, "גודל גופן לא חוקי")
    if payload.contrast not in CONTRASTS:
        raise HTTPException(400, "מצב תצוגה לא חוקי")

    row = db.get(UserPreference, user.id)
    if not row:
        row = UserPreference(user_id=user.id)
        db.add(row)
    row.language = payload.language
    row.font_size = payload.font_size
    row.contrast = payload.contrast
    db.commit()
    return {"language": row.language, "font_size": row.font_size, "contrast": row.contrast}
