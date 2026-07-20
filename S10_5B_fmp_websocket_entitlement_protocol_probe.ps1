param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner",
    [int]$ProbeSeconds = 20
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

if ($ProbeSeconds -lt 5 -or $ProbeSeconds -gt 60) {
    throw "ProbeSeconds must be between 5 and 60."
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_5B_fmp_websocket_entitlement_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5B_fmp_websocket_entitlement_raw_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5b_fmp_ws_probe_$stamp.py"
$remotePy = "/tmp/s10_5b_fmp_ws_probe_$stamp.py"

Write-Host ""
Write-Host "=== S10.5B FMP WEBSOCKET ENTITLEMENT + PROTOCOL PROBE ===" -ForegroundColor Green
Write-Host "DIAGNOSTIC ONLY" -ForegroundColor Yellow
Write-Host "NO INSTALL / NO DEPLOY / NO RESTART / NO SERVICE CHANGE / NO KEY OUTPUT" -ForegroundColor Yellow

$pythonCode = @'
import asyncio
import json
import os
import re
import ssl
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

ENDPOINT = "wss://websockets.financialmodelingprep.com"
SYMBOLS = ["aapl", "msft"]
PROBE_SECONDS = int(os.environ.get("S10_5B_PROBE_SECONDS", "20"))

SECRET_PATTERNS = [
    re.compile(r'("apiKey"\s*:\s*")[^"]+(")', re.I),
    re.compile(r'("apikey"\s*:\s*")[^"]+(")', re.I),
]

def redact_text(value):
    text = str(value)
    for pat in SECRET_PATTERNS:
        text = pat.sub(r'\1***REDACTED***\2', text)
    return text

def find_api_key():
    candidates = [
        os.getenv("FMP_API_KEY"),
        os.getenv("FINANCIAL_MODELING_PREP_API_KEY"),
        os.getenv("FINANCIALMODELINGPREP_API_KEY"),
    ]
    for value in candidates:
        if value and value.strip():
            return value.strip(), "process_env"

    env_file = Path("/opt/skilledge/stock-engine/.env.server")
    if env_file.exists():
        try:
            for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key in {
                    "FMP_API_KEY",
                    "FINANCIAL_MODELING_PREP_API_KEY",
                    "FINANCIALMODELINGPREP_API_KEY",
                } and value:
                    return value, ".env.server"
        except Exception:
            pass

    return None, None

def sanitize_message(obj):
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            if str(k).lower() in {"apikey", "api_key", "token", "authorization"}:
                clean[k] = "***REDACTED***"
            else:
                clean[k] = sanitize_message(v)
        return clean
    if isinstance(obj, list):
        return [sanitize_message(x) for x in obj]
    if isinstance(obj, str):
        return redact_text(obj)
    return obj

def classify_messages(messages):
    type_counts = Counter()
    symbols = Counter()
    fields_seen = Counter()
    parsed_messages = []
    raw_unparsed = []

    for item in messages:
        parsed = None
        if isinstance(item, (dict, list)):
            parsed = item
        else:
            try:
                parsed = json.loads(item)
            except Exception:
                raw_unparsed.append(redact_text(item)[:1000])
                continue

        candidates = parsed if isinstance(parsed, list) else [parsed]

        for msg in candidates:
            if not isinstance(msg, dict):
                continue

            clean = sanitize_message(msg)
            parsed_messages.append(clean)

            msg_type = clean.get("type")
            if msg_type is not None:
                type_counts[str(msg_type)] += 1

            symbol = clean.get("s") or clean.get("symbol") or clean.get("ticker")
            if symbol is not None:
                symbols[str(symbol).upper()] += 1

            for field in ("t", "ap", "as", "bp", "bs", "lp", "ls"):
                if field in clean and clean.get(field) is not None:
                    fields_seen[field] += 1

    return {
        "typeCounts": dict(type_counts),
        "symbols": dict(symbols),
        "fieldsSeen": dict(fields_seen),
        "parsedMessageCount": len(parsed_messages),
        "rawUnparsedCount": len(raw_unparsed),
        "sampleParsed": parsed_messages[:20],
        "sampleRawUnparsed": raw_unparsed[:10],
    }

async def probe_with_websockets(api_key):
    import websockets

    messages = []
    events = []
    connected = False
    login_sent = False
    subscribe_sent = False
    unsubscribe_sent = False

    ssl_ctx = ssl.create_default_context()

    started = time.monotonic()

    async with websockets.connect(
        ENDPOINT,
        ssl=ssl_ctx,
        open_timeout=15,
        close_timeout=5,
        ping_interval=20,
        ping_timeout=20,
        max_size=2 * 1024 * 1024,
    ) as ws:
        connected = True
        events.append({"event": "connected"})

        login = {
            "event": "login",
            "data": {"apiKey": api_key},
        }
        await ws.send(json.dumps(login))
        login_sent = True
        events.append({"event": "login_sent"})

        await asyncio.sleep(1.0)

        subscribe = {
            "event": "subscribe",
            "data": {"ticker": SYMBOLS},
        }
        await ws.send(json.dumps(subscribe))
        subscribe_sent = True
        events.append({"event": "subscribe_sent", "symbols": [s.upper() for s in SYMBOLS]})

        deadline = time.monotonic() + PROBE_SECONDS

        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=min(2.0, remaining))
                messages.append(msg)
            except asyncio.TimeoutError:
                continue

        try:
            unsubscribe = {
                "event": "unsubscribe",
                "data": {"ticker": SYMBOLS},
            }
            await ws.send(json.dumps(unsubscribe))
            unsubscribe_sent = True
            events.append({"event": "unsubscribe_sent"})
        except Exception as exc:
            events.append({
                "event": "unsubscribe_error",
                "error": redact_text(repr(exc))[:1000],
            })

    elapsed = round(time.monotonic() - started, 3)

    return {
        "transport": "websockets",
        "connected": connected,
        "loginSent": login_sent,
        "subscribeSent": subscribe_sent,
        "unsubscribeSent": unsubscribe_sent,
        "elapsedSeconds": elapsed,
        "messages": messages,
        "events": events,
    }

def probe_with_websocket_client(api_key):
    import websocket

    messages = []
    events = []
    connected = False
    login_sent = False
    subscribe_sent = False
    unsubscribe_sent = False

    started = time.monotonic()
    ws = websocket.create_connection(
        ENDPOINT,
        timeout=10,
        sslopt={"cert_reqs": ssl.CERT_REQUIRED},
    )

    try:
        connected = True
        events.append({"event": "connected"})

        ws.send(json.dumps({
            "event": "login",
            "data": {"apiKey": api_key},
        }))
        login_sent = True
        events.append({"event": "login_sent"})

        time.sleep(1.0)

        ws.send(json.dumps({
            "event": "subscribe",
            "data": {"ticker": SYMBOLS},
        }))
        subscribe_sent = True
        events.append({"event": "subscribe_sent", "symbols": [s.upper() for s in SYMBOLS]})

        deadline = time.monotonic() + PROBE_SECONDS

        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            ws.settimeout(min(2.0, remaining))
            try:
                messages.append(ws.recv())
            except Exception as exc:
                text = repr(exc).lower()
                if "timed out" in text or "timeout" in text:
                    continue
                events.append({
                    "event": "recv_error",
                    "error": redact_text(repr(exc))[:1000],
                })
                break

        try:
            ws.send(json.dumps({
                "event": "unsubscribe",
                "data": {"ticker": SYMBOLS},
            }))
            unsubscribe_sent = True
            events.append({"event": "unsubscribe_sent"})
        except Exception as exc:
            events.append({
                "event": "unsubscribe_error",
                "error": redact_text(repr(exc))[:1000],
            })

    finally:
        try:
            ws.close()
        except Exception:
            pass

    elapsed = round(time.monotonic() - started, 3)

    return {
        "transport": "websocket-client",
        "connected": connected,
        "loginSent": login_sent,
        "subscribeSent": subscribe_sent,
        "unsubscribeSent": unsubscribe_sent,
        "elapsedSeconds": elapsed,
        "messages": messages,
        "events": events,
    }

def package_probe():
    result = {
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
        "websockets": False,
        "websocketClient": False,
        "websocketsVersion": None,
        "websocketClientVersion": None,
    }

    try:
        import websockets
        result["websockets"] = True
        result["websocketsVersion"] = getattr(websockets, "__version__", None)
    except Exception:
        pass

    try:
        import websocket
        result["websocketClient"] = True
        result["websocketClientVersion"] = getattr(websocket, "__version__", None)
    except Exception:
        pass

    return result

api_key, key_source = find_api_key()
packages = package_probe()

output = {
    "ok": False,
    "endpoint": ENDPOINT,
    "symbols": [s.upper() for s in SYMBOLS],
    "probeSecondsRequested": PROBE_SECONDS,
    "apiKeyPresent": bool(api_key),
    "apiKeySource": key_source,
    "apiKeyOutput": "NEVER_EMITTED",
    "packages": packages,
    "probe": None,
    "analysis": None,
    "classification": None,
    "error": None,
    "safety": {
        "installPerformed": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
        "paperPostPerformed": False,
        "subscriptionChanged": False,
        "apiKeyEmitted": False,
    },
}

if not api_key:
    output["classification"] = "NO_API_KEY_FOUND"
    output["error"] = "FMP API key was not found in process env or .env.server."
    print(json.dumps(output, ensure_ascii=False))
    raise SystemExit(0)

try:
    probe = None

    if packages["websockets"]:
        probe = asyncio.run(probe_with_websockets(api_key))
    elif packages["websocketClient"]:
        probe = probe_with_websocket_client(api_key)
    else:
        output["classification"] = "LOCAL_WEBSOCKET_CLIENT_DEPENDENCY_MISSING"
        output["error"] = (
            "Neither 'websockets' nor 'websocket-client' is installed in the current venv. "
            "No package was installed automatically."
        )
        print(json.dumps(output, ensure_ascii=False))
        raise SystemExit(0)

    messages = probe.pop("messages", [])
    analyzed = classify_messages(messages)

    output["probe"] = sanitize_message(probe)
    output["analysis"] = analyzed

    total_messages = analyzed["parsedMessageCount"] + analyzed["rawUnparsedCount"]
    market_types = analyzed["typeCounts"]
    has_market_event = any(k in market_types for k in ("T", "Q", "B"))
    has_quote_fields = any(
        analyzed["fieldsSeen"].get(k, 0) > 0
        for k in ("ap", "bp", "as", "bs")
    )
    has_trade_fields = any(
        analyzed["fieldsSeen"].get(k, 0) > 0
        for k in ("lp", "ls")
    )
    has_timestamp = analyzed["fieldsSeen"].get("t", 0) > 0

    error_text = " ".join(
        analyzed["sampleRawUnparsed"]
        + [
            json.dumps(x, ensure_ascii=False)
            for x in analyzed["sampleParsed"]
            if isinstance(x, dict)
            and any(
                token in json.dumps(x, ensure_ascii=False).lower()
                for token in ("error", "unauthorized", "forbidden", "plan", "upgrade", "invalid")
            )
        ]
    ).lower()

    entitlement_error = any(
        token in error_text
        for token in (
            "unauthorized",
            "forbidden",
            "not authorized",
            "not entitled",
            "upgrade",
            "invalid api",
            "invalid key",
            "subscription",
            "plan",
        )
    )

    if has_market_event:
        classification = "INCLUDED_AND_STREAMING"
    elif entitlement_error:
        classification = "NOT_ENTITLED_OR_AUTH_REJECTED"
    elif probe.get("connected") and total_messages > 0:
        classification = "CONNECTED_BUT_NO_MARKET_EVENTS_CONFIRMED"
    elif probe.get("connected"):
        classification = "CONNECTED_NO_MESSAGES_DURING_WINDOW"
    else:
        classification = "CONNECTION_FAILED"

    output["ok"] = bool(probe.get("connected"))
    output["classification"] = classification
    output["capabilitiesObserved"] = {
        "marketEventObserved": has_market_event,
        "quoteFieldsObserved": has_quote_fields,
        "tradeFieldsObserved": has_trade_fields,
        "timestampObserved": has_timestamp,
        "typeCounts": market_types,
        "symbolsObserved": analyzed["symbols"],
    }

except Exception as exc:
    output["classification"] = "PROBE_EXCEPTION"
    output["error"] = redact_text(repr(exc))[:3000]

print(json.dumps(output, ensure_ascii=False))
'@

[System.IO.File]::WriteAllText(
    $localPy,
    $pythonCode,
    [System.Text.UTF8Encoding]::new($false)
)

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== 1. COPY TEMP DIAGNOSTIC HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN FMP WEBSOCKET PROBE FROM EXISTING VPS VENV ===" -ForegroundColor Green

$remoteCommand = "S10_5B_PROBE_SECONDS='$ProbeSeconds' /opt/skilledge/stock-engine/.venv/bin/python '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote probe process failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote probe returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5B FMP WEBSOCKET ENTITLEMENT + PROTOCOL PROBE")
$lines.Add("Generated=$stamp")
$lines.Add("ENDPOINT=$($result.endpoint)")
$lines.Add("SYMBOLS=$(@($result.symbols) -join ',')")
$lines.Add("PROBE_SECONDS_REQUESTED=$($result.probeSecondsRequested)")
$lines.Add("API_KEY_PRESENT=$($result.apiKeyPresent)")
$lines.Add("API_KEY_SOURCE=$($result.apiKeySource)")
$lines.Add("API_KEY_OUTPUT=$($result.apiKeyOutput)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("OK=$($result.ok)")
$lines.Add("CLASSIFICATION=$($result.classification)")

if ($null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

$lines.Add("")
$lines.Add("=== CLIENT LIBRARIES ===")
$lines.Add("PYTHON=$($result.packages.pythonExecutable)")
$lines.Add("PYTHON_VERSION=$($result.packages.pythonVersion)")
$lines.Add("WEBSOCKETS_INSTALLED=$($result.packages.websockets)")
$lines.Add("WEBSOCKETS_VERSION=$($result.packages.websocketsVersion)")
$lines.Add("WEBSOCKET_CLIENT_INSTALLED=$($result.packages.websocketClient)")
$lines.Add("WEBSOCKET_CLIENT_VERSION=$($result.packages.websocketClientVersion)")

if ($null -ne $result.probe) {
    $lines.Add("")
    $lines.Add("=== CONNECTION ===")
    $lines.Add("TRANSPORT=$($result.probe.transport)")
    $lines.Add("CONNECTED=$($result.probe.connected)")
    $lines.Add("LOGIN_SENT=$($result.probe.loginSent)")
    $lines.Add("SUBSCRIBE_SENT=$($result.probe.subscribeSent)")
    $lines.Add("UNSUBSCRIBE_SENT=$($result.probe.unsubscribeSent)")
    $lines.Add("ELAPSED_SECONDS=$($result.probe.elapsedSeconds)")
}

if ($null -ne $result.analysis) {
    $lines.Add("")
    $lines.Add("=== OBSERVED PROTOCOL ===")
    $lines.Add("PARSED_MESSAGES=$($result.analysis.parsedMessageCount)")
    $lines.Add("RAW_UNPARSED_MESSAGES=$($result.analysis.rawUnparsedCount)")
}

if ($null -ne $result.capabilitiesObserved) {
    $lines.Add("")
    $lines.Add("=== CAPABILITIES OBSERVED ===")
    $lines.Add("MARKET_EVENT_OBSERVED=$($result.capabilitiesObserved.marketEventObserved)")
    $lines.Add("QUOTE_FIELDS_OBSERVED=$($result.capabilitiesObserved.quoteFieldsObserved)")
    $lines.Add("TRADE_FIELDS_OBSERVED=$($result.capabilitiesObserved.tradeFieldsObserved)")
    $lines.Add("TIMESTAMP_OBSERVED=$($result.capabilitiesObserved.timestampObserved)")
}

$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("INSTALL_PERFORMED=$($result.safety.installPerformed)")
$lines.Add("DEPLOY_PERFORMED=$($result.safety.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.safety.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.safety.serviceStateChanged)")
$lines.Add("PAPER_POST_PERFORMED=$($result.safety.paperPostPerformed)")
$lines.Add("SUBSCRIPTION_CHANGED=$($result.safety.subscriptionChanged)")
$lines.Add("API_KEY_EMITTED=$($result.safety.apiKeyEmitted)")
$lines.Add("")
$lines.Add("RAW_JSON=$RawPath")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5B COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO INSTALL / NO DEPLOY / NO RESTART / NO SERVICE CHANGE / NO KEY OUTPUT." -ForegroundColor Yellow
