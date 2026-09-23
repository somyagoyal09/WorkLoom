# app/database.py
#
# MongoDB connection setup for the Workloom backend.
# Uses pymongo directly (synchronous) to keep things simple and easy to
# explain — no async driver, no ORM. A single shared client is created
# once when this module is imported, and reused across the app.

from pymongo import MongoClient
from datetime import datetime, timezone
from app.config import MONGO_URI, DB_NAME


# Create the client once and reuse it (recommended pymongo pattern).
# serverSelectionTimeoutMS keeps connection attempts short (5s) so the app
# doesn't hang if MongoDB isn't reachable yet, rather than failing fast.
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)


# The Workloom database. Individual collections (e.g. orders, karigars)
# will be added here as later modules are built.
db = client[DB_NAME]


def check_connection() -> bool:
    """
    Quick helper to verify the MongoDB connection is alive.
    Used by the /api/health route.
    """
    try:
        client.admin.command("ping")
        return True
    except Exception:
        return False


def create_indexes() -> None:
    """
    Creates indexes used by the app's collections. Called once when the
    server starts (see the lifespan handler in app/main.py).

    - order_id: unique, since it's how we look up/update/delete a single
      order and it must never be duplicated.
    - stage / karigar: not unique, just speeds up the filtered list queries
      used by GET /api/orders (?stage=... / ?karigar=...).
    - workspace_id: helps scope orders to the correct workshop.
    - phone + workshop_id + role: unique combination so the same phone
      number can be used across different workshops/roles safely.
    """
    try:
        orders = db["orders"]

        # Order indexes
        orders.create_index("order_id", unique=True)
        orders.create_index("stage")
        orders.create_index("karigar")
        orders.create_index("workspace_id")

        # User indexes
        db["users"].create_index(
            [("phone", 1), ("workshop_id", 1), ("role", 1)],
            unique=True,
            name="phone_workspace_role_unique"
        )
        db["users"].create_index("user_id", unique=True)

        # Workshop indexes
        db["workshops"].create_index(
            "code",
            unique=True,
            sparse=True
        )
        db["workshops"].create_index(
            "workshop_id",
            unique=True
        )

        # Notification indexes
        db["notifications"].create_index(
            [
                ("workspace_id", 1),
                ("recipient_role", 1),
                ("recipient_name", 1),
                ("created_at", -1)
            ]
        )

        # Issue indexes
        db["issues"].create_index(
            [
                ("workspace_id", 1),
                ("status", 1),
                ("created_at", -1)
            ]
        )

    except Exception as exc:
        print(
            f"Warning: could not create MongoDB indexes on startup: {exc}"
        )


def migrate_workspace_data() -> None:
    """
    Backfill workspace_id on legacy records when ownership is unambiguous.

    New records are always written with workspace_id. Older orders/notifications
    can be safely associated when their creator/recipient account belongs to a
    workshop. Records that cannot be mapped remain unscoped and are not exposed
    through authenticated workspace queries.
    """
    try:
        users = list(
            db["users"].find(
                {},
                {
                    "_id": 0,
                    "user_id": 1,
                    "name": 1,
                    "role": 1,
                    "workshop_id": 1
                }
            )
        )

        by_user = {
            u.get("user_id"): u.get("workshop_id")
            for u in users
            if u.get("user_id") and u.get("workshop_id")
        }

        by_identity = {
            (u.get("role"), u.get("name")): u.get("workshop_id")
            for u in users
            if u.get("role")
            and u.get("name")
            and u.get("workshop_id")
        }

        # Migrate legacy orders
        for order in db["orders"].find(
            {"workspace_id": {"$exists": False}},
            {
                "_id": 1,
                "created_by": 1,
                "karigar": 1
            }
        ):
            wid = by_user.get(order.get("created_by"))

            if not wid:
                wid = by_identity.get(
                    ("karigar", order.get("karigar"))
                )

            if wid:
                db["orders"].update_one(
                    {"_id": order["_id"]},
                    {"$set": {"workspace_id": wid}}
                )

        # Migrate legacy notifications
        for note in db["notifications"].find(
            {"workspace_id": {"$exists": False}},
            {
                "_id": 1,
                "recipient_role": 1,
                "recipient_name": 1
            }
        ):
            wid = by_identity.get(
                (
                    note.get("recipient_role"),
                    note.get("recipient_name")
                )
            )

            if wid:
                db["notifications"].update_one(
                    {"_id": note["_id"]},
                    {"$set": {"workspace_id": wid}}
                )

    except Exception as exc:
        print(
            f"Warning: could not migrate legacy workspace data: {exc}"
        )