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

$ReportPath = Join-Path $AuditDir "S10_5E_aia_chain_entitlement_report_FIXED_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5E_aia_chain_entitlement_raw_FIXED_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5e_aia_chain_fixed_$stamp.py"
$remotePy = "/tmp/s10_5e_aia_chain_fixed_$stamp.py"

Write-Host ""
Write-Host "=== S10.5E FIXED AIA CHAIN RECOVERY + FMP ENTITLEMENT PROBE ===" -ForegroundColor Green
Write-Host "POWERSHELL 5.1 SAFE" -ForegroundColor Yellow
Write-Host "NO INSTALL / NO GLOBAL CA CHANGE / NO SSL BYPASS / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

$pythonCode = @'
import asyncio
import hashlib
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.request
from collections import Counter
from pathlib import Path

HOST = "websockets.financialmodelingprep.com"
PORT = 443
ENDPOINT = f"wss://{HOST}"
SYMBOLS = ["aapl", "msft"]
PROBE_SECONDS = int(os.environ.get("S10_5E_PROBE_SECONDS", "20"))
SYSTEM_CA = "/etc/ssl/certs/ca-certificates.crt"

def run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {
            "cmd": cmd,
            "returncode": p.returncode,
            "stdout": p.stdout[-20000:],
            "stderr": p.stderr[-20000:],
        }
    except Exception as exc:
        return {"cmd": cmd, "error": repr(exc)}

def redact_text(value):
    text = str(value)
    text = re.sub(r'("apiKey"\s*:\s*")[^"]+(")', r'\1***REDACTED***\2', text, flags=re.I)
    text = re.sub(r'("apikey"\s*:\s*")[^"]+(")', r'\1***REDACTED***\2', text, flags=re.I)
    return text

def sanitize(obj):
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            if str(k).lower() in {"apikey", "api_key", "token", "authorization"}:
                clean[k] = "***REDACTED***"
            else:
                clean[k] = sanitize(v)
        return clean
    if isinstance(obj, list):
        return [sanitize(x) for x in obj]
    if isinstance(obj, str):
        return redact_text(obj)
    return obj

def find_api_key():
    for key in ("FMP_API_KEY", "FINANCIAL_MODELING_PREP_API_KEY", "FINANCIALMODELINGPREP_API_KEY"):
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
            if k in {"FMP_API_KEY", "FINANCIAL_MODELING_PREP_API_KEY", "FINANCIALMODELINGPREP_API_KEY"} and v:
                return v, ".env.server"
    return None, None

def fetch_leaf_pem(out_pem):
    res = run([
        "bash", "-lc",
        "printf '' | openssl s_client "
        f"-connect {HOST}:{PORT} "
        f"-servername {HOST} "
        "-showcerts 2>/dev/null"
    ], timeout=30)

    text = res.get("stdout") or ""
    m = re.search(
        r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
        text,
        flags=re.S,
    )

    if not m:
        return {
            "ok": False,
            "error": "Could not extract leaf certificate from openssl s_client output.",
            "openssl": res,
        }

    pem = m.group(0) + "\n"
    Path(out_pem).write_text(pem, encoding="ascii")

    return {
        "ok": True,
        "openssl": res,
        "sha256Pem": hashlib.sha256(Path(out_pem).read_bytes()).hexdigest(),
    }

def inspect_cert(path):
    res = run([
        "openssl", "x509",
        "-in", path,
        "-noout",
        "-subject",
        "-issuer",
        "-serial",
        "-dates",
        "-fingerprint",
        "-sha256",
        "-text",
    ], timeout=30)

    text = (res.get("stdout") or "") + "\n" + (res.get("stderr") or "")
    aia_urls = re.findall(r"CA Issuers - URI:([^\s]+)", text)
    ocsp_urls = re.findall(r"OCSP - URI:([^\s]+)", text)

    return {
        "ok": res.get("returncode") == 0,
        "inspect": res,
        "aiaCaIssuersUrls": aia_urls,
        "ocspUrls": ocsp_urls,
    }

def download_url(url, dest):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SkillEdge-S10.5E-AIA-chain-probe"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type")

    Path(dest).write_bytes(data)

    return {
        "ok": True,
        "url": url,
        "bytes": len(data),
        "sha256Raw": hashlib.sha256(data).hexdigest(),
        "contentType": content_type,
    }

def convert_cert_to_pem(src, dest):
    der = run(["openssl", "x509", "-inform", "DER", "-in", src, "-out", dest], timeout=20)
    if der.get("returncode") == 0:
        return {"ok": True, "inputFormat": "DER", "result": der}

    pem = run(["openssl", "x509", "-inform", "PEM", "-in", src, "-out", dest], timeout=20)
    if pem.get("returncode") == 0:
        return {"ok": True, "inputFormat": "PEM", "result": pem}

    return {"ok": False, "derAttempt": der, "pemAttempt": pem}

def build_custom_bundle(intermediate_pem, bundle_path):
    system_bytes = Path(SYSTEM_CA).read_bytes()
    inter_bytes = Path(intermediate_pem).read_bytes()

    with open(bundle_path, "wb") as f:
        f.write(system_bytes)
        if not system_bytes.endswith(b"\n"):
            f.write(b"\n")
        f.write(inter_bytes)
        if not inter_bytes.endswith(b"\n"):
            f.write(b"\n")

    return {
        "ok": True,
        "size": Path(bundle_path).stat().st_size,
        "sha256": hashlib.sha256(Path(bundle_path).read_bytes()).hexdigest(),
    }

def verify_leaf(leaf_pem, intermediate_pem):
    return run([
        "openssl", "verify",
        "-CAfile", SYSTEM_CA,
        "-untrusted", intermediate_pem,
        leaf_pem,
    ], timeout=30)

def tls_probe(custom_bundle):
    result = {"ok": False, "error": None, "peerSubject": None, "peerIssuer": None}
    try:
        ctx = ssl.create_default_context(cafile=custom_bundle)
        with socket.create_connection((HOST, PORT), timeout=15) as sock:
            with ctx.wrap_socket(sock, server_hostname=HOST) as ssock:
                cert = ssock.getpeercert()
                result["ok"] = True
                result["peerSubject"] = cert.get("subject")
                result["peerIssuer"] = cert.get("issuer")
                result["cipher"] = ssock.cipher()
    except Exception as exc:
        result["error"] = repr(exc)
    return result

def classify_messages(messages):
    type_counts = Counter()
    symbol_counts = Counter()
    fields_seen = Counter()
    parsed = []
    raw_unparsed = []

    for item in messages:
        try:
            obj = item if isinstance(item, (dict, list)) else json.loads(item)
        except Exception:
            raw_unparsed.append(redact_text(item)[:1000])
            continue

        candidates = obj if isinstance(obj, list) else [obj]
        for msg in candidates:
            if not isinstance(msg, dict):
                continue

            clean = sanitize(msg)
            parsed.append(clean)

            msg_type = clean.get("type")
            if msg_type is not None:
                type_counts[str(msg_type)] += 1

            symbol = clean.get("s") or clean.get("symbol") or clean.get("ticker")
            if symbol is not None:
                symbol_counts[str(symbol).upper()] += 1

            for field in ("t", "ap", "as", "bp", "bs", "lp", "ls"):
                if field in clean and clean.get(field) is not None:
                    fields_seen[field] += 1

    return {
        "typeCounts": dict(type_counts),
        "symbols": dict(symbol_counts),
        "fieldsSeen": dict(fields_seen),
        "parsedMessageCount": len(parsed),
        "rawUnparsedCount": len(raw_unparsed),
        "sampleParsed": parsed[:30],
        "sampleRawUnparsed": raw_unparsed[:10],
    }

async def ws_probe(api_key, custom_bundle):
    import websockets

    ssl_ctx = ssl.create_default_context(cafile=custom_bundle)
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
            await ws.send(json.dumps({
                "event": "unsubscribe",
                "data": {"ticker": SYMBOLS},
            }))
            events.append({"event": "unsubscribe_sent"})
        except Exception as exc:
            events.append({"event": "unsubscribe_error", "error": redact_text(repr(exc))[:1000]})

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
    "symbols": [s.upper() for s in SYMBOLS],
    "probeSecondsRequested": PROBE_SECONDS,
    "apiKeyPresent": False,
    "apiKeySource": None,
    "apiKeyOutput": "NEVER_EMITTED",
    "leafFetch": None,
    "leaf": None,
    "aiaSelectedUrl": None,
    "intermediateDownload": None,
    "intermediateConvert": None,
    "intermediate": None,
    "leafVerify": None,
    "customBundle": None,
    "tlsProbe": None,
    "websocketProbe": None,
    "analysis": None,
    "capabilitiesObserved": None,
    "classification": None,
    "error": None,
    "safety": {
        "installPerformed": False,
        "packageChanged": False,
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

tmpdir = tempfile.mkdtemp(prefix="skilledge_s105e_")
leaf_pem = os.path.join(tmpdir, "fmp_leaf.pem")
intermediate_raw = os.path.join(tmpdir, "intermediate.raw")
intermediate_pem = os.path.join(tmpdir, "intermediate.pem")
custom_bundle = os.path.join(tmpdir, "custom_bundle.pem")

try:
    if not api_key:
        result["classification"] = "NO_API_KEY_FOUND"
        result["error"] = "FMP API key not found."
    elif not Path(SYSTEM_CA).exists():
        result["classification"] = "SYSTEM_CA_MISSING"
        result["error"] = f"Missing system CA bundle: {SYSTEM_CA}"
    else:
        result["leafFetch"] = fetch_leaf_pem(leaf_pem)

        if not result["leafFetch"].get("ok"):
            result["classification"] = "LEAF_FETCH_FAILED"
        else:
            result["leaf"] = inspect_cert(leaf_pem)
            aia_urls = result["leaf"].get("aiaCaIssuersUrls") or []

            if not aia_urls:
                result["classification"] = "NO_AIA_CA_ISSUERS_URL"
            else:
                selected = aia_urls[0]
                result["aiaSelectedUrl"] = selected
                result["intermediateDownload"] = download_url(selected, intermediate_raw)
                result["intermediateConvert"] = convert_cert_to_pem(intermediate_raw, intermediate_pem)

                if not result["intermediateConvert"].get("ok"):
                    result["classification"] = "INTERMEDIATE_CONVERT_FAILED"
                else:
                    result["intermediate"] = inspect_cert(intermediate_pem)

                    if not result["intermediate"].get("ok"):
                        result["classification"] = "INTERMEDIATE_INSPECT_FAILED"
                    else:
                        result["leafVerify"] = verify_leaf(leaf_pem, intermediate_pem)

                        verify_ok = (
                            result["leafVerify"].get("returncode") == 0
                            and ": OK" in (result["leafVerify"].get("stdout") or "")
                        )

                        if not verify_ok:
                            result["classification"] = "LEAF_CHAIN_VERIFY_FAILED"
                        else:
                            result["customBundle"] = build_custom_bundle(intermediate_pem, custom_bundle)
                            result["tlsProbe"] = tls_probe(custom_bundle)

                            if not result["tlsProbe"].get("ok"):
                                result["classification"] = "CUSTOM_BUNDLE_TLS_FAILED"
                            else:
                                try:
                                    probe = asyncio.run(ws_probe(api_key, custom_bundle))
                                    messages = probe.pop("messages", [])
                                    result["websocketProbe"] = sanitize(probe)
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

                                    all_text = " ".join(
                                        result["analysis"]["sampleRawUnparsed"]
                                        + [json.dumps(x, ensure_ascii=False) for x in result["analysis"]["sampleParsed"]]
                                    ).lower()

                                    entitlement_error = any(
                                        token in all_text
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

                                    total_messages = (
                                        result["analysis"]["parsedMessageCount"]
                                        + result["analysis"]["rawUnparsedCount"]
                                    )

                                    if has_market_event:
                                        classification = "INCLUDED_AND_STREAMING"
                                    elif entitlement_error:
                                        classification = "NOT_ENTITLED_OR_AUTH_REJECTED"
                                    elif total_messages > 0:
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
    result["classification"] = result["classification"] or "S10_5E_EXCEPTION"
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
Write-Host "=== 1. COPY TEMP S10.5E FIXED HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN AIA CHAIN RECOVERY + FMP ENTITLEMENT PROBE ===" -ForegroundColor Green

$remoteCommand = "S10_5E_PROBE_SECONDS='$ProbeSeconds' /opt/skilledge/stock-engine/.venv/bin/python '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote S10.5E probe failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote S10.5E probe returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5E FIXED AIA CHAIN RECOVERY + FMP WEBSOCKET ENTITLEMENT PROBE")
$lines.Add("Generated=$stamp")
$lines.Add("HOST=$($result.host)")
$lines.Add("ENDPOINT=$($result.endpoint)")
$lines.Add("SYMBOLS=$(@($result.symbols) -join ',')")
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

if ($null -ne $result.aiaSelectedUrl) {
    $lines.Add("")
    $lines.Add("=== AIA ===")
    $lines.Add("AIA_CA_ISSUERS_URL=$($result.aiaSelectedUrl)")
}

if ($null -ne $result.leafVerify) {
    $lines.Add("")
    $lines.Add("=== CHAIN VERIFY ===")
    $lines.Add("VERIFY_RETURN_CODE=$($result.leafVerify.returncode)")
    $verifyText = [string]$result.leafVerify.stdout
    $verifyText = $verifyText.Replace([char]13, " ").Replace([char]10, " | ")
    $lines.Add("VERIFY_STDOUT=$verifyText")
}

if ($null -ne $result.tlsProbe) {
    $lines.Add("")
    $lines.Add("=== TLS ===")
    $lines.Add("TLS_OK=$($result.tlsProbe.ok)")
    if ($null -ne $result.tlsProbe.error) {
        $lines.Add("TLS_ERROR=$($result.tlsProbe.error)")
    }
}

if ($null -ne $result.websocketProbe) {
    $lines.Add("")
    $lines.Add("=== WEBSOCKET ===")
    $lines.Add("CONNECTED=$($result.websocketProbe.connected)")
    $lines.Add("ELAPSED_SECONDS=$($result.websocketProbe.elapsedSeconds)")
}

if ($null -ne $result.analysis) {
    $lines.Add("")
    $lines.Add("=== OBSERVED PROTOCOL ===")
    $lines.Add("PARSED_MESSAGES=$($result.analysis.parsedMessageCount)")
    $lines.Add("RAW_UNPARSED_MESSAGES=$($result.analysis.rawUnparsedCount)")
}

if ($null -ne $result.capabilitiesObserved) {
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
$lines.Add("PACKAGE_CHANGED=$($result.safety.packageChanged)")
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
Write-Host "=== S10.5E FIXED COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO INSTALL / NO GLOBAL CA CHANGE / NO SSL BYPASS / NO DEPLOY / NO RESTART." -ForegroundColor Yellow
