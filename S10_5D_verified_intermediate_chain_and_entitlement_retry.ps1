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

$ReportPath = Join-Path $AuditDir "S10_5D_verified_chain_entitlement_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5D_verified_chain_entitlement_raw_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5d_verified_chain_$stamp.py"
$remotePy = "/tmp/s10_5d_verified_chain_$stamp.py"

Write-Host ""
Write-Host "=== S10.5D VERIFIED INTERMEDIATE CHAIN + ENTITLEMENT RETRY ===" -ForegroundColor Green
Write-Host "TEMPORARY PROOF ONLY" -ForegroundColor Yellow
Write-Host "NO INSTALL / NO GLOBAL CA CHANGE / NO SSL BYPASS / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

$pythonCode = @'
import asyncio
import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import Counter
from pathlib import Path

HOST = "websockets.financialmodelingprep.com"
ENDPOINT = "wss://websockets.financialmodelingprep.com"
INTERMEDIATE_URL = "https://crt.sh/?d=4267304690"
EXPECTED_SUBJECT_TOKEN = "Sectigo Public Server Authentication CA DV R36"
SYMBOLS = ["aapl", "msft"]
PROBE_SECONDS = int(os.environ.get("S10_5D_PROBE_SECONDS", "20"))
SYSTEM_CA = "/etc/ssl/certs/ca-certificates.crt"

SECRET_PATTERNS = [
    re.compile(r'("apiKey"\s*:\s*")[^"]+(")', re.I),
    re.compile(r'("apikey"\s*:\s*")[^"]+(")', re.I),
]

def redact_text(value):
    text = str(value)
    for pat in SECRET_PATTERNS:
        text = pat.sub(r'\1***REDACTED***\2', text)
    return text

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

def run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {
            "cmd": cmd,
            "returncode": p.returncode,
            "stdout": p.stdout[-12000:],
            "stderr": p.stderr[-12000:],
        }
    except Exception as exc:
        return {"cmd": cmd, "error": repr(exc)}

def find_api_key():
    for key in (
        "FMP_API_KEY",
        "FINANCIAL_MODELING_PREP_API_KEY",
        "FINANCIALMODELINGPREP_API_KEY",
    ):
        value = os.getenv(key)
        if value and value.strip():
            return value.strip(), "process_env"

    env_file = Path("/opt/skilledge/stock-engine/.env.server")
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k in {
                "FMP_API_KEY",
                "FINANCIAL_MODELING_PREP_API_KEY",
                "FINANCIALMODELINGPREP_API_KEY",
            } and v:
                return v, ".env.server"
    return None, None

def download_intermediate(dest):
    req = urllib.request.Request(
        INTERMEDIATE_URL,
        headers={"User-Agent": "SkillEdge-S10.5D-verification-probe"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    Path(dest).write_bytes(data)
    return {
        "bytes": len(data),
        "sha256Raw": hashlib.sha256(data).hexdigest(),
    }

def convert_and_inspect(src, pem):
    # crt.sh download may be DER or PEM. Try DER first, then PEM.
    der = run([
        "openssl", "x509",
        "-inform", "DER",
        "-in", src,
        "-out", pem,
    ])
    if der.get("returncode") != 0:
        pem_try = run([
            "openssl", "x509",
            "-inform", "PEM",
            "-in", src,
            "-out", pem,
        ])
        if pem_try.get("returncode") != 0:
            return {
                "ok": False,
                "derAttempt": der,
                "pemAttempt": pem_try,
            }

    inspect = run([
        "openssl", "x509",
        "-in", pem,
        "-noout",
        "-subject",
        "-issuer",
        "-dates",
        "-fingerprint",
        "-sha256",
        "-serial",
    ])
    text = (inspect.get("stdout") or "") + (inspect.get("stderr") or "")

    return {
        "ok": inspect.get("returncode") == 0,
        "inspect": inspect,
        "subjectExpectedTokenPresent": EXPECTED_SUBJECT_TOKEN.lower() in text.lower(),
        "pemSha256": hashlib.sha256(Path(pem).read_bytes()).hexdigest() if Path(pem).exists() else None,
    }

def build_bundle(intermediate_pem, bundle):
    system_bytes = Path(SYSTEM_CA).read_bytes()
    inter_bytes = Path(intermediate_pem).read_bytes()
    with open(bundle, "wb") as f:
        f.write(system_bytes)
        if not system_bytes.endswith(b"\n"):
            f.write(b"\n")
        f.write(inter_bytes)
        if not inter_bytes.endswith(b"\n"):
            f.write(b"\n")
    return {
        "size": Path(bundle).stat().st_size,
        "sha256": hashlib.sha256(Path(bundle).read_bytes()).hexdigest(),
    }

def tls_probe(cafile):
    out = {
        "ok": False,
        "peerSubject": None,
        "peerIssuer": None,
        "notBefore": None,
        "notAfter": None,
        "error": None,
    }
    try:
        import socket
        ctx = ssl.create_default_context(cafile=cafile)
        with socket.create_connection((HOST, 443), timeout=15) as sock:
            with ctx.wrap_socket(sock, server_hostname=HOST) as ssock:
                cert = ssock.getpeercert()
                out["ok"] = True
                out["peerSubject"] = cert.get("subject")
                out["peerIssuer"] = cert.get("issuer")
                out["notBefore"] = cert.get("notBefore")
                out["notAfter"] = cert.get("notAfter")
    except Exception as exc:
        out["error"] = repr(exc)
    return out

def classify_messages(messages):
    type_counts = Counter()
    symbols = Counter()
    fields_seen = Counter()
    parsed_messages = []
    raw_unparsed = []

    for item in messages:
        try:
            parsed = item if isinstance(item, (dict, list)) else json.loads(item)
        except Exception:
            raw_unparsed.append(redact_text(item)[:1000])
            continue

        candidates = parsed if isinstance(parsed, list) else [parsed]
        for msg in candidates:
            if not isinstance(msg, dict):
                continue
            clean = sanitize_message(msg)
            parsed_messages.append(clean)

            t = clean.get("type")
            if t is not None:
                type_counts[str(t)] += 1

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

async def ws_probe(api_key, cafile):
    import websockets

    ssl_ctx = ssl.create_default_context(cafile=cafile)
    messages = []
    events = []
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
        events.append({"event": "connected"})

        await ws.send(json.dumps({
            "event": "login",
            "data": {"apiKey": api_key},
        }))
        events.append({"event": "login_sent"})

        await asyncio.sleep(1.0)

        await ws.send(json.dumps({
            "event": "subscribe",
            "data": {"ticker": SYMBOLS},
        }))
        events.append({
            "event": "subscribe_sent",
            "symbols": [s.upper() for s in SYMBOLS],
        })

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
            await ws.send(json.dumps({
                "event": "unsubscribe",
                "data": {"ticker": SYMBOLS},
            }))
            events.append({"event": "unsubscribe_sent"})
        except Exception as exc:
            events.append({
                "event": "unsubscribe_error",
                "error": redact_text(repr(exc))[:1000],
            })

    return {
        "connected": True,
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "events": events,
        "messages": messages,
    }

result = {
    "ok": False,
    "host": HOST,
    "endpoint": ENDPOINT,
    "intermediateSource": INTERMEDIATE_URL,
    "expectedIntermediateSubjectToken": EXPECTED_SUBJECT_TOKEN,
    "symbols": [s.upper() for s in SYMBOLS],
    "probeSecondsRequested": PROBE_SECONDS,
    "apiKeyPresent": False,
    "apiKeySource": None,
    "apiKeyOutput": "NEVER_EMITTED",
    "download": None,
    "intermediate": None,
    "bundle": None,
    "opensslVerify": None,
    "tlsProbe": None,
    "websocketProbe": None,
    "analysis": None,
    "capabilitiesObserved": None,
    "classification": None,
    "error": None,
    "safety": {
        "installPerformed": False,
        "globalCaChanged": False,
        "sslVerificationDisabled": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
        "paperPostPerformed": False,
        "subscriptionChanged": False,
        "apiKeyEmitted": False,
        "temporaryFilesRemoved": False,
    },
}

api_key, key_source = find_api_key()
result["apiKeyPresent"] = bool(api_key)
result["apiKeySource"] = key_source

tmpdir = tempfile.mkdtemp(prefix="skilledge_s105d_")
raw_cert = os.path.join(tmpdir, "sectigo_r36.raw")
intermediate_pem = os.path.join(tmpdir, "sectigo_r36.pem")
bundle = os.path.join(tmpdir, "custom_ca_bundle.pem")

try:
    if not api_key:
        result["classification"] = "NO_API_KEY_FOUND"
        result["error"] = "FMP API key not found."
    elif not Path(SYSTEM_CA).exists():
        result["classification"] = "SYSTEM_CA_MISSING"
        result["error"] = f"System CA bundle missing: {SYSTEM_CA}"
    else:
        result["download"] = download_intermediate(raw_cert)
        result["intermediate"] = convert_and_inspect(raw_cert, intermediate_pem)

        if not result["intermediate"].get("ok"):
            result["classification"] = "INTERMEDIATE_PARSE_FAILED"
        elif not result["intermediate"].get("subjectExpectedTokenPresent"):
            result["classification"] = "INTERMEDIATE_SUBJECT_MISMATCH"
        else:
            result["bundle"] = build_bundle(intermediate_pem, bundle)

            # Verify current server chain with explicit untrusted intermediate.
            result["opensslVerify"] = run([
                "bash", "-lc",
                "printf '' | openssl s_client "
                "-connect websockets.financialmodelingprep.com:443 "
                "-servername websockets.financialmodelingprep.com "
                "-verifyCAfile " + bundle + " "
                "-verify_return_error 2>&1"
            ], timeout=30)

            result["tlsProbe"] = tls_probe(bundle)

            if not result["tlsProbe"].get("ok"):
                result["classification"] = "VERIFIED_BUNDLE_TLS_FAILED"
            else:
                try:
                    probe = asyncio.run(ws_probe(api_key, bundle))
                    messages = probe.pop("messages", [])
                    result["websocketProbe"] = sanitize_message(probe)
                    result["analysis"] = classify_messages(messages)

                    type_counts = result["analysis"]["typeCounts"]
                    has_market_event = any(k in type_counts for k in ("T", "Q", "B"))
                    has_quote_fields = any(
                        result["analysis"]["fieldsSeen"].get(k, 0) > 0
                        for k in ("ap", "as", "bp", "bs")
                    )
                    has_trade_fields = any(
                        result["analysis"]["fieldsSeen"].get(k, 0) > 0
                        for k in ("lp", "ls")
                    )
                    has_timestamp = result["analysis"]["fieldsSeen"].get("t", 0) > 0

                    error_text = " ".join(
                        result["analysis"]["sampleRawUnparsed"]
                        + [
                            json.dumps(x, ensure_ascii=False)
                            for x in result["analysis"]["sampleParsed"]
                            if isinstance(x, dict)
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
                    elif result["analysis"]["parsedMessageCount"] + result["analysis"]["rawUnparsedCount"] > 0:
                        classification = "CONNECTED_BUT_NO_MARKET_EVENTS_CONFIRMED"
                    else:
                        classification = "CONNECTED_NO_MESSAGES_DURING_WINDOW"

                    result["capabilitiesObserved"] = {
                        "marketEventObserved": has_market_event,
                        "quoteFieldsObserved": has_quote_fields,
                        "tradeFieldsObserved": has_trade_fields,
                        "timestampObserved": has_timestamp,
                        "typeCounts": type_counts,
                        "symbolsObserved": result["analysis"]["symbols"],
                    }
                    result["classification"] = classification
                    result["ok"] = True

                except Exception as exc:
                    result["classification"] = "WEBSOCKET_PROBE_EXCEPTION_AFTER_TLS_SUCCESS"
                    result["error"] = redact_text(repr(exc))[:3000]

except Exception as exc:
    result["classification"] = result["classification"] or "PROOF_EXCEPTION"
    result["error"] = redact_text(repr(exc))[:3000]

finally:
    try:
        shutil.rmtree(tmpdir)
        result["safety"]["temporaryFilesRemoved"] = True
    except Exception as exc:
        result["safety"]["temporaryFilesRemoved"] = False
        result["safety"]["temporaryCleanupError"] = repr(exc)

print(json.dumps(result, ensure_ascii=False))
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
Write-Host "=== 1. COPY TEMP PROOF HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN VERIFIED CHAIN + ENTITLEMENT RETRY ===" -ForegroundColor Green

$remoteCommand = "S10_5D_PROBE_SECONDS='$ProbeSeconds' /opt/skilledge/stock-engine/.venv/bin/python '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote proof failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote proof returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

function Has-Prop {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $null -ne $Object.PSObject.Properties[$Name]
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5D VERIFIED INTERMEDIATE CHAIN + FMP ENTITLEMENT RETRY")
$lines.Add("Generated=$stamp")
$lines.Add("HOST=$($result.host)")
$lines.Add("ENDPOINT=$($result.endpoint)")
$lines.Add("INTERMEDIATE_SOURCE=$($result.intermediateSource)")
$lines.Add("EXPECTED_SUBJECT_TOKEN=$($result.expectedIntermediateSubjectToken)")
$lines.Add("API_KEY_PRESENT=$($result.apiKeyPresent)")
$lines.Add("API_KEY_SOURCE=$($result.apiKeySource)")
$lines.Add("API_KEY_OUTPUT=$($result.apiKeyOutput)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("OK=$($result.ok)")
$lines.Add("CLASSIFICATION=$($result.classification)")

if ((Has-Prop $result "error") -and $null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

if ((Has-Prop $result "intermediate") -and $null -ne $result.intermediate) {
    $lines.Add("")
    $lines.Add("=== INTERMEDIATE PROOF ===")
    $lines.Add("INTERMEDIATE_OK=$($result.intermediate.ok)")
    $lines.Add("SUBJECT_EXPECTED_TOKEN_PRESENT=$($result.intermediate.subjectExpectedTokenPresent)")
    if ((Has-Prop $result.intermediate "pemSha256") -and $null -ne $result.intermediate.pemSha256) {
        $lines.Add("INTERMEDIATE_PEM_SHA256=$($result.intermediate.pemSha256)")
    }
}

if ((Has-Prop $result "tlsProbe") -and $null -ne $result.tlsProbe) {
    $lines.Add("")
    $lines.Add("=== TLS PROOF ===")
    $lines.Add("TLS_OK=$($result.tlsProbe.ok)")
    if ((Has-Prop $result.tlsProbe "error") -and $null -ne $result.tlsProbe.error) {
        $lines.Add("TLS_ERROR=$($result.tlsProbe.error)")
    }
}

if ((Has-Prop $result "websocketProbe") -and $null -ne $result.websocketProbe) {
    $lines.Add("")
    $lines.Add("=== WEBSOCKET ===")
    $lines.Add("CONNECTED=$($result.websocketProbe.connected)")
    $lines.Add("ELAPSED_SECONDS=$($result.websocketProbe.elapsedSeconds)")
}

if ((Has-Prop $result "analysis") -and $null -ne $result.analysis) {
    $lines.Add("")
    $lines.Add("=== OBSERVED PROTOCOL ===")
    $lines.Add("PARSED_MESSAGES=$($result.analysis.parsedMessageCount)")
    $lines.Add("RAW_UNPARSED_MESSAGES=$($result.analysis.rawUnparsedCount)")

    $typePairs = @()
    foreach ($prop in $result.analysis.typeCounts.PSObject.Properties) {
        $typePairs += "$($prop.Name):$($prop.Value)"
    }
    $lines.Add("TYPE_COUNTS=$($typePairs -join ',')")

    $symbolPairs = @()
    foreach ($prop in $result.analysis.symbols.PSObject.Properties) {
        $symbolPairs += "$($prop.Name):$($prop.Value)"
    }
    $lines.Add("SYMBOL_COUNTS=$($symbolPairs -join ',')")
}

if ((Has-Prop $result "capabilitiesObserved") -and $null -ne $result.capabilitiesObserved) {
    $lines.Add("")
    $lines.Add("=== CAPABILITIES ===")
    $lines.Add("MARKET_EVENT_OBSERVED=$($result.capabilitiesObserved.marketEventObserved)")
    $lines.Add("QUOTE_FIELDS_OBSERVED=$($result.capabilitiesObserved.quoteFieldsObserved)")
    $lines.Add("TRADE_FIELDS_OBSERVED=$($result.capabilitiesObserved.tradeFieldsObserved)")
    $lines.Add("TIMESTAMP_OBSERVED=$($result.capabilitiesObserved.timestampObserved)")
}

$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("INSTALL_PERFORMED=$($result.safety.installPerformed)")
$lines.Add("GLOBAL_CA_CHANGED=$($result.safety.globalCaChanged)")
$lines.Add("SSL_VERIFICATION_DISABLED=$($result.safety.sslVerificationDisabled)")
$lines.Add("DEPLOY_PERFORMED=$($result.safety.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.safety.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.safety.serviceStateChanged)")
$lines.Add("PAPER_POST_PERFORMED=$($result.safety.paperPostPerformed)")
$lines.Add("SUBSCRIPTION_CHANGED=$($result.safety.subscriptionChanged)")
$lines.Add("API_KEY_EMITTED=$($result.safety.apiKeyEmitted)")
$lines.Add("TEMPORARY_FILES_REMOVED=$($result.safety.temporaryFilesRemoved)")
$lines.Add("")
$lines.Add("RAW_JSON=$RawPath")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5D COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO INSTALL / NO GLOBAL CA CHANGE / NO SSL BYPASS / NO DEPLOY / NO RESTART." -ForegroundColor Yellow
