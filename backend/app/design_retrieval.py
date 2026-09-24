"""WorkLoom semantic jewellery-reference retrieval using ONNX CLIP + FAISS."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np

BASE_DIR = Path(__file__).resolve().parents[1]
LIBRARY_DIR = Path(
    os.getenv("WORKLOOM_REFERENCE_LIBRARY", BASE_DIR / "reference_library")
)

INDEX_PATH = LIBRARY_DIR / "faiss.index"
META_PATH = LIBRARY_DIR / "metadata.json"
IMAGE_DIR = LIBRARY_DIR / "images"
MODEL_REPO = "Xenova/clip-vit-base-patch32"
HF_IMAGE_BASE = "https://huggingface.co/datasets/Somya09/workloom-reference-library/resolve/main/images"
MODEL_DIR = LIBRARY_DIR / "clip_onnx"

TEXT_MODEL_PATH = MODEL_DIR / "text_model_int8.onnx"

_tokenizer = None
_session = None
_index = None
_metadata: list[dict[str, Any]] = []


def _load_model():
    global _tokenizer, _session

    if _tokenizer is not None and _session is not None:
        return _tokenizer, _session

    try:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from transformers import AutoTokenizer
    except ImportError as exc:
        raise RuntimeError(
            "Install AI retrieval dependencies from requirements.txt."
        ) from exc

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if not TEXT_MODEL_PATH.exists():
        print("Downloading lightweight ONNX CLIP text model...")

        hf_hub_download(
            repo_id=MODEL_REPO,
            filename="onnx/text_model_int8.onnx",
            local_dir=MODEL_DIR,
        )

        # hf_hub_download preserves the repository folder structure.
        downloaded_path = MODEL_DIR / "onnx" / "text_model_int8.onnx"

        if downloaded_path.exists() and not TEXT_MODEL_PATH.exists():
            downloaded_path.replace(TEXT_MODEL_PATH)

    _tokenizer = AutoTokenizer.from_pretrained(MODEL_REPO)

    _session = ort.InferenceSession(
        str(TEXT_MODEL_PATH),
        providers=["CPUExecutionProvider"],
    )

    return _tokenizer, _session


def _load_index():
    global _index, _metadata

    if _index is not None:
        return _index, _metadata

    if not INDEX_PATH.exists() or not META_PATH.exists():
        raise RuntimeError(
            "Reference library is not indexed yet. "
            "Run `python setup_reference_library.py` from the backend folder."
        )

    try:
        import faiss
    except ImportError as exc:
        raise RuntimeError(
            "FAISS is not installed. Run `pip install -r requirements.txt`."
        ) from exc

    _index = faiss.read_index(str(INDEX_PATH))
    _metadata = json.loads(
        META_PATH.read_text(encoding="utf-8")
    )

    return _index, _metadata


def _normalize_item_type(item_type: str | None) -> str | None:
    value = " ".join((item_type or "").lower().split()).strip()

    if not value:
        return None

    aliases = {
        "ring": "ring",
        "rings": "ring",
        "bracelet": "bracelet",
        "bracelets": "bracelet",
        "bangle": "bracelet",
        "bangles": "bracelet",
        "necklace": "necklace",
        "necklaces": "necklace",
        "earring": "earring",
        "earrings": "earring",
        "stud": "earring",
        "studs": "earring",
        "hoop": "earring",
        "hoops": "earring",
    }

    return aliases.get(value)


def _detect_item_type_from_query(query: str) -> str | None:
    import re

    q = f" {query.lower()} "

    patterns = [
        (r"\b(?:bangles?|bracelets?)\b", "bracelet"),
        (r"\b(?:earrings?|studs?|hoops?)\b", "earring"),
        (r"\b(?:necklaces?)\b", "necklace"),
        (r"\b(?:rings?)\b", "ring"),
    ]

    for pattern, category in patterns:
        if re.search(pattern, q):
            return category

    return None


def _category_matches(
    metadata_item: dict[str, Any],
    item_type: str | None,
) -> bool:

    if not item_type:
        return True

    category = str(
        metadata_item.get("category") or ""
    ).strip().lower()

    return category == item_type


def _attribute_queries(
    query: str,
    category: str | None,
) -> list[tuple[str, float]]:

    import re

    q = query.lower()

    prompts: list[tuple[str, float]] = [
        (query, 1.0)
    ]

    cat_name = {
        "ring": "ring",
        "earring": "earring",
        "bracelet": "bracelet",
        "necklace": "necklace",
    }.get(category or "")

    if not cat_name:
        return prompts

    terms = []

    if re.search(r"\b(?:stud|studs)\b", q):
        terms.append("small stud earring")

    if re.search(r"\b(?:hoop|hoops)\b", q):
        terms.append("hoop earring")

    if re.search(
        r"\b(?:traditional|classic|ethnic|indian)\b",
        q,
    ):
        terms.append(f"traditional {cat_name}")

    if re.search(
        r"\b(?:sleek|slim|thin|minimal|minimalist|delicate)\b",
        q,
    ):
        terms.append(
            f"sleek slim thin {cat_name}"
        )

    if re.search(
        r"\b(?:diamond|diamonds|solitaire)\b",
        q,
    ):
        terms.append(f"diamond {cat_name}")

    if re.search(
        r"\b(?:simple|plain)\b",
        q,
    ):
        terms.append(
            f"simple minimal {cat_name}"
        )

    if re.search(
        r"\b(?:modern|contemporary)\b",
        q,
    ):
        terms.append(
            f"modern {cat_name}"
        )

    for prompt in terms:
        prompts.append((prompt, 0.55))

    return prompts


def _text_embedding(text: str) -> np.ndarray:

    tokenizer, session = _load_model()

    inputs = tokenizer(
        [text],
        padding="max_length",
        truncation=True,
        max_length=77,
        return_tensors="np",
    )

    input_ids = inputs["input_ids"].astype(np.int64)

    feed = {
        "input_ids": input_ids,
    }

    input_names = {
        item.name
        for item in session.get_inputs()
    }

    if "attention_mask" in input_names:
        feed["attention_mask"] = inputs[
            "attention_mask"
        ].astype(np.int64)

    if "token_type_ids" in input_names:
        feed["token_type_ids"] = inputs[
            "token_type_ids"
        ].astype(np.int64)

    outputs = session.run(
        None,
        feed,
    )

    # The exported CLIP text model returns the
    # projected text embedding as its first output.
    vector = np.asarray(
        outputs[0],
        dtype="float32",
    )

    if vector.ndim == 1:
        vector = vector.reshape(1, -1)

    vector /= np.maximum(
        np.linalg.norm(
            vector,
            axis=1,
            keepdims=True,
        ),
        1e-12,
    )

    return vector


def search_references(
    query: str,
    limit: int = 6,
    item_type: str | None = None,
    excluded_ids: list[str] | None = None,
) -> list[dict[str, Any]]:

    query = " ".join(
        (query or "").split()
    ).strip()

    if not query:
        return []

    index, metadata = _load_index()

    requested_category = (
        _detect_item_type_from_query(query)
        or _normalize_item_type(item_type)
    )

    excluded = {
        str(x)
        for x in (excluded_ids or [])
    }

    prompts = _attribute_queries(
        query,
        requested_category,
    )

    aggregate: dict[int, float] = {}

    for prompt, weight in prompts:

        vector = _text_embedding(prompt)

        scores, ids = index.search(
            vector,
            index.ntotal,
        )

        for score, idx in zip(
            scores[0],
            ids[0],
        ):

            if idx < 0 or idx >= len(metadata):
                continue

            item = metadata[idx]

            if not _category_matches(
                item,
                requested_category,
            ):
                continue

            if str(item.get("id")) in excluded:
                continue

            weighted = float(score) * weight

            aggregate[idx] = max(
                aggregate.get(idx, -999.0),
                weighted,
            )

        ranked = sorted(
        aggregate.items(),
        key=lambda pair: pair[1],
        reverse=True,
    )

    results = []

    for idx, score in ranked[
        : max(limit, 1)
    ]:

        item = dict(metadata[idx])

        item["score"] = round(
            float(score),
            4,
        )

        item["matched_category"] = requested_category

        filename = Path(
            str(item.get("image_path", ""))
        ).name

        item["image_url"] = f"{HF_IMAGE_BASE}/{filename}"

        results.append(item)

    return results