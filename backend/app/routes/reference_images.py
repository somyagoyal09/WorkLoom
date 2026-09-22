from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.design_retrieval import IMAGE_DIR

router = APIRouter()

@router.get('/design-reference-image/{filename}')
def design_reference_image(filename: str):
    safe_name = Path(filename).name
    path = IMAGE_DIR / safe_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail='Reference image not found.')
    return FileResponse(path)
