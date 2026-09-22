from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from app.auth import require_role
from app.database import db

router = APIRouter()
orders_collection = db["orders"]


@router.get("/summary")
def summary(user: dict = Depends(require_role("owner"))):
    orders = list(orders_collection.find({"workspace_id": user.get("workshop_id")}, {"_id": 0, "stage": 1, "priority": 1, "due_date": 1, "karigar": 1, "estimate_value": 1, "created_at": 1, "updated_at": 1, "history": 1}))
    now = datetime.now(timezone.utc)
    total = len(orders)
    ready = sum(1 for o in orders if o.get("stage") == "Ready for Dispatch")
    active = sum(1 for o in orders if o.get("stage") != "Ready for Dispatch")
    active_orders = [o for o in orders if o.get("stage") != "Ready for Dispatch"]
    high = sum(1 for o in active_orders if o.get("priority") == "High")
    value = sum(float(o.get("estimate_value") or 0) for o in active_orders)
    due_soon = 0
    for o in active_orders:
        try:
            due = datetime.fromisoformat(str(o.get("due_date"))).date()
            if now.date() <= due <= now.date().fromordinal(now.date().toordinal() + 5):
                due_soon += 1
        except Exception:
            pass

    stages = ["Design Approved", "Casting", "Filing", "Setting", "Polishing", "Quality Check", "Ready for Dispatch"]
    stage_breakdown = {stage: sum(1 for o in orders if o.get("stage") == stage) for stage in stages}
    completed_durations = []
    for o in orders:
        if o.get('stage') == 'Ready for Dispatch' and o.get('created_at') and o.get('updated_at'):
            try:
                completed_durations.append(max(0, (o['updated_at'] - o['created_at']).total_seconds() / 86400))
            except Exception:
                pass
    avg_completion_days = round(sum(completed_durations) / len(completed_durations), 1) if completed_durations else None

    workload = {}
    for o in orders:
        k = o.get("karigar") or "Unassigned"
        workload[k] = workload.get(k, 0) + (0 if o.get("stage") == "Ready for Dispatch" else 1)

    return {
        "total_orders": total,
        "active_orders": active,
        "ready_orders": ready,
        "high_priority": high,
        "due_soon": due_soon,
        "order_book_value": value,
        "stage_breakdown": stage_breakdown,
        "karigar_workload": workload,
        "avg_completion_days": avg_completion_days,
        "completed_orders_measured": len(completed_durations),
    }
