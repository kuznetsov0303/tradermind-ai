param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$BackendRoot = Join-Path $ProjectRoot "services\stock-engine"
$AppRoot = Join-Path $BackendRoot "app"
$MarketDataRoot = Join-Path $AppRoot "market_data"
$TestsRoot = Join-Path $BackendRoot "tests"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$HandoffsRoot = Join-Path $StateRoot "handoffs"
$BackupRoot = Join-Path $ProjectRoot ("audit_exports\S10_6B_market_event_contract_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

if (-not (Test-Path -LiteralPath $BackendRoot)) {
    throw "Backend root not found: $BackendRoot"
}

New-Item -ItemType Directory -Force -Path $MarketDataRoot | Out-Null
New-Item -ItemType Directory -Force -Path $TestsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $MilestonesRoot | Out-Null
New-Item -ItemType Directory -Force -Path $HandoffsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Backup-IfExists {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $relative = $Path.Substring($ProjectRoot.Length).TrimStart("\")
        $dest = Join-Path $BackupRoot $relative
        $parent = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Copy-Item -LiteralPath $Path -Destination $dest -Force
    }
}

function Write-ProjectFile {
    param(
        [string]$Path,
        [string]$Content
    )

    Backup-IfExists $Path
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$initPy = @'
"""Canonical real-time market-data contracts and provider adapters."""

from .contracts import (
    BboPayload,
    DefinitionPayload,
    EventType,
    MarketEvent,
    MarketSession,
    ProviderName,
    StatusPayload,
    TradePayload,
)
from .provider import MarketDataProvider, ProviderCapabilities, SubscriptionRequest

__all__ = [
    "BboPayload",
    "DefinitionPayload",
    "EventType",
    "MarketDataProvider",
    "MarketEvent",
    "MarketSession",
    "ProviderCapabilities",
    "ProviderName",
    "StatusPayload",
    "SubscriptionRequest",
    "TradePayload",
]
'@

$contractsPy = @'
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
'@

$providerPy = @'
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
'@

$databentoAdapterPy = @'
"""Databento EQUS.MINI normalization helpers.

This file intentionally does not start a production connection yet. Day 3
creates the long-running service. Day 2 freezes the provider boundary and
normalization semantics first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from .contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)

DATABENTO_PRICE_SCALE = Decimal("1000000000")
EQUS_MINI_DATASET = "EQUS.MINI"


def databento_price_to_decimal(raw_price: int | None) -> Decimal | None:
    if raw_price is None:
        return None
    return Decimal(raw_price) / DATABENTO_PRICE_SCALE


def databento_ns_to_datetime(raw_ns: int | None) -> datetime:
    if raw_ns is None:
        return datetime.now(timezone.utc)
    return datetime.fromtimestamp(raw_ns / 1_000_000_000, tz=timezone.utc)


def normalize_mbp1_record(
    record: Any,
    *,
    symbol: str,
    received_at_ns: int | None = None,
) -> tuple[MarketEvent, ...]:
    """Normalize one Databento MBP-1 record.

    An MBP-1 trade record can contain both a trade action and current top-of-book.
    We emit one TRADE event when action == "T" and one BBO event whenever level 0
    is available. Downstream state engines therefore receive explicit event
    semantics instead of provider-specific records.
    """

    instrument_id = _optional_int(getattr(record, "instrument_id", None))
    event_time = databento_ns_to_datetime(
        _optional_int(getattr(record, "ts_event", None))
    )

    receive_ns = received_at_ns
    if receive_ns is None:
        receive_ns = _optional_int(getattr(record, "ts_recv", None))

    receive_time = databento_ns_to_datetime(receive_ns)
    action = _safe_text(getattr(record, "action", None))

    events: list[MarketEvent] = []

    if action == "T":
        trade_price = databento_price_to_decimal(
            _optional_int(getattr(record, "price", None))
        )
        trade_size = _optional_int(getattr(record, "size", None))

        if trade_price is not None and trade_size is not None:
            events.append(
                MarketEvent(
                    provider=ProviderName.DATABENTO,
                    dataset=EQUS_MINI_DATASET,
                    event_type=EventType.TRADE,
                    symbol=symbol,
                    instrument_id=instrument_id,
                    event_time=event_time,
                    receive_time=receive_time,
                    payload=TradePayload(
                        price=trade_price,
                        size=trade_size,
                        action=action,
                    ),
                    source_record_type=type(record).__name__,
                )
            )

    level0 = _first_level(record)
    if level0 is not None:
        events.append(
            MarketEvent(
                provider=ProviderName.DATABENTO,
                dataset=EQUS_MINI_DATASET,
                event_type=EventType.BBO,
                symbol=symbol,
                instrument_id=instrument_id,
                event_time=event_time,
                receive_time=receive_time,
                payload=BboPayload(
                    bid_price=databento_price_to_decimal(
                        _optional_int(getattr(level0, "bid_px", None))
                    ),
                    ask_price=databento_price_to_decimal(
                        _optional_int(getattr(level0, "ask_px", None))
                    ),
                    bid_size=_optional_int(getattr(level0, "bid_sz", None)),
                    ask_size=_optional_int(getattr(level0, "ask_sz", None)),
                    action=action,
                ),
                source_record_type=type(record).__name__,
            )
        )

    return tuple(events)


def _first_level(record: Any) -> Any | None:
    levels = getattr(record, "levels", None)
    if not levels:
        return None
    try:
        return levels[0]
    except (IndexError, TypeError):
        return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None
'@

$testPy = @'
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.market_data.contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)
from app.market_data.databento_adapter import (
    databento_ns_to_datetime,
    databento_price_to_decimal,
    normalize_mbp1_record,
)


class MarketEventContractTests(unittest.TestCase):
    def test_price_scale(self) -> None:
        self.assertEqual(
            databento_price_to_decimal(333_020_000_000),
            Decimal("333.02"),
        )

    def test_nanoseconds_to_utc(self) -> None:
        value = databento_ns_to_datetime(1_700_000_000_000_000_000)
        self.assertIsNotNone(value.tzinfo)
        self.assertEqual(value.tzinfo, timezone.utc)

    def test_symbol_is_normalized(self) -> None:
        now = datetime.now(timezone.utc)
        event = MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=EventType.TRADE,
            symbol=" aapl ",
            instrument_id=38,
            event_time=now,
            receive_time=now,
            payload=TradePayload(price=Decimal("100"), size=10),
        )
        self.assertEqual(event.symbol, "AAPL")

    def test_bbo_math(self) -> None:
        payload = BboPayload(
            bid_price=Decimal("100.00"),
            ask_price=Decimal("100.10"),
            bid_size=10,
            ask_size=20,
        )
        self.assertEqual(payload.spread, Decimal("0.10"))
        self.assertEqual(payload.midpoint, Decimal("100.05"))

    def test_mbp1_trade_and_bbo_normalization(self) -> None:
        level = SimpleNamespace(
            bid_px=332_690_000_000,
            ask_px=333_600_000_000,
            bid_sz=3,
            ask_sz=40,
        )
        record = SimpleNamespace(
            instrument_id=38,
            ts_event=1_784_223_507_644_725_177,
            ts_recv=1_784_223_507_644_837_783,
            action="T",
            price=333_020_000_000,
            size=10,
            levels=[level],
        )

        events = normalize_mbp1_record(record, symbol="AAPL")

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].event_type, EventType.TRADE)
        self.assertEqual(events[1].event_type, EventType.BBO)
        self.assertEqual(events[0].payload.price, Decimal("333.02"))
        self.assertEqual(events[1].payload.bid_price, Decimal("332.69"))
        self.assertEqual(events[1].payload.ask_price, Decimal("333.6"))

    def test_quote_only_update_emits_bbo_only(self) -> None:
        level = SimpleNamespace(
            bid_px=100_000_000_000,
            ask_px=100_100_000_000,
            bid_sz=50,
            ask_sz=60,
        )
        record = SimpleNamespace(
            instrument_id=1,
            ts_event=1_700_000_000_000_000_000,
            ts_recv=1_700_000_000_000_100_000,
            action="A",
            price=None,
            size=None,
            levels=[level],
        )

        events = normalize_mbp1_record(record, symbol="MSFT")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].event_type, EventType.BBO)


if __name__ == "__main__":
    unittest.main()
'@

$readme = @'
# SkillEdge Market Data Core

This package defines the canonical provider-agnostic market-event boundary.

## Rules

- Provider-specific records are normalized immediately.
- Downstream scanner, strategy and lifecycle code must not depend on Databento SDK record classes.
- Databento prices use fixed-point integers scaled by 1e9.
- Event and receive timestamps are timezone-aware UTC datetimes.
- MBP-1 records can produce explicit TRADE and BBO events.
- The production stream service is implemented in Day 3 after this contract is frozen and tested.
'@

Write-ProjectFile (Join-Path $MarketDataRoot "__init__.py") $initPy
Write-ProjectFile (Join-Path $MarketDataRoot "contracts.py") $contractsPy
Write-ProjectFile (Join-Path $MarketDataRoot "provider.py") $providerPy
Write-ProjectFile (Join-Path $MarketDataRoot "databento_adapter.py") $databentoAdapterPy
Write-ProjectFile (Join-Path $MarketDataRoot "README.md") $readme
Write-ProjectFile (Join-Path $TestsRoot "test_market_data_contracts.py") $testPy

$pythonCmd = $null
foreach ($candidate in @("python", "py")) {
    try {
        $null = & $candidate --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $candidate
            break
        }
    } catch {}
}

if ($null -eq $pythonCmd) {
    throw "Python command not found on local machine."
}

Write-Host ""
Write-Host "=== STATIC COMPILE ===" -ForegroundColor Green

$compileFiles = @(
    (Join-Path $MarketDataRoot "__init__.py"),
    (Join-Path $MarketDataRoot "contracts.py"),
    (Join-Path $MarketDataRoot "provider.py"),
    (Join-Path $MarketDataRoot "databento_adapter.py"),
    (Join-Path $TestsRoot "test_market_data_contracts.py")
)

foreach ($file in $compileFiles) {
    if ($pythonCmd -eq "py") {
        & py -3 -m py_compile $file
    } else {
        & python -m py_compile $file
    }

    if ($LASTEXITCODE -ne 0) {
        throw "py_compile failed: $file"
    }
}

Write-Host ""
Write-Host "=== UNIT TESTS ===" -ForegroundColor Green

Push-Location $BackendRoot
try {
    if ($pythonCmd -eq "py") {
        & py -3 -m unittest tests.test_market_data_contracts -v
    } else {
        & python -m unittest tests.test_market_data_contracts -v
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Unit tests failed."
    }
}
finally {
    Pop-Location
}

$milestone = @"
# S10.6B - Day 2 Canonical MarketEvent Contract

Generated: $isoNow

Completed:
- canonical MarketEvent contract;
- provider and event enums;
- typed TRADE/BBO/STATUS/DEFINITION payloads;
- provider abstraction;
- Databento fixed-point price normalization;
- Databento nanosecond timestamp normalization;
- MBP-1 to explicit TRADE/BBO conversion;
- unit tests;
- static compile.

Production mutation: none.
VPS mutation: none.
Service restart: none.

Backup:
$BackupRoot

Next:
Day 3 - Production market-stream service with authentication, subscription, callback normalization and health metrics.
"@

Write-ProjectFile (Join-Path $MilestonesRoot ("S10_6B_DAY2_MARKET_EVENT_CONTRACT_" + $stamp + ".md")) $milestone

$next = @"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6B - Canonical MarketEvent contract and provider abstraction.

Next milestone:
Day 3 - Production Databento Market Stream service.

Required:
- long-running Databento Live connection;
- EQUS.MINI / MBP-1 subscription;
- secure DATABENTO_API_KEY loading;
- symbol mapping;
- normalization through app.market_data contracts;
- heartbeat/freshness state;
- graceful shutdown;
- read-only health snapshot;
- no scanner/strategy cutover yet.

Do not:
- reset paper;
- manually call paper run-once;
- restart unrelated services;
- weaken client or Telegram gates;
- expose API keys;
- perform blind full-tree deployment.
"@

Write-ProjectFile (Join-Path $StateRoot "NEXT_STEP.md") $next

$handoffPath = Join-Path $HandoffsRoot "HANDOFF_LATEST.md"
$existingHandoff = ""
if (Test-Path -LiteralPath $handoffPath) {
    $existingHandoff = Get-Content -LiteralPath $handoffPath -Raw
}

$handoffAppend = @"

## S10.6B Day 2 update - $isoNow

Databento entitlement was proven before this milestone:
- EQUS.MINI live confirmed;
- ALL_SYMBOLS definitions confirmed;
- MBP-1 confirmed;
- 13,101 unique symbols observed in smoke;
- key persisted securely on production VPS.

Day 2 completed locally:
- app/market_data/contracts.py
- app/market_data/provider.py
- app/market_data/databento_adapter.py
- app/market_data/__init__.py
- app/market_data/README.md
- tests/test_market_data_contracts.py

Static compile and unit tests passed.

No production deployment or service restart was performed.

Next:
Day 3 production market-stream service.
"@

Write-ProjectFile $handoffPath ($existingHandoff + $handoffAppend)

$result = [ordered]@{
    ok = $true
    milestone = "S10.6B"
    generatedAt = $isoNow
    backendRoot = $BackendRoot
    filesWritten = @(
        "app/market_data/__init__.py",
        "app/market_data/contracts.py",
        "app/market_data/provider.py",
        "app/market_data/databento_adapter.py",
        "app/market_data/README.md",
        "tests/test_market_data_contracts.py"
    )
    compilePassed = $true
    testsPassed = $true
    productionMutation = $false
    vpsMutation = $false
    backupRoot = $BackupRoot
}

$resultPath = Join-Path $StateRoot ("S10_6B_RESULT_" + $stamp + ".json")
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6B DAY 2 COMPLETE ===" -ForegroundColor Green
Write-Host "Market data contract created."
Write-Host "Compile: PASS"
Write-Host "Tests: PASS"
Write-Host "Production mutation: FALSE"
Write-Host "VPS mutation: FALSE"
Write-Host "Backup: $BackupRoot"
Write-Host "Result: $resultPath"
