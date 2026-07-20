#!/usr/bin/env python3
# Build validated common-stock universe using FMP reference metadata only.

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.data.fmp_client import FmpClient
from app.data.security_master import classify_security

async def fetch_profile(client,symbol):
    payload=await client.get_json("profile",{"symbol":symbol})
    rows=client.normalize_list_payload(payload)
    row=dict(rows[0]) if rows else {}
    row.setdefault("symbol",symbol)
    return row

async def run(source,output,limit):
    payload=json.loads(source.read_text(encoding="utf-8-sig"))
    symbols=(
        payload.get("remoteRuntimeChecks",{})
        .get("stages",{}).get("250",{}).get("symbols")
        or payload.get("targetSymbols") or []
    )
    symbols=list(dict.fromkeys(
        str(x).strip().upper() for x in symbols if str(x).strip()
    ))

    client=FmpClient()
    if not client.is_configured():
        raise RuntimeError("FMP_API_KEY is missing")

    semaphore=asyncio.Semaphore(8)

    async def one(symbol):
        async with semaphore:
            try:
                row=await fetch_profile(client,symbol)
                decision=classify_security(row)
                return {
                    "symbol":symbol,
                    "profile":row,
                    "decision":{
                        "allowed":decision.allowed,
                        "classification":decision.classification,
                        "reasons":list(decision.reasons),
                        "evidence":decision.evidence,
                    },
                }
            except Exception as exc:
                return {
                    "symbol":symbol,
                    "profile":{},
                    "decision":{
                        "allowed":False,
                        "classification":"REFERENCE_FETCH_FAILED",
                        "reasons":[repr(exc)[:500]],
                        "evidence":{},
                    },
                }

    rows=await asyncio.gather(*(one(s) for s in symbols))
    allowed=[r["symbol"] for r in rows if r["decision"]["allowed"]][:limit]
    blocked=[r for r in rows if not r["decision"]["allowed"]]
    result={
        "ok":len(allowed)>=limit,
        "classification":(
            "COMMON_STOCK_UNIVERSE_VALIDATED"
            if len(allowed)>=limit
            else "COMMON_STOCK_UNIVERSE_INSUFFICIENT"
        ),
        "requestedLimit":limit,
        "sourceSymbolCount":len(symbols),
        "validatedCommonStockCount":len(allowed),
        "symbols":allowed,
        "blockedCount":len(blocked),
        "blocked":blocked,
        "liveProvider":"databento",
        "referenceProvider":"fmp",
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
    }
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(
        json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8"
    )
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--source",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--limit",type=int,default=250)
    args=parser.parse_args()
    result=asyncio.run(run(Path(args.source),Path(args.output),args.limit))
    print(json.dumps(result,ensure_ascii=False))
    return 0 if result["ok"] else 2

if __name__=="__main__":
    raise SystemExit(main())
