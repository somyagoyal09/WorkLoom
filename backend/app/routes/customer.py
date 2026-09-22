from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import require_role
from app.database import db
from datetime import datetime, timezone

router = APIRouter()
orders_collection = db["orders"]


def _customer_phone(order):
    phone = "".join(ch for ch in str(order.get("phone") or "") if ch.isdigit())
    if phone.startswith("0"):
        phone = "91" + phone.lstrip("0")
    elif phone and not phone.startswith("91"):
        phone = "91" + phone
    return phone


def _build_message(order, order_id, message_type, workshop_name):
    customer = order.get("customer_name", "Customer")
    item = order.get("item", "jewellery order")
    stage = order.get("stage", "In progress")
    shop = (workshop_name or "the workshop").strip()
    if message_type == "ready" or stage == "Ready for Dispatch":
        return f"Hello {customer}, your {item} ({order_id}) is ready. Please collect your order from the workshop. Thank you — {shop}."
    return f"Hello {customer}, your {item} ({order_id}) is currently in the {stage} stage. We will update you once it is ready for collection. Thank you — {shop}."


@router.get("/{order_id}/whatsapp-message")
def whatsapp_message(
    order_id: str,
    message_type: str = Query("status", pattern="^(status|ready)$"),
    user: dict = Depends(require_role("owner")),
):
    order = orders_collection.find_one({"order_id": order_id, "workspace_id": user.get("workshop_id")}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    phone = _customer_phone(order)
    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone number is missing.")

    workshop = db["workshops"].find_one({"workshop_id": user.get("workshop_id"), "is_active": True}, {"_id": 0, "name": 1})
    workshop_name = workshop.get("name") if workshop else user.get("workshop")
    message = _build_message(order, order_id, message_type, workshop_name)
    try:
        orders_collection.update_one(
            {"order_id": order_id, "workspace_id": user.get("workshop_id")},
            {
                "$push": {
                    "history": {
                        "event": "Customer WhatsApp Update Prepared",
                        "at": datetime.now(timezone.utc),
                        "by": user["name"],
                        "note": "WhatsApp customer update prepared for manual sending.",
                    }
                },
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
    except Exception:
        pass

    return {
        "order_id": order_id,
        "customer": order.get("customer_name"),
        "phone": order.get("phone"),
        "message": message,
        "message_type": "ready" if message_type == "ready" or order.get("stage") == "Ready for Dispatch" else "status",
        "stage": order.get("stage"),
        "whatsapp_url": f"https://wa.me/{phone}?text={quote(message)}",
    }


@router.get("/{order_id}/ready-message")
def ready_message(order_id: str, user: dict = Depends(require_role("owner"))):
    # Backwards-compatible endpoint used by existing Owner screens.
    return whatsapp_message(order_id, message_type="ready", user=user)
