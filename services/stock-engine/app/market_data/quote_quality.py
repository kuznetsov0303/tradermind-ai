"""Quote-quality classification for real-time scanner and strategy gates."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class QuoteQuality(str, Enum):
    VALID = "VALID"
    LOCKED = "LOCKED"
    CROSSED = "CROSSED"
    WIDE = "WIDE"
    STALE = "STALE"
    MISSING = "MISSING"


@dataclass(frozen=True, slots=True)
class QuoteAssessment:
    quality: QuoteQuality
    usable_for_trading: bool
    spread: Decimal | None
    spread_pct: Decimal | None
    midpoint: Decimal | None
    reason: str | None


def assess_quote(
    *,
    bid: Decimal | None,
    ask: Decimal | None,
    age_seconds: float | None,
    max_age_seconds: float = 20.0,
    max_spread_pct: Decimal = Decimal("0.01"),
    max_absolute_spread: Decimal = Decimal("1.00"),
) -> QuoteAssessment:
    if bid is None or ask is None or bid <= 0 or ask <= 0:
        return QuoteAssessment(
            quality=QuoteQuality.MISSING,
            usable_for_trading=False,
            spread=None,
            spread_pct=None,
            midpoint=None,
            reason="missing_or_non_positive_quote",
        )

    midpoint = (bid + ask) / Decimal("2")
    spread = ask - bid
    spread_pct = spread / midpoint if midpoint > 0 else None

    if age_seconds is None or age_seconds > max_age_seconds:
        return QuoteAssessment(
            quality=QuoteQuality.STALE,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="quote_is_stale",
        )

    if bid > ask:
        return QuoteAssessment(
            quality=QuoteQuality.CROSSED,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="bid_above_ask",
        )

    if bid == ask:
        return QuoteAssessment(
            quality=QuoteQuality.LOCKED,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="bid_equals_ask",
        )

    if (
        spread > max_absolute_spread
        or (
            spread_pct is not None
            and spread_pct > max_spread_pct
        )
    ):
        return QuoteAssessment(
            quality=QuoteQuality.WIDE,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="spread_exceeds_quality_limit",
        )

    return QuoteAssessment(
        quality=QuoteQuality.VALID,
        usable_for_trading=True,
        spread=spread,
        spread_pct=spread_pct,
        midpoint=midpoint,
        reason=None,
    )


def serialize_assessment(value: QuoteAssessment) -> dict[str, object]:
    return {
        "quality": value.quality.value,
        "usableForTrading": value.usable_for_trading,
        "spread": decimal_string(value.spread),
        "spreadPct": decimal_string(value.spread_pct),
        "midpoint": decimal_string(value.midpoint),
        "reason": value.reason,
    }


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")