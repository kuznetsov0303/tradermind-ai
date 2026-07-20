"""Canonical provider-agnostic real-time market event contracts.

The hot path must remain deterministic. Provider-specific records are normalized
at the boundary and everything downstream consumes these immutable contracts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Mapping, TypeAlias
from uuid import UUID, uuid4


class ProviderName(str, Enum):
    DATABENTO = "databento"
    FMP = "fmp"
    REPLAY = "replay"
    INTERNAL = "internal"


class EventType(str, Enum):
    TRADE = "trade"
    BBO = "bbo"
    STATUS = "status"
    DEFINITION = "definition"
    HEARTBEAT = "heartbeat"


class MarketSession(str, Enum):
    CLOSED = "closed"
    PREMARKET = "premarket"
    REGULAR = "regular"
    AFTER_HOURS = "after_hours"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class TradePayload:
    price: Decimal
    size: int
    side: str | None = None
    action: str | None = None
    flags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class BboPayload:
    bid_price: Decimal | None
    ask_price: Decimal | None
    bid_size: int | None
    ask_size: int | None
    action: str | None = None

    @property
    def spread(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return self.ask_price - self.bid_price

    @property
    def midpoint(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return (self.bid_price + self.ask_price) / Decimal("2")


@dataclass(frozen=True, slots=True)
class StatusPayload:
    status: str
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class DefinitionPayload:
    raw_symbol: str
    security_type: str | None = None
    exchange: str | None = None
    currency: str | None = None


Payload: TypeAlias = (
    TradePayload
    | BboPayload
    | StatusPayload
    | DefinitionPayload
    | None
)


@dataclass(frozen=True, slots=True)
class MarketEvent:
    provider: ProviderName
    dataset: str
    event_type: EventType
    symbol: str
    instrument_id: int | None
    event_time: datetime
    receive_time: datetime
    payload: Payload
    sequence: int | None = None
    session: MarketSession = MarketSession.UNKNOWN
    source_record_type: str | None = None
    event_id: UUID = field(default_factory=uuid4)
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.symbol or not self.symbol.strip():
            raise ValueError("symbol must be non-empty")

        if self.event_time.tzinfo is None:
            raise ValueError("event_time must be timezone-aware")

        if self.receive_time.tzinfo is None:
            raise ValueError("receive_time must be timezone-aware")

        if self.receive_time < self.event_time:
            # Provider timestamps can differ by tiny clock offsets, but a large
            # negative latency must be handled explicitly by the adapter.
            delta = self.event_time - self.receive_time
            if delta.total_seconds() > 1:
                raise ValueError(
                    "receive_time cannot precede event_time by more than 1 second"
                )

        normalized = self.symbol.strip().upper()
        object.__setattr__(self, "symbol", normalized)

    @property
    def latency_ms(self) -> float:
        return (self.receive_time - self.event_time).total_seconds() * 1000.0

    @property
    def is_trade(self) -> bool:
        return self.event_type is EventType.TRADE

    @property
    def is_bbo(self) -> bool:
        return self.event_type is EventType.BBO


def utc_now() -> datetime:
    return datetime.now(timezone.utc)