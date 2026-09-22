from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from app.auth import get_current_user, hash_password, require_role, users_collection
from app.database import db

router = APIRouter()


class KarigarCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=5, max_length=20)
    specialty: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)


class KarigarUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, min_length=5, max_length=20)
    specialty: str | None = Field(default=None, min_length=2, max_length=100)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    is_active: bool | None = None


def _public(doc: dict) -> dict:
    return {
        "user_id": doc["user_id"],
        "name": doc["name"],
        "phone": doc["phone"],
        "specialty": doc.get("specialty"),
        "role": doc.get("role", "karigar"),
        "workshop": doc.get("workshop"),
        "workshop_id": doc.get("workshop_id"),
        "initials": doc.get("initials", "K"),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
    }


def _normal_phone(value: str) -> str:
    p = ''.join(ch for ch in str(value) if ch.isdigit())
    if p.startswith('91') and len(p) == 12:
        p = p[-10:]
    elif p.startswith('0') and len(p) == 11:
        p = p[-10:]
    return p

def _ensure_workshop_code(workshop_id: str):
    workshop = db['workshops'].find_one({'workshop_id': workshop_id})
    if not workshop:
        return None
    if workshop.get('code'):
        return workshop['code']
    code = f"WL-{uuid4().hex[:6].upper()}"
    db['workshops'].update_one({'_id': workshop['_id']}, {'$set': {'code': code}})
    return code


@router.get("", response_model=list[dict])
def list_team(user: dict = Depends(require_role("owner"))):
    _ensure_workshop_code(user.get('workshop_id'))
    docs = users_collection.find({"workshop_id": user.get("workshop_id"), "role": "karigar"}).sort("name", 1)
    return [_public(doc) for doc in docs]

@router.get("/workshop", response_model=dict)
def workshop_details(user: dict = Depends(require_role("owner"))):
    workshop = db['workshops'].find_one({'workshop_id': user.get('workshop_id'), 'is_active': True})
    if not workshop:
        raise HTTPException(status_code=404, detail='Workshop not found.')
    code = _ensure_workshop_code(user.get('workshop_id'))
    return {'workshop_id': workshop['workshop_id'], 'name': workshop.get('name'), 'code': code}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def add_karigar(payload: KarigarCreate, owner: dict = Depends(require_role("owner"))):
    phone = _normal_phone(payload.phone)
    if len(phone) < 5:
        raise HTTPException(status_code=400, detail="Enter a valid phone number.")
    workshop_id = owner.get("workshop_id")
    if users_collection.find_one({"phone": phone, "workshop_id": workshop_id, "role": "karigar"}):
        raise HTTPException(status_code=409, detail="A Karigar with this phone number already exists in your workshop.")
    if not workshop_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to a workshop.")
    name = " ".join(payload.name.split())
    initials = "".join(part[0] for part in name.split()[:2]).upper() or "K"
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": f"USR-KARIGAR-{uuid4().hex[:12].upper()}",
        "phone": phone,
        "name": name,
        "role": "karigar",
        "workshop": owner.get("workshop"),
        "workshop_id": workshop_id,
        "initials": initials,
        "specialty": " ".join(payload.specialty.split()),
        "password_hash": hash_password(payload.password),
        "is_active": True,
        "created_at": now,
    }
    try:
        users_collection.insert_one(doc)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Could not add the karigar.") from exc
    return _public(doc)


@router.put("/{user_id}", response_model=dict)
def update_karigar(user_id: str, payload: KarigarUpdate, owner: dict = Depends(require_role("owner"))):
    query = {"user_id": user_id, "workshop_id": owner.get("workshop_id"), "role": "karigar"}
    existing = users_collection.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="Karigar not found in your workshop.")
    changes = payload.model_dump(exclude_unset=True)
    if "phone" in changes:
        changes["phone"] = _normal_phone(changes["phone"])
        conflict = users_collection.find_one({"phone": changes["phone"], "workshop_id": owner.get("workshop_id"), "role": "karigar", "user_id": {"$ne": user_id}})
        if conflict:
            raise HTTPException(status_code=409, detail="That phone number is already in use.")
    if "name" in changes:
        changes["name"] = " ".join(changes["name"].split())
        changes["initials"] = "".join(p[0] for p in changes["name"].split()[:2]).upper() or "K"
    if "specialty" in changes:
        changes["specialty"] = " ".join(changes["specialty"].split())
    if "password" in changes:
        changes["password_hash"] = hash_password(changes.pop("password"))
    if not changes:
        return _public(existing)
    users_collection.update_one(query, {"$set": changes})
    updated = users_collection.find_one(query)
    return _public(updated)


@router.delete("/{user_id}")
def deactivate_karigar(user_id: str, owner: dict = Depends(require_role("owner"))):
    query = {"user_id": user_id, "workshop_id": owner.get("workshop_id"), "role": "karigar"}
    result = users_collection.update_one(query, {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc)}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Karigar not found in your workshop.")
    return {"message": "Karigar deactivated successfully."}
