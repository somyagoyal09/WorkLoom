# app/models/order.py
#
# Pydantic schemas for the Order resource.
#
# We keep three separate schemas, which is a common and easy-to-explain
# FastAPI pattern:
#   - OrderCreate  -> what the client sends when creating an order
#   - OrderUpdate  -> what the client sends when updating an order
#                     (every field optional, since updates are partial)
#   - OrderResponse -> what the API sends back to the client
#
# order_id is a human-friendly business ID (e.g. "WL-1050"), separate from
# MongoDB's internal _id. This matches the IDs already used in the React
# frontend's mock data, and keeps ObjectId out of the API entirely.

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class OrderStage(str, Enum):
    """Matches ORDER_STAGES in the frontend's mockData.js."""
    DESIGN_APPROVED = "Design Approved"
    CASTING = "Casting"
    FILING = "Filing"
    SETTING = "Setting"
    POLISHING = "Polishing"
    QUALITY_CHECK = "Quality Check"
    READY_FOR_DISPATCH = "Ready for Dispatch"


class Priority(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class OrderCreate(BaseModel):
    """Fields required to create a new order."""

    customer_name: str = Field(..., min_length=1, examples=["Meena Kapoor"])
    item: str = Field(..., min_length=1, examples=["Bridal Necklace Set"])
    material: str = Field(..., min_length=1, examples=["Gold 22K"])
    weight: str = Field(..., min_length=1, examples=["48.5g"])
    karigar: str = Field(..., min_length=1, examples=["Iqbal Ansari"])
    karigar_user_id: Optional[str] = Field(default=None, description="Unique Karigar user ID for workspace-safe assignment")
    workspace_id: Optional[str] = Field(default=None, description="Owning workshop/workspace ID")
    stage: OrderStage = OrderStage.DESIGN_APPROVED
    priority: Priority = Priority.MEDIUM
    due_date: str = Field(..., examples=["2026-09-20"], description="Date as YYYY-MM-DD")
    phone: Optional[str] = Field(default=None, min_length=1, description="Customer phone number")
    stones: Optional[str] = Field(default=None, description="Stone work / stone type")
    advance: Optional[float] = Field(default=None, ge=0, description="Advance received in INR")
    estimate_value: Optional[float] = Field(default=None, ge=0, description="Estimated order value in INR")
    notes: Optional[str] = Field(default=None, description="Design or production notes")
    design_image_url: Optional[str] = Field(default=None, description="Uploaded reference/design image URL")
    design_reference_url: Optional[str] = Field(default=None, description="External reference URL such as a Pinterest Pin")
    design_reference_urls: Optional[list[str]] = Field(default=None, description="Multiple external design reference URLs")
    design_source: Optional[str] = Field(default=None, description="new, reference, existing, or hand_drawn")
    ai_reviewed: bool = False
    ai_missing_fields: list[str] = Field(default_factory=list)
    ai_confidence: dict = Field(default_factory=dict)
    design_concept: Optional[dict] = None


class OrderUpdate(BaseModel):
    """
    Fields allowed when updating an order. Every field is optional so the
    client can send only what changed (a partial / PATCH-style update, even
    though we expose it on PUT to keep the endpoint list simple).
    """

    customer_name: Optional[str] = Field(default=None, min_length=1)
    item: Optional[str] = Field(default=None, min_length=1)
    material: Optional[str] = Field(default=None, min_length=1)
    weight: Optional[str] = Field(default=None, min_length=1)
    karigar: Optional[str] = Field(default=None, min_length=1)
    karigar_user_id: Optional[str] = Field(default=None)
    stage: Optional[OrderStage] = None
    priority: Optional[Priority] = None
    due_date: Optional[str] = Field(default=None, examples=["2026-09-20"])
    phone: Optional[str] = Field(default=None, min_length=1)
    stones: Optional[str] = None
    advance: Optional[float] = Field(default=None, ge=0)
    estimate_value: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    design_image_url: Optional[str] = None
    design_reference_url: Optional[str] = None
    design_reference_urls: Optional[list[str]] = None
    design_source: Optional[str] = None
    ai_reviewed: Optional[bool] = None
    ai_missing_fields: Optional[list[str]] = None
    ai_confidence: Optional[dict] = None
    design_concept: Optional[dict] = None


class OrderResponse(BaseModel):
    """Shape of an order as returned by the API."""

    order_id: str
    customer_name: str
    item: str
    material: str
    weight: str
    karigar: str
    karigar_user_id: Optional[str] = None
    workspace_id: Optional[str] = None
    stage: OrderStage
    priority: Priority
    due_date: str
    phone: Optional[str] = None
    stones: Optional[str] = None
    advance: Optional[float] = None
    estimate_value: Optional[float] = None
    notes: Optional[str] = None
    design_image_url: Optional[str] = None
    design_reference_url: Optional[str] = None
    design_reference_urls: Optional[list[str]] = None
    design_source: Optional[str] = None
    ai_reviewed: bool = False
    ai_missing_fields: list[str] = Field(default_factory=list)
    ai_confidence: dict = Field(default_factory=dict)
    design_concept: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    history: list[dict] = Field(default_factory=list)
