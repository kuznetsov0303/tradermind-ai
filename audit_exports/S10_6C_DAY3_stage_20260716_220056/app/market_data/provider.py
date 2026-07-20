"""Provider abstraction for production live and replay market data."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import FrozenSet

from .contracts import EventType, MarketEvent


@dataclass(frozen=True, slots=True)
class ProviderCapabilities:
    datasets: FrozenSet[str]
    event_types: FrozenSet[EventType]
    supports_all_symbols: bool
    supports_replay: bool
    supports_premarket: bool
    supports_after_hours: bool


@dataclass(frozen=True, slots=True)
class SubscriptionRequest:
    dataset: str
    symbols: tuple[str, ...]
    event_types: frozenset[EventType]
    snapshot: bool = True

    def __post_init__(self) -> None:
        if not self.dataset.strip():
            raise ValueError("dataset must be non-empty")
        if not self.symbols:
            raise ValueError("symbols must be non-empty")
        if not self.event_types:
            raise ValueError("event_types must be non-empty")


class MarketDataProvider(ABC):
    """Provider boundary consumed by the realtime core."""

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def capabilities(self) -> ProviderCapabilities:
        raise NotImplementedError

    @abstractmethod
    async def connect(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def subscribe(
        self,
        request: SubscriptionRequest,
    ) -> AsyncIterator[MarketEvent]:
        raise NotImplementedError

    @abstractmethod
    async def health(self) -> dict[str, object]:
        raise NotImplementedError