param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_5F_fmp_auth_differential_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5F_fmp_auth_differential_raw_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5f_fmp_auth_diff_$stamp.py"
$remotePy = "/tmp/s10_5f_fmp_auth_diff_$stamp.py"

Write-Host ""
Write-Host "=== S10.5F FMP AUTH DIFFERENTIAL PROBE ===" -ForegroundColor Green
Write-Host "READ-ONLY / SAME EXISTING API KEY / NO KEY OUTPUT" -ForegroundColor Yellow
Write-Host "NO INSTALL / NO SUBSCRIPTION CHANGE / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

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
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "websockets.financialmodelingprep.com"
ENDPOINT = f"wss://{HOST}"
SYSTEM_CA = "/etc/ssl/certs/ca-certificates.crt"

def run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {
            "returncode": p.returncode,
            "stdout": p.stdout[-12000:],
            "stderr": p.stderr[-12000:],
        }
    except Exception as exc:
        return {"error": repr(exc)}

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

def http_probe(url):
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "SkillEdge-S10.5F-auth-differential"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read(5000).decode("utf-8", errors="replace")
            parsed = None
            try:
                parsed = json.loads(body)
            except Exception:
                pass

            body_kind = "unknown"
            item_count = None

            if isinstance(parsed, list):
                body_kind = "list"
                item_count = len(parsed)
            elif isinstance(parsed, dict):
                body_kind = "dict"

            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "bodyKind": body_kind,
                "itemCount": item_count,
                "contentType": resp.headers.get("Content-Type"),
                "bodyPreview": body[:500],
            }
    except urllib.error.HTTPError as exc:
        body = exc.read(1000).decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": exc.code,
            "error": body[:500],
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": None,
            "error": repr(exc),
        }

def fetch_leaf_and_intermediate(tmpdir):
    leaf_pem = os.path.join(tmpdir, "leaf.pem")
    inter_raw = os.path.join(tmpdir, "intermediate.raw")
    inter_pem = os.path.join(tmpdir, "intermediate.pem")
    bundle = os.path.join(tmpdir, "bundle.pem")

    res = run([
        "bash", "-lc",
        "printf '' | openssl s_client "
        f"-connect {HOST}:443 -servername {HOST} -showcerts 2>/dev/null"
    ])
    text = res.get("stdout") or ""

    m = re.search(
        r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
        text,
        flags=re.S,
    )
    if not m:
        raise RuntimeError("Could not extract FMP leaf certificate")

    Path(leaf_pem).write_text(m.group(0) + "\n", encoding="ascii")

    inspect = run([
        "openssl", "x509", "-in", leaf_pem, "-noout", "-text"
    ])
    inspect_text = (inspect.get("stdout") or "") + (inspect.get("stderr") or "")
    urls = re.findall(r"CA Issuers - URI:([^\s]+)", inspect_text)

    if not urls:
        raise RuntimeError("No AIA CA Issuers URL in FMP leaf")

    aia_url = urls[0]

    req = urllib.request.Request(
        aia_url,
        headers={"User-Agent": "SkillEdge-S10.5F-AIA"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()

    Path(inter_raw).write_bytes(data)

    der = run([
        "openssl", "x509", "-inform", "DER",
        "-in", inter_raw, "-out", inter_pem
    ])
    if der.get("returncode") != 0:
        pem = run([
            "openssl", "x509", "-inform", "PEM",
            "-in", inter_raw, "-out", inter_pem
        ])
        if pem.get("returncode") != 0:
            raise RuntimeError("Could not convert intermediate certificate")

    verify = run([
        "openssl", "verify",
        "-CAfile", SYSTEM_CA,
        "-untrusted", inter_pem,
        leaf_pem,
    ])

    verify_ok = (
        verify.get("returncode") == 0
        and ": OK" in (verify.get("stdout") or "")
    )

    if not verify_ok:
        raise RuntimeError("Leaf chain verification failed")

    system_bytes = Path(SYSTEM_CA).read_bytes()
    inter_bytes = Path(inter_pem).read_bytes()

    with open(bundle, "wb") as f:
        f.write(system_bytes)
        if not system_bytes.endswith(b"\n"):
            f.write(b"\n")
        f.write(inter_bytes)
        if not inter_bytes.endswith(b"\n"):
            f.write(b"\n")

    return {
        "bundle": bundle,
        "aiaUrl": aia_url,
        "intermediateSha256": hashlib.sha256(data).hexdigest(),
        "verifyOk": True,
    }

async def websocket_login_probe(api_key, cafile):
    import websockets

    ssl_ctx = ssl.create_default_context(cafile=cafile)
    result = {
        "connected": False,
        "loginSent": False,
        "firstMessage": None,
        "error": None,
    }

    try:
        async with websockets.connect(
            ENDPOINT,
            ssl=ssl_ctx,
            open_timeout=15,
            close_timeout=5,
            ping_interval=20,
            ping_timeout=20,
            max_size=2 * 1024 * 1024,
        ) as ws:
            result["connected"] = True

            await ws.send(json.dumps({
                "event": "login",
                "data": {"apiKey": api_key},
            }))
            result["loginSent"] = True

            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=10)
                try:
                    msg = json.loads(raw)
                except Exception:
                    msg = {"raw": str(raw)[:500]}

                if isinstance(msg, dict):
                    for key in list(msg.keys()):
                        if str(key).lower() in {"apikey", "api_key", "token"}:
                            msg[key] = "***REDACTED***"

                result["firstMessage"] = msg
            except asyncio.TimeoutError:
                result["firstMessage"] = {"timeout": True}

    except Exception as exc:
        result["error"] = repr(exc)

    return result

api_key, key_source = find_api_key()

result = {
    "ok": False,
    "apiKeyPresent": bool(api_key),
    "apiKeySource": key_source,
    "apiKeyFingerprintSha256Prefix": None,
    "apiKeyOutput": "NEVER_EMITTED",
    "restStable": None,
    "restLegacy": None,
    "chain": None,
    "websocket": None,
    "classification": None,
    "recommendation": None,
    "safety": {
        "installPerformed": False,
        "subscriptionChanged": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
        "paperPostPerformed": False,
        "apiKeyEmitted": False,
        "temporaryFilesRemoved": False,
    },
}

tmpdir = tempfile.mkdtemp(prefix="skilledge_s105f_")

try:
    if not api_key:
        result["classification"] = "NO_API_KEY_FOUND"
        result["recommendation"] = "Fix existing FMP key configuration before any plan change."
    else:
        result["apiKeyFingerprintSha256Prefix"] = hashlib.sha256(
            api_key.encode("utf-8")
        ).hexdigest()[:12]

        encoded_key = urllib.parse.quote(api_key, safe="")

        stable_url = (
            "https://financialmodelingprep.com/stable/profile"
            f"?symbol=AAPL&apikey={encoded_key}"
        )
        legacy_url = (
            "https://financialmodelingprep.com/api/v3/quote/AAPL"
            f"?apikey={encoded_key}"
        )

        result["restStable"] = http_probe(stable_url)
        result["restLegacy"] = http_probe(legacy_url)

        result["chain"] = fetch_leaf_and_intermediate(tmpdir)

        result["websocket"] = asyncio.run(
            websocket_login_probe(api_key, result["chain"]["bundle"])
        )

        rest_ok = bool(
            result["restStable"].get("ok")
            or result["restLegacy"].get("ok")
        )

        ws_msg = result["websocket"].get("firstMessage")
        ws_status = ws_msg.get("status") if isinstance(ws_msg, dict) else None
        ws_event = ws_msg.get("event") if isinstance(ws_msg, dict) else None
        ws_message = str(ws_msg.get("message") or "").lower() if isinstance(ws_msg, dict) else ""

        ws_unauthorized = (
            ws_status == 401
            or "unauthorized" in ws_message
        )

        ws_auth_ok = (
            result["websocket"].get("connected")
            and not ws_unauthorized
            and ws_msg is not None
        )

        if rest_ok and ws_unauthorized:
            result["classification"] = "REST_VALID_WEBSOCKET_401"
            result["recommendation"] = (
                "Do not rotate the working REST key and do not upgrade blindly. "
                "Account-side WebSocket entitlement or WebSocket auth provisioning must be confirmed with FMP."
            )
        elif not rest_ok and ws_unauthorized:
            result["classification"] = "REST_AND_WEBSOCKET_AUTH_REJECTED"
            result["recommendation"] = (
                "Existing API key/configuration must be corrected before any subscription decision."
            )
        elif rest_ok and ws_auth_ok:
            result["classification"] = "REST_AND_WEBSOCKET_AUTH_OK"
            result["recommendation"] = (
                "Proceed with stream protocol/capacity validation. No plan change indicated."
            )
        elif rest_ok:
            result["classification"] = "REST_VALID_WEBSOCKET_INCONCLUSIVE"
            result["recommendation"] = (
                "Repeat a narrow WebSocket auth/protocol check before any subscription change."
            )
        else:
            result["classification"] = "AUTH_DIFFERENTIAL_INCONCLUSIVE"
            result["recommendation"] = (
                "Investigate provider responses before changing subscription."
            )

        result["ok"] = True

except Exception as exc:
    result["classification"] = result["classification"] or "S10_5F_EXCEPTION"
    result["recommendation"] = "No subscription change. Diagnose the exception first."
    result["error"] = repr(exc)

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
Write-Host "=== 1. COPY TEMP S10.5F HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN SAME-KEY REST VS WEBSOCKET AUTH DIFFERENTIAL ===" -ForegroundColor Green

$remoteCommand = "/opt/skilledge/stock-engine/.venv/bin/python '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote S10.5F probe failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote S10.5F probe returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5F FMP AUTH DIFFERENTIAL PROBE")
$lines.Add("Generated=$stamp")
$lines.Add("API_KEY_PRESENT=$($result.apiKeyPresent)")
$lines.Add("API_KEY_SOURCE=$($result.apiKeySource)")
$lines.Add("API_KEY_FINGERPRINT_SHA256_PREFIX=$($result.apiKeyFingerprintSha256Prefix)")
$lines.Add("API_KEY_OUTPUT=$($result.apiKeyOutput)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("OK=$($result.ok)")
$lines.Add("CLASSIFICATION=$($result.classification)")
$lines.Add("RECOMMENDATION=$($result.recommendation)")

if ($null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

$lines.Add("")
$lines.Add("=== REST STABLE ===")
$lines.Add("OK=$($result.restStable.ok)")
$lines.Add("STATUS=$($result.restStable.status)")
$lines.Add("BODY_KIND=$($result.restStable.bodyKind)")
$lines.Add("ITEM_COUNT=$($result.restStable.itemCount)")

$lines.Add("")
$lines.Add("=== REST LEGACY ===")
$lines.Add("OK=$($result.restLegacy.ok)")
$lines.Add("STATUS=$($result.restLegacy.status)")
$lines.Add("BODY_KIND=$($result.restLegacy.bodyKind)")
$lines.Add("ITEM_COUNT=$($result.restLegacy.itemCount)")

$lines.Add("")
$lines.Add("=== WEBSOCKET LOGIN ===")
$lines.Add("CONNECTED=$($result.websocket.connected)")
$lines.Add("LOGIN_SENT=$($result.websocket.loginSent)")

if ($null -ne $result.websocket.firstMessage) {
    $msg = $result.websocket.firstMessage
    if ($null -ne $msg.event) {
        $lines.Add("EVENT=$($msg.event)")
    }
    if ($null -ne $msg.status) {
        $lines.Add("STATUS=$($msg.status)")
    }
    if ($null -ne $msg.message) {
        $lines.Add("MESSAGE=$($msg.message)")
    }
}

$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("INSTALL_PERFORMED=$($result.safety.installPerformed)")
$lines.Add("SUBSCRIPTION_CHANGED=$($result.safety.subscriptionChanged)")
$lines.Add("DEPLOY_PERFORMED=$($result.safety.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.safety.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.safety.serviceStateChanged)")
$lines.Add("PAPER_POST_PERFORMED=$($result.safety.paperPostPerformed)")
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
Write-Host "=== S10.5F COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO INSTALL / NO SUBSCRIPTION CHANGE / NO DEPLOY / NO RESTART." -ForegroundColor Yellow
