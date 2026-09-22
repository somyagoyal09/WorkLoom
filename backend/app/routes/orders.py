from datetime import datetime, timezone
from typing import Optional
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.auth import get_current_user, require_role, users_collection
from app.database import db
from app.routes.notifications import create_notification
from app.models.order import OrderCreate, OrderUpdate, OrderResponse, OrderStage, Priority

router = APIRouter()
orders_collection = db["orders"]


def _generate_order_id() -> str:
    # Do not derive the next ID from document count: deleted/legacy records can
    # create gaps, and count-based IDs can collide with an existing order.
    max_number = 1049
    for doc in orders_collection.find({}, {"order_id": 1}):
        match = re.fullmatch(r"WL-(\d+)", str(doc.get("order_id", "")))
        if match:
            max_number = max(max_number, int(match.group(1)))
    return f"WL-{max_number + 1}"


def _order_doc_to_response(doc: dict, user: dict | None = None) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    if user and user.get("role") == "karigar":
        # Customer contact details are private to the owner. Keep the field
        # present for the response schema but blank it for Karigars.
        doc["phone"] = None
    return doc


def _ensure_owner_or_assigned_karigar(order: dict, user: dict):
    if user["role"] == "owner":
        if order.get("workspace_id") and order.get("workspace_id") != user.get("workshop_id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access orders in your workshop.")
        return
    if order.get("karigar_user_id"):
        allowed = order.get("karigar_user_id") == user.get("user_id")
    else:
        same_name_count = users_collection.count_documents({"workshop_id": user.get("workshop_id"), "role": "karigar", "name": user.get("name"), "is_active": {"$ne": False}})
        allowed = same_name_count == 1 and order.get("karigar") == user.get("name") and (not order.get("workspace_id") or order.get("workspace_id") == user.get("workshop_id"))
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access orders assigned to you.")


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(order: OrderCreate, user: dict = Depends(require_role("owner"))):
    now = datetime.now(timezone.utc)
    order_doc = order.model_dump()
    workshop_id = user.get("workshop_id")
    karigar_user_id = order_doc.get("karigar_user_id")
    if not workshop_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to a workshop.")
    if not karigar_user_id:
        raise HTTPException(status_code=400, detail="Please select a valid Karigar from your workshop.")
    karigar_doc = users_collection.find_one({
        "user_id": karigar_user_id,
        "workshop_id": workshop_id,
        "role": "karigar",
        "is_active": {"$ne": False},
    }, {"_id": 0, "user_id": 1, "name": 1})
    if not karigar_doc:
        raise HTTPException(status_code=400, detail="The selected Karigar is not active in your workshop.")
    # Keep the display name for backwards compatibility, but use the immutable
    # user_id for all access control and filtering.
    order_doc["karigar"] = karigar_doc["name"]
    order_doc["karigar_user_id"] = karigar_doc["user_id"]
    order_doc["workspace_id"] = workshop_id
    order_doc["order_id"] = _generate_order_id()
    order_doc["created_at"] = now
    order_doc["updated_at"] = now
    order_doc["created_by"] = user["user_id"]
    order_doc["history"] = [{"event": "Order Created", "at": now, "by": user["name"], "note": "Order booked in Workloom."}]

    try:
        orders_collection.insert_one(order_doc)
        create_notification(
            recipient_role="karigar", recipient_name=order_doc["karigar"],
            title="New order assigned",
            message=f"{order_doc['order_id']} · {order_doc['item']} has been assigned to you.",
            order_id=order_doc["order_id"], notification_type="assignment", workspace_id=workshop_id,
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save order to the database: {exc}")
    return _order_doc_to_response(order_doc, user)


@router.get("", response_model=list[OrderResponse])
def list_orders(stage: Optional[OrderStage] = Query(None), priority: Optional[Priority] = Query(None), karigar: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    workshop_id = user.get("workshop_id")
    query = {}
    if user["role"] == "karigar":
        # New orders use the unique Karigar user ID. Legacy orders that only
        # stored a name are shown only when that name is unambiguous inside the
        # workspace; duplicate-name assignments must be reassigned by the owner.
        query = {"workspace_id": workshop_id, "karigar_user_id": user["user_id"]}
        legacy_count = users_collection.count_documents({"workshop_id": workshop_id, "role": "karigar", "name": user["name"], "is_active": {"$ne": False}})
        if legacy_count == 1:
            query = {"$and": [{"workspace_id": workshop_id}, {"$or": [{"karigar_user_id": user["user_id"]}, {"karigar_user_id": {"$exists": False}, "karigar": user["name"]}]}]}
    else:
        # Workspace-scoped orders are preferred. Legacy orders created before
        # workspace_id was introduced can still be seen by their creating owner.
        query["$or"] = [{"workspace_id": workshop_id}, {"created_by": user.get("user_id")} ]
        if karigar:
            # Owner filters by a selected Karigar user ID when the UI provides it.
            if users_collection.find_one({"user_id": karigar, "workshop_id": workshop_id, "role": "karigar"}):
                query["karigar_user_id"] = karigar
            else:
                query["karigar"] = karigar
    if stage:
        query["stage"] = stage.value
    if priority:
        query["priority"] = priority.value
    try:
        docs = orders_collection.find(query).sort("created_at", -1)
        return [_order_doc_to_response(doc, user) for doc in docs]
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch orders from the database: {exc}")


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = orders_collection.find_one({"order_id": order_id})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch order from the database: {exc}")
    if not doc:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' was not found.")
    _ensure_owner_or_assigned_karigar(doc, user)
    return _order_doc_to_response(doc, user)


@router.put("/{order_id}", response_model=OrderResponse)
def update_order(order_id: str, order: OrderUpdate, user: dict = Depends(get_current_user)):
    update_fields = {k: v for k, v in order.model_dump(exclude_unset=True).items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided to update.")
    try:
        before = orders_collection.find_one({"order_id": order_id})
        if not before:
            raise HTTPException(status_code=404, detail=f"Order '{order_id}' was not found.")
        _ensure_owner_or_assigned_karigar(before, user)
        if user["role"] == "owner" and ("karigar" in update_fields or "karigar_user_id" in update_fields):
            selected_id = update_fields.get("karigar_user_id")
            if not selected_id and update_fields.get("karigar"):
                matches = list(users_collection.find({"workshop_id": user.get("workshop_id"), "role": "karigar", "name": update_fields["karigar"], "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1, "name": 1}).limit(2))
                if len(matches) == 1:
                    selected_id = matches[0]["user_id"]
                else:
                    raise HTTPException(status_code=400, detail="Please select a specific Karigar to avoid ambiguous same-name assignments.")
            karigar_doc = users_collection.find_one({"user_id": selected_id, "workshop_id": user.get("workshop_id"), "role": "karigar", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1, "name": 1})
            if not karigar_doc:
                raise HTTPException(status_code=400, detail="The selected Karigar is not active in your workshop.")
            update_fields["karigar_user_id"] = karigar_doc["user_id"]
            update_fields["karigar"] = karigar_doc["name"]
            update_fields["workspace_id"] = user.get("workshop_id")
        if user["role"] == "karigar":
            allowed = {"stage"}
            update_fields = {k: v for k, v in update_fields.items() if k in allowed}
            if not update_fields:
                raise HTTPException(status_code=403, detail="Karigars can update production stage only.")
        now = datetime.now(timezone.utc)
        update_fields["updated_at"] = now
        new_stage = update_fields.get("stage")
        history_entry = None
        if new_stage and new_stage != before.get("stage"):
            history_entry = {"event": str(new_stage.value if hasattr(new_stage, "value") else new_stage), "at": now, "by": user["name"], "note": "Production stage updated."}
        if history_entry:
            update_fields.setdefault("history", before.get("history", []) + [history_entry])
        result = orders_collection.find_one_and_update({"order_id": order_id}, {"$set": update_fields}, return_document=ReturnDocument.AFTER)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update order in the database: {exc}")

    if before and update_fields.get("karigar") and before.get("karigar") != result.get("karigar"):
        create_notification(recipient_role="karigar", recipient_name=result["karigar"], title="Order assigned to you", message=f'{result["order_id"]} · {result["item"]} has been assigned to you.', order_id=result["order_id"], notification_type="assignment", workspace_id=result.get("workspace_id"))
    if before and before.get("stage") != "Ready for Dispatch" and result.get("stage") == "Ready for Dispatch":
        create_notification(recipient_role="owner", recipient_name="Ramesh Soni", title="Order completed", message=f'{result["order_id"]} · {result["item"]} is ready for dispatch.', order_id=result["order_id"], notification_type="completion")
    return _order_doc_to_response(result, user)


@router.delete("/{order_id}", status_code=200)
def delete_order(order_id: str, user: dict = Depends(require_role("owner"))):
    try:
        result = orders_collection.delete_one({"order_id": order_id})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete order from the database: {exc}")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' was not found.")
    return {"message": f"Order '{order_id}' deleted successfully."}


@router.post('/recommend-karigar')
def recommend_karigar(payload: dict, user: dict = Depends(require_role('owner'))):
    item = str(payload.get('item') or '').lower()
    stones = str(payload.get('stones') or '').lower()
    workspace_id = user.get('workshop_id')

    team_docs = list(users_collection.find(
        {'workshop_id': workspace_id, 'role': 'karigar', 'is_active': {'$ne': False}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'specialty': 1},
    ))
    active = {}
    for doc in orders_collection.find(
        {'workspace_id': workspace_id, 'stage': {'$ne': 'Ready for Dispatch'}},
        {'_id': 0, 'karigar': 1},
    ):
        name = doc.get('karigar')
        if name:
            active[name] = active.get(name, 0) + 1

    scored = []
    for member in team_docs:
        name = member.get('name') or 'Unnamed Karigar'
        specialty = member.get('specialty') or 'General jewellery work'
        specialty_text = specialty.lower()
        skill = sum(2 for token in (item, stones) if token and token in specialty_text)
        load = active.get(name, 0)
        score = skill * 10 - load * 2
        scored.append({
            'user_id': member.get('user_id'),
            'name': name,
            'specialty': specialty,
            'active_orders': load,
            'score': score,
        })

    scored.sort(key=lambda x: (-x['score'], x['active_orders'], x['name']))
    best = scored[0] if scored else None
    return {
        'recommended': best,
        'alternatives': scored[1:3],
        'method': 'Rule-based recommendation using the current workshop team, specialty, and active workload.',
    }
