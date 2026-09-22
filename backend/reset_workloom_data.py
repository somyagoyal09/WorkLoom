"""Safely clear WorkLoom's operational test data for a fresh local run.

This removes workspace/owner/Karigar/order/request/notification records from
MongoDB, but intentionally leaves the reference-library files/index untouched.
Run this once before creating a fresh local workspace.
"""
from app.config import MONGO_URI, DB_NAME
from pymongo import MongoClient

COLLECTIONS = ["orders", "issues", "notifications", "users", "workshops"]


def main() -> None:
    print("WARNING: This will permanently delete WorkLoom's current local test data:")
    print("- owners and workshops")
    print("- karigars")
    print("- orders")
    print("- Karigar questions/notifications")
    print("The jewellery reference library / FAISS index will NOT be touched.")
    print()
    confirmation = input("Type RESET WORKLOOM to continue: ").strip()
    if confirmation != "RESET WORKLOOM":
        print("Cancelled. No data was changed.")
        return

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    try:
        db.command("ping")
        for name in COLLECTIONS:
            result = db[name].delete_many({})
            print(f"Cleared {name}: {result.deleted_count} records")
        print("\nWorkLoom operational data reset complete.")
        print("Now start the backend and create a fresh workspace from the app.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
