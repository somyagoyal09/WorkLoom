from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_BYTES = 5 * 1024 * 1024


@router.post("/design", status_code=status.HTTP_201_CREATED)
async def upload_design_image(file: UploadFile = File(...)):
    """Upload a jewellery reference image for an order."""
    extension = ALLOWED_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(400, "Only JPG, PNG, and WebP images are supported.")

    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Image must be 5 MB or smaller.")
    if not content:
        raise HTTPException(400, "The uploaded image is empty.")

    filename = f"{uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename
    destination.write_bytes(content)

    return {"url": f"/uploads/{filename}", "filename": filename}
