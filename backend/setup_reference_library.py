"""Build WorkLoom's local jewellery reference library using CLIP + FAISS.

Run once from backend:
    python setup_reference_library.py

The Hugging Face dataset may arrive as dataset.zip. This script preserves the
original dataset category (ring/bracelet/necklace/earring) while flattening
filenames so Windows path-length limits cannot break extraction.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import zipfile

import numpy as np
from PIL import Image

DATASET_ID = os.getenv("WORKLOOM_DATASET_ID", "sidd707/jewelry-design-dataset")
BASE_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = BASE_DIR / "reference_library"
IMAGE_DIR = LIBRARY_DIR / "images"
INDEX_PATH = LIBRARY_DIR / "faiss.index"
META_PATH = LIBRARY_DIR / "metadata.json"
MODEL_ID = os.getenv("WORKLOOM_CLIP_MODEL", "openai/clip-vit-base-patch32")

CATEGORY_MAP = {
    "ring_best": "Ring", "ring": "Ring",
    "bracelet": "Bracelet", "bracelets": "Bracelet",
    "necklace": "Necklace", "necklaces": "Necklace",
    "earring_best": "Earring", "earring": "Earring", "earrings": "Earring",
}


def category_from_name(name: str) -> str:
    parts = [p.lower() for p in Path(name).parts]
    for part in parts:
        if part in CATEGORY_MAP:
            return CATEGORY_MAP[part]
    # Some archives encode the class in the filename.
    lower = name.lower()
    for key, value in CATEGORY_MAP.items():
        if key in lower:
            return value
    return "Jewellery"


def main():
    try:
        from huggingface_hub import snapshot_download
        import torch
        import faiss
        from transformers import AutoProcessor, CLIPModel
    except ImportError as exc:
        raise SystemExit("Missing dependency. From backend run: pip install -r requirements.txt") from exc

    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading dataset cache: {DATASET_ID}")
    repo_dir = Path(snapshot_download(repo_id=DATASET_ID, repo_type="dataset"))

    # Remove only the generated reference images/index/metadata. Other WorkLoom files are untouched.
    for old in IMAGE_DIR.glob("*"):
        if old.is_file():
            old.unlink()
    if INDEX_PATH.exists():
        INDEX_PATH.unlink()
    if META_PATH.exists():
        META_PATH.unlink()

    prepared = []
    zip_candidates = sorted(repo_dir.rglob("*.zip"))
    if zip_candidates:
        dataset_zip = zip_candidates[0]
        print(f"Reading dataset archive: {dataset_zip.name}")
        with zipfile.ZipFile(dataset_zip) as archive:
            members = [m for m in archive.infolist()
                       if not m.is_dir() and Path(m.filename).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
            members = sorted(members, key=lambda m: m.filename.lower())
            temp_dir = BASE_DIR / "_dataset_images"
            temp_dir.mkdir(parents=True, exist_ok=True)
            for old in temp_dir.glob("*"):
                if old.is_file():
                    old.unlink()
            for n, member in enumerate(members):
                suffix = Path(member.filename).suffix.lower()
                target = temp_dir / f"source_{n:05d}{suffix}"
                try:
                    with archive.open(member) as fin, target.open("wb") as fout:
                        shutil.copyfileobj(fin, fout)
                    with Image.open(target) as check:
                        check.verify()
                    prepared.append((target, category_from_name(member.filename)))
                except Exception:
                    target.unlink(missing_ok=True)
    else:
        image_files = sorted([p for p in repo_dir.rglob("*") if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}])
        for src in image_files:
            try:
                with Image.open(src) as check:
                    check.verify()
                prepared.append((src, category_from_name(str(src.relative_to(repo_dir)))))
            except Exception:
                continue

    if not prepared:
        raise SystemExit("No valid jewellery images were found in the downloaded dataset.")

    metadata = []
    print(f"Preparing {len(prepared)} jewellery images...")
    for src, category in prepared:
        i = len(metadata)
        target = IMAGE_DIR / f"jewellery_{i:05d}{src.suffix.lower()}"
        shutil.copy2(src, target)
        metadata.append({
            "id": f"jewellery_{i:05d}",
            "image_url": f"/voice/design-reference-image/{target.name}",
            "image_path": str(target),
            "category": category,
            "title": f"{category} reference {i + 1}",
        })

    print(f"Loading pretrained CLIP model: {MODEL_ID}")
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = CLIPModel.from_pretrained(MODEL_ID)
    model.eval()

    vectors = []
    embedded_metadata = []
    batch_size = 32
    with torch.inference_mode():
        for start in range(0, len(metadata), batch_size):
            batch = metadata[start:start + batch_size]
            images, valid_items = [], []
            for item in batch:
                try:
                    img = Image.open(item["image_path"]).convert("RGB")
                    images.append(img)
                    valid_items.append(item)
                except Exception:
                    continue
            if not images:
                continue
            inputs = processor(images=images, return_tensors="pt")
            vision_outputs = model.vision_model(**inputs)
            pooled = vision_outputs.pooler_output
            features = model.visual_projection(pooled)
            features = features / features.norm(dim=-1, keepdim=True)
            vectors.append(features.cpu().numpy().astype("float32"))
            embedded_metadata.extend(valid_items)
            for img in images:
                img.close()
            print(f"Embedded {len(embedded_metadata)}/{len(metadata)}")

    if not vectors:
        raise SystemExit("Could not create any image embeddings.")

    matrix = np.vstack(vectors).astype("float32")
    # Keep metadata in exactly the same order as FAISS vectors. This prevents
    # category labels from drifting when an image cannot be embedded.
    metadata = embedded_metadata
    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    faiss.write_index(index, str(INDEX_PATH))
    META_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = {}
    for item in metadata:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    print("\nWorkLoom reference library ready.")
    print(f"Images: {len(metadata)}")
    print(f"Categories: {counts}")
    print(f"Index: {INDEX_PATH}")
    print("Start the backend and use Design Studio → AI Match.")


if __name__ == "__main__":
    main()
