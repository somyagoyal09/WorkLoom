# app/routes/health.py
#
# Simple health-check endpoint. Used to confirm the API is running and,
# optionally, that it can reach MongoDB.

from fastapi import APIRouter
from app.database import check_connection

router = APIRouter()


@router.get("/health")
def health_check():
    """
    GET /api/health

    Returns the API status and whether MongoDB is reachable.
    """
    return {
        "status": "ok",
        "service": "Workloom API",
        "database_connected": check_connection(),
    }
