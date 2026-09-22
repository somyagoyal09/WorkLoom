# app/main.py
#
# Entry point for the Workloom FastAPI application.
# Run with: uvicorn app.main:app --reload

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import create_indexes
from app.routes import health, orders, uploads, voice, notifications, auth, analytics, customer, team, reference_images, issues


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts up — a good place for one-time
    # setup like making sure our MongoDB indexes exist.
    create_indexes()
    yield
    # (nothing to clean up on shutdown yet)


app = FastAPI(
    title="Workloom API",
    description="Backend foundation for the Workloom jewellery workshop management system.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the React (Vite) frontend to call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routes are grouped under the /api prefix.
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(voice.router, prefix="/api/voice", tags=["Voice & AI"])
app.include_router(reference_images.router, prefix="/api/voice", tags=["Design References"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["Uploads"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(issues.router, prefix="/api/issues", tags=["Karigar Questions"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(customer.router, prefix="/api/customer", tags=["Customer Communication"])
app.include_router(team.router, prefix="/api/team", tags=["Workshop Team"])

# Local MVP storage for uploaded design references. For production deployment,
# this can be swapped for Cloudinary without changing the order API contract.
app.mount("/uploads", StaticFiles(directory=str(uploads.UPLOAD_DIR)), name="uploads")


@app.get("/")
def root():
    """Simple landing route so visiting the server root doesn't 404."""
    return {"message": "Workloom API is running. See /docs for available endpoints."}
