# app/config.py
#
# Simple configuration loader for the Workloom backend.
# Reads settings from a .env file (see .env.example) using python-dotenv.
# Kept intentionally simple: no settings frameworks, just plain variables.

import os
from pathlib import Path
from dotenv import load_dotenv

# Load the backend .env from a path anchored to this file.
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env", override=True)

# MongoDB connection string, e.g. mongodb://localhost:27017
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Name of the database Workloom will use inside MongoDB.
DB_NAME = os.getenv("DB_NAME", "workloom_db")

# Comma-separated list of origins allowed to call this API (the React app).
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PINTEREST_ACCESS_TOKEN = os.getenv("PINTEREST_ACCESS_TOKEN")
PINTEREST_COUNTRY_CODE = os.getenv("PINTEREST_COUNTRY_CODE", "IN")
PINTEREST_LOCALE = os.getenv("PINTEREST_LOCALE", "en-IN")
