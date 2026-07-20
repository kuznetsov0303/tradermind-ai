from __future__ import annotations

from dataclasses import dataclass
from typing import Any

COMMON_TYPES={
    "stock","common stock","common_stock",
    "common equity","common_equity","equity",
}

NON_COMMON_TYPES={
    "etf","fund","etn","warrant","unit","right","rights",
    "preferred","preferred stock","closed-end fund","trust",
}

US_EXCHANGES={
    "NASDAQ","NYSE","AMEX","NYSEAMERICAN","BATS","CBOE",
}

BLOCKED_NAME_TOKENS=(
    "warrant","preferred","preference share",
    "depositary unit","subscription right","rights",
    " units"," unit ",
)

BLOCKED_RAW_SYMBOL_PATTERNS=(
    ".W","-W","/W",".WS","-WS","/WS",
    ".WT","-WT","/WT",".U","-U","/U",
    ".R","-R","/R",
)

@dataclass(frozen=True)
class SecurityDecision:
    symbol:str
    allowed:bool
    classification:str
    reasons:tuple[str,...]
    evidence:dict[str,Any]

def normalize_symbol(value:Any)->str:
    raw=str(value or "").strip().upper()
    return "".join(ch for ch in raw if ch.isalnum())

def _bool(row:dict[str,Any],*keys:str)->bool|None:
    for key in keys:
        if key not in row or row[key] is None:
            continue

        value=row[key]

        if isinstance(value,bool):
            return value

        text=str(value).strip().lower()

        if text in {"true","1","yes"}:
            return True

        if text in {"false","0","no"}:
            return False

    return None

def classify_security(row:dict[str,Any])->SecurityDecision:
    raw_symbol=str(row.get("symbol") or row.get("ticker") or "").strip().upper()
    symbol=normalize_symbol(raw_symbol)
    name=str(row.get("companyName") or row.get("name") or "").strip()
    security_type=str(
        row.get("type")
        or row.get("securityType")
        or row.get("assetType")
        or row.get("instrumentType")
        or ""
    ).strip().lower()
    exchange=str(
        row.get("exchangeShortName")
        or row.get("exchange")
        or ""
    ).strip().upper()

    is_etf=_bool(row,"isEtf","isETF","etf")
    is_fund=_bool(row,"isFund","fund")
    is_active=_bool(row,"isActivelyTrading","activelyTrading","isActive")

    reasons=[]
    lower_name=f" {name.lower()} "

    if not symbol or not symbol.isalnum() or len(symbol)>5:
        reasons.append("INVALID_SYMBOL_FORMAT")

    if is_etf is True or "exchange traded fund" in lower_name or " etf " in lower_name:
        reasons.append("ETF")

    if is_fund is True:
        reasons.append("FUND")

    if security_type in NON_COMMON_TYPES or "fund" in security_type:
        reasons.append("EXPLICIT_NON_COMMON_TYPE")

    if any(token in lower_name for token in BLOCKED_NAME_TOKENS):
        reasons.append("NON_COMMON_NAME")

    if any(pattern in raw_symbol for pattern in BLOCKED_RAW_SYMBOL_PATTERNS):
        reasons.append("NON_COMMON_RAW_SYMBOL_PATTERN")

    if is_active is False:
        reasons.append("NOT_ACTIVELY_TRADING")

    if exchange and exchange not in US_EXCHANGES:
        reasons.append("NON_US_EXCHANGE")

    explicit_common=security_type in COMMON_TYPES
    reference_flags_common=(
        is_etf is False
        and is_fund is False
        and is_active is True
        and exchange in US_EXCHANGES
    )

    if reasons:
        classification="BLOCKED_NON_COMMON"
        allowed=False
    elif explicit_common:
        classification="COMMON_STOCK_EXPLICIT_TYPE"
        allowed=True
    elif reference_flags_common:
        classification="COMMON_STOCK_REFERENCE_FLAGS"
        allowed=True
    else:
        classification="UNKNOWN_FAIL_CLOSED"
        allowed=False
        reasons.append("INSUFFICIENT_COMMON_STOCK_EVIDENCE")

    return SecurityDecision(
        symbol=symbol,
        allowed=allowed,
        classification=classification,
        reasons=tuple(sorted(set(reasons))),
        evidence={
            "rawSymbol":raw_symbol or None,
            "name":name,
            "securityType":security_type or None,
            "exchange":exchange or None,
            "isEtf":is_etf,
            "isFund":is_fund,
            "isActivelyTrading":is_active,
        },
    )
