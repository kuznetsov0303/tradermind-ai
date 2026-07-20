from pydantic import BaseModel
from datetime import datetime


class EngineStatus(BaseModel):
    service: str
    version: str
    started_at: datetime


class WatchCandidate(BaseModel):
    symbol: str
    price: float | None = None
    volume: float | None = None
    relative_volume: float | None = None
    change_percent: float | None = None