from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pydantic import BaseModel, Field

from app.auth import get_current_user, require_role
from app.database import db
from app.routes.notifications import create_notification

router = APIRouter()
issues_collection = db["issues"]
orders_collection = db["orders"]
users_collection = db["users"]


class IssueCreate(BaseModel):
    order_id: str = Field(..., min_length=2)
    message: str = Field(..., min_length=3, max_length=500)


class IssueResponse(BaseModel):
    response: str = Field(..., min_length=1, max_length=500)


def _clean(doc):
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


@router.get("")
def list_issues(user: dict = Depends(get_current_user)):
    query = {"workspace_id": user.get("workshop_id")}
    if user["role"] == "karigar":
        query["karigar_user_id"] = user.get("user_id")
    return [_clean(x) for x in issues_collection.find(query).sort("created_at", -1).limit(50)]


@router.post("")
def create_issue(payload: IssueCreate, user: dict = Depends(require_role("karigar"))):
    order = orders_collection.find_one({
        "order_id": payload.order_id,
        "workspace_id": user.get("workshop_id"),
        "karigar_user_id": user.get("user_id"),
    })
    if not order:
        raise HTTPException(status_code=404, detail="That order is not assigned to you.")

    now = datetime.now(timezone.utc)
    message = payload.message.strip()
    doc = {
        "issue_id": f"ISS-{uuid4().hex[:12].upper()}",
        "workspace_id": user.get("workshop_id"),
        "order_id": payload.order_id,
        "karigar_user_id": user.get("user_id"),
        "karigar_name": user["name"],
        "message": message,
        "status": "open",
        "response": None,
        "created_at": now,
        "updated_at": now,
    }
    issues_collection.insert_one(doc)

    history = order.get("history", []) + [{
        "event": "Karigar Issue Raised",
        "at": now,
        "by": user["name"],
        "note": message,
    }]
    orders_collection.update_one({"_id": order["_id"]}, {"$set": {"history": history, "updated_at": now}})

    owner = users_collection.find_one({
        "workshop_id": user.get("workshop_id"),
        "role": "owner",
        "is_active": True,
    }, {"_id": 0, "user_id": 1, "name": 1})
    if owner:
        create_notification(
            recipient_role="owner",
            recipient_name=owner["name"],
            title="Karigar question",
            message=f"{payload.order_id} · {user['name']}: {message}",
            order_id=payload.order_id,
            notification_type="issue",
            workspace_id=user.get("workshop_id"),
        )
    return _clean(doc)


@router.patch("/{issue_id}/respond")
def respond_issue(issue_id: str, payload: IssueResponse, user: dict = Depends(require_role("owner"))):
    issue = issues_collection.find_one({"issue_id": issue_id, "workspace_id": user.get("workshop_id")})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found.")

    now = datetime.now(timezone.utc)
    response = payload.response.strip()
    updated = issues_collection.find_one_and_update(
        {"issue_id": issue_id, "workspace_id": user.get("workshop_id")},
        {"$set": {"response": response, "status": "resolved", "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )

    order = orders_collection.find_one({"order_id": issue["order_id"], "workspace_id": user.get("workshop_id")})
    if order:
        history = order.get("history", []) + [{
            "event": "Owner Responded to Karigar",
            "at": now,
            "by": user["name"],
            "note": response,
        }]
        orders_collection.update_one({"_id": order["_id"]}, {"$set": {"history": history, "updated_at": now}})

    create_notification(
        recipient_role="karigar",
        recipient_name=issue["karigar_name"],
        title="Owner responded",
        message=f"{issue['order_id']}: {response}",
        order_id=issue["order_id"],
        notification_type="issue_response",
        workspace_id=user.get("workshop_id"),
    )
    return _clean(updated)
