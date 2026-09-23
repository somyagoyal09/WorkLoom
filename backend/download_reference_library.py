from pathlib import Path
from huggingface_hub import hf_hub_download

REPO_ID = "Somya09/workloom-reference-library"
REPO_TYPE = "dataset"

BASE_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = BASE_DIR / "reference_library"

def ensure_reference_library():
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)

    index_path = LIBRARY_DIR / "faiss.index"
    metadata_path = LIBRARY_DIR / "metadata.json"

    if not index_path.exists():
        hf_hub_download(
            repo_id=REPO_ID,
            repo_type=REPO_TYPE,
            filename="faiss.index",
            local_dir=LIBRARY_DIR,
        )

    if not metadata_path.exists():
        hf_hub_download(
            repo_id=REPO_ID,
            repo_type=REPO_TYPE,
            filename="metadata.json",
            local_dir=LIBRARY_DIR,
        )

    print("WorkLoom reference index ready.")