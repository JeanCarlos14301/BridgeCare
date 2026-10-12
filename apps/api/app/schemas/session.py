from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SessionResponse(BaseModel):
    role: Literal["visitor", "reviewer"]
    expires_at: datetime


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)
