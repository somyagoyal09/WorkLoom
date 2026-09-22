# WorkLoom AI Design References — quick setup

This is the new **local semantic reference retrieval** feature. It does **not** use the old Hugging Face ZeroGPU image-generation service.

## One-time setup (Windows)

1. Open a terminal in the `backend` folder.
2. Run:

```bash
pip install -r requirements.txt
python setup_reference_library.py
```

Or double-click `setup_reference_library.bat`.

The script downloads a jewellery image dataset, downloads the pretrained CLIP model on first use, creates image embeddings, and builds the local FAISS index.

### Expected first-run downloads

- Jewellery dataset: roughly 400 MB
- CLIP model weights: roughly 600 MB (the Transformers loader downloads only the needed model files, not every framework variant)
- Generated local index: depends on the image count

You do **not** put the model or dataset into the project ZIP.

## Runtime

Start the backend normally. In Create Order → Design Studio → **Find with AI**, WorkLoom converts the current order/design brief into a text embedding and retrieves the six closest jewellery images from the local FAISS index.

## Dataset/model used

- Dataset: `sidd707/jewelry-design-dataset` — MIT license, about 6,157 jewellery images across rings, bracelets, necklaces and earrings.
- Model: `openai/clip-vit-base-patch32` — pretrained CLIP vision-language model.
- Search: FAISS cosine-similarity style search over normalized embeddings.

The app does not train CLIP. This is a pretrained-model retrieval system.


### Important: jewellery-type filtering
The reference index stores Ring/Bracelet/Necklace/Earring categories. If you previously built the library with an older version, run `python setup_reference_library.py` once again so category metadata is rebuilt. The dataset and CLIP model are normally already cached, so they should not be downloaded again.
