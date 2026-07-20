# Fail-closed US common-stock security classification.
# Reference/universe filtering only. Databento remains live provider.

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

COMMON_TYPES={
    "stock","common stock","common_stock",
    "common equity","common_equity","equity",
}
NON_COMMON_TYPES={
    "etf","fund","etn","warrant","unit","right",
    "preferred","preferred stock","closed-end fund","trust",
}
BLOCKED_SUFFIXES=("WS","WT","W","U","UN","R","RT")

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
        if key in row and row[key] is not None:
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
    symbol=normalize_symbol(row.get("symbol") or row.get("ticker"))
    name=str(row.get("companyName") or row.get("name") or "").strip()
    security_type=str(
        row.get("type") or row.get("securityType")
        or row.get("assetType") or row.get("instrumentType") or ""
    ).strip().lower()
    exchange=str(
        row.get("exchangeShortName") or row.get("exchange") or ""
    ).strip().upper()
    is_etf=_bool(row,"isEtf","isETF","etf")
    is_fund=_bool(row,"isFund","fund")
    is_active=_bool(row,"isActivelyTrading","activelyTrading","isActive")
    reasons=[]

    if not symbol or not symbol.isalnum() or len(symbol)>5:
        reasons.append("INVALID_SYMBOL_FORMAT")

    lower_name=name.lower()
    if is_etf is True or "exchange traded fund" in lower_name or " etf" in lower_name:
        reasons.append("ETF")
    if is_fund is True or "fund" in security_type or security_type in NON_COMMON_TYPES:
        reasons.append("FUND_OR_NON_COMMON_TYPE")
    if any(token in lower_name for token in (
        "warrant","preferred","preference share",
        "depositary unit","rights","unit",
    )):
        reasons.append("NON_COMMON_NAME")
    if symbol.endswith(BLOCKED_SUFFIXES):
        reasons.append("NON_COMMON_SUFFIX")
    if is_active is False:
        reasons.append("NOT_ACTIVELY_TRADING")
    if exchange and exchange not in {
        "NASDAQ","NYSE","AMEX","NYSEARCA","BATS","CBOE",
    }:
        reasons.append("NON_US_EXCHANGE")

    explicit_common=security_type in COMMON_TYPES
    if reasons:
        classification="BLOCKED_NON_COMMON"
        allowed=False
    elif explicit_common:
        classification="COMMON_STOCK"
        allowed=True
    else:
        classification="UNKNOWN_FAIL_CLOSED"
        allowed=False
        reasons.append("MISSING_EXPLICIT_COMMON_STOCK_EVIDENCE")

    return SecurityDecision(
        symbol=symbol,
        allowed=allowed,
        classification=classification,
        reasons=tuple(sorted(set(reasons))),
        evidence={
            "name":name,
            "securityType":security_type or None,
            "exchange":exchange or None,
            "isEtf":is_etf,
            "isFund":is_fund,
            "isActivelyTrading":is_active,
        },
    )
