"""Provider-agnostic dynamic scanner foundation."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from .quote_quality import assess_quote, serialize_assessment


def build_scanner_snapshot(
    market_state_snapshot: dict[str, Any],
    candle_snapshot: dict[str, Any],
) -> dict[str, Any]:
    market_symbols = market_state_snapshot.get("symbols") or {}
    candle_symbols = candle_snapshot.get("symbols") or {}

    rows: list[dict[str, Any]] = []

    for symbol, state in market_symbols.items():
        candle = candle_symbols.get(symbol) or {}

        bid = decimal_or_none(state.get("bidPrice"))
        ask = decimal_or_none(state.get("askPrice"))
        last = decimal_or_none(state.get("lastTradePrice"))
        age = float_or_none(state.get("receiveAgeSeconds"))

        quote = assess_quote(
            bid=bid,
            ask=ask,
            age_seconds=age,
        )

        session_volume = int(
            candle.get("sessionVolume")
            or state.get("sessionVolume")
            or 0
        )
        trade_count = int(state.get("tradeCount") or 0)
        bbo_count = int(state.get("bboCount") or 0)
        spread_pct = quote.spread_pct or Decimal("0")

        activity_score = min(
            Decimal("100"),
            Decimal(trade_count) * Decimal("0.10")
            + Decimal(bbo_count) * Decimal("0.01"),
        )

        liquidity_score = Decimal("0")
        if quote.usable_for_trading:
            liquidity_score = max(
                Decimal("0"),
                Decimal("100") - spread_pct * Decimal("10000"),
            )

        volume_score = min(
            Decimal("100"),
            Decimal(session_volume) / Decimal("10000"),
        )

        in_play_score = (
            activity_score * Decimal("0.35")
            + liquidity_score * Decimal("0.40")
            + volume_score * Decimal("0.25")
        )

        eligible = (
            quote.usable_for_trading
            and last is not None
            and session_volume > 0
        )

        rows.append({
            "symbol": symbol,
            "eligible": eligible,
            "quote": serialize_assessment(quote),
            "lastTradePrice": decimal_string(last),
            "sessionVolume": session_volume,
            "tradeCount": trade_count,
            "bboCount": bbo_count,
            "activityScore": decimal_string(activity_score),
            "liquidityScore": decimal_string(liquidity_score),
            "volumeScore": decimal_string(volume_score),
            "inPlayScore": decimal_string(in_play_score),
            "researchOnly": True,
            "clientEligible": False,
            "telegramEligible": False,
        })

    rows.sort(
        key=lambda item: (
            item["eligible"],
            Decimal(item["inPlayScore"]),
        ),
        reverse=True,
    )

    return {
        "schemaVersion": 1,
        "researchOnly": True,
        "clientCutover": False,
        "telegramCutover": False,
        "symbolCount": len(rows),
        "eligibleCount": sum(1 for row in rows if row["eligible"]),
        "blockedCount": sum(1 for row in rows if not row["eligible"]),
        "items": rows,
    }


def decimal_or_none(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    return Decimal(str(value))


def float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")