from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError
from pydantic import BaseModel, Field
from app.auth import get_current_user
from app.database import db

router = APIRouter()
notifications_collection = db["notifications"]

class NotificationResponse(BaseModel):
    notification_id: str
    recipient_role: str
    recipient_name: str
    title: str
    message: str
    order_id: Optional[str] = None
    type: str = "info"
    is_read: bool = False
    created_at: datetime

class NotificationRead(BaseModel):
    is_read: bool = Field(default=True)

def create_notification(*, recipient_role: str, recipient_name: str, title: str, message: str, order_id: Optional[str] = None, notification_type: str = "info", workspace_id: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    doc = {"notification_id": f"NT-{now.strftime('%Y%m%d%H%M%S%f')}", "recipient_role": recipient_role, "recipient_name": recipient_name, "title": title, "message": message, "order_id": order_id, "type": notification_type, "is_read": False, "created_at": now, "workspace_id": workspace_id}
    try:
        notifications_collection.insert_one(doc)
    except PyMongoError as exc:
        print(f"Warning: notification could not be saved: {exc}")

def _to_response(doc: dict) -> dict:
    doc = dict(doc); doc.pop("_id", None); return doc

@router.get("", response_model=list[NotificationResponse])
def list_notifications(unread_only: bool = False, user: dict = Depends(get_current_user)):
    query = {"recipient_role": user["role"], "recipient_name": user["name"], "workspace_id": user.get("workshop_id")}
    if unread_only: query["is_read"] = False
    try:
        docs = notifications_collection.find(query).sort("created_at", -1).limit(30)
        return [_to_response(doc) for doc in docs]
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {exc}")

@router.post("/read-all")
def mark_all_read(user: dict = Depends(get_current_user)):
    try:
        result = notifications_collection.update_many({"recipient_role": user["role"], "recipient_name": user["name"], "workspace_id": user.get("workshop_id"), "is_read": False}, {"$set": {"is_read": True}})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update notifications: {exc}")
    return {"updated": result.modified_count}

@router.patch("/{notification_id}", response_model=NotificationResponse)
def mark_notification_read(notification_id: str, payload: NotificationRead, user: dict = Depends(get_current_user)):
    try:
        result = notifications_collection.find_one_and_update({"notification_id": notification_id, "recipient_role": user["role"], "recipient_name": user["name"]}, {"$set": {"is_read": payload.is_read}}, return_document=ReturnDocument.AFTER)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {exc}")
    if not result: raise HTTPException(status_code=404, detail="Notification not found.")
    return _to_response(result)
