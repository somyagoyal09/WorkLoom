from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download


REPO_ID = "Somya09/workloom-reference-library"
REPO_TYPE = "dataset"

CLIP_MODEL_ID = "openai/clip-vit-base-patch32"

BASE_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = BASE_DIR / "reference_library"
CLIP_DIR = LIBRARY_DIR / "clip_model"


def ensure_reference_library():
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)

    index_path = LIBRARY_DIR / "faiss.index"
    metadata_path = LIBRARY_DIR / "metadata.json"

    # Download FAISS index
    if not index_path.exists():
        hf_hub_download(
            repo_id=REPO_ID,
            repo_type=REPO_TYPE,
            filename="faiss.index",
            local_dir=LIBRARY_DIR,
        )

    # Download metadata
    if not metadata_path.exists():
        hf_hub_download(
            repo_id=REPO_ID,
            repo_type=REPO_TYPE,
            filename="metadata.json",
            local_dir=LIBRARY_DIR,
        )

    # Download CLIP model once during backend startup.
    if not (CLIP_DIR / "config.json").exists():
        print("Downloading WorkLoom CLIP model...")
        snapshot_download(
            repo_id=CLIP_MODEL_ID,
            local_dir=CLIP_DIR,
        )

    print("WorkLoom reference index and CLIP model ready.")