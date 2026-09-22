# WorkLoom AI Reference Library

This folder is populated by `python setup_reference_library.py`.

The setup script downloads the MIT-licensed `sidd707/jewelry-design-dataset` (about 6,100 jewellery images), uses the pretrained `openai/clip-vit-base-patch32` model to create image embeddings, and stores a local FAISS similarity index.

Do not commit the generated `images/`, `faiss.index`, or `metadata.json` files to Git unless you intentionally want the dataset in the repository.
