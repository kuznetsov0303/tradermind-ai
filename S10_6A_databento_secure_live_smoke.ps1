param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$StateDir = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesDir = Join-Path $StateDir "milestones"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
New-Item -ItemType Directory -Force -Path $MilestonesDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RawPath = Join-Path $AuditDir "S10_6A_databento_live_smoke_raw_$stamp.json"
$ReportPath = Join-Path $AuditDir "S10_6A_databento_live_smoke_report_$stamp.txt"
$localPy = Join-Path $env:TEMP "s10_6a_databento_live_smoke_$stamp.py"
$remotePy = "/tmp/s10_6a_databento_live_smoke_$stamp.py"

Write-Host ""
Write-Host "=== S10.6A DATABENTO SECURE INSTALL + LIVE SMOKE ===" -ForegroundColor Green
Write-Host "The API key will not be printed or written to command history." -ForegroundColor Yellow

$secure = Read-Host "Paste Databento API key" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($plainKey) -or -not $plainKey.StartsWith("db-")) {
    throw "The entered value does not look like a Databento API key."
}

$pythonCode = @'
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

ENGINE_ROOT = Path("/opt/skilledge/stock-engine")
ENV_PATH = ENGINE_ROOT / ".env.server"
SDK_VERSION = "0.81.0"

result = {
    "ok": False,
    "classification": None,
    "apiKeyPresent": False,
    "apiKeyFingerprintPrefix": None,
    "apiKeyOutput": "NEVER_EMITTED",
    "sdkVersionRequested": SDK_VERSION,
    "sdkVersionObserved": None,
    "definitionProbe": {
        "recordCount": 0,
        "uniqueRawSymbolCount": 0,
        "sampleSymbols": [],
        "recordTypes": {},
        "errors": [],
    },
    "mbp1Probe": {
        "recordCount": 0,
        "instrumentIdsObserved": {},
        "recordTypes": {},
        "samples": [],
        "errors": [],
    },
    "envPersisted": False,
    "envBackup": None,
    "serviceRestarted": False,
    "productionCodeChanged": False,
    "temporaryFilesRemoved": False,
    "error": None,
}

api_key = sys.stdin.readline().strip()
result["apiKeyPresent"] = bool(api_key)

if api_key:
    result["apiKeyFingerprintPrefix"] = hashlib.sha256(
        api_key.encode("utf-8")
    ).hexdigest()[:12]

tmpdir = tempfile.mkdtemp(prefix="skilledge_s106a_")
sdk_dir = Path(tmpdir) / "sdk"

def run(cmd, timeout=180):
    p = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return {
        "returncode": p.returncode,
        "stdout": p.stdout[-8000:],
        "stderr": p.stderr[-8000:],
    }

def persist_env_key():
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing = ""
    if ENV_PATH.exists():
        existing = ENV_PATH.read_text(encoding="utf-8", errors="replace")

    backup = None
    if ENV_PATH.exists():
        backup = ENV_PATH.with_name(
            ENV_PATH.name + ".bak_s106a_" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        )
        shutil.copy2(ENV_PATH, backup)
        os.chmod(backup, 0o600)

    lines = existing.splitlines()
    new_lines = []
    replaced = False

    for line in lines:
        if line.startswith("DATABENTO_API_KEY="):
            new_lines.append("DATABENTO_API_KEY=" + api_key)
            replaced = True
        else:
            new_lines.append(line)

    if not replaced:
        if new_lines and new_lines[-1] != "":
            new_lines.append("")
        new_lines.append("DATABENTO_API_KEY=" + api_key)

    temp_path = ENV_PATH.with_name(ENV_PATH.name + ".tmp_s106a")
    temp_path.write_text("\n".join(new_lines).rstrip() + "\n", encoding="utf-8")
    os.chmod(temp_path, 0o600)
    os.replace(temp_path, ENV_PATH)
    os.chmod(ENV_PATH, 0o600)

    return str(backup) if backup else None

try:
    if not api_key.startswith("db-"):
        result["classification"] = "INVALID_KEY_FORMAT"
        raise RuntimeError("Databento key format validation failed.")

    install = run([
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--target",
        str(sdk_dir),
        f"databento=={SDK_VERSION}",
    ])

    if install["returncode"] != 0:
        result["classification"] = "TEMP_SDK_INSTALL_FAILED"
        raise RuntimeError(
            "Temporary Databento SDK installation failed: "
            + install["stderr"][-1000:]
        )

    sys.path.insert(0, str(sdk_dir))
    import databento as db

    result["sdkVersionObserved"] = getattr(db, "__version__", "unknown")

    definition_symbols = set()
    definition_types = Counter()
    definition_errors = []

    def on_definition(msg):
        definition_types[type(msg).__name__] += 1
        raw_symbol = getattr(msg, "raw_symbol", None)
        if raw_symbol:
            definition_symbols.add(str(raw_symbol))

    def on_definition_error(exc):
        definition_errors.append(repr(exc))

    definitions_client = db.Live(key=api_key)
    definitions_client.subscribe(
        dataset="EQUS.MINI",
        schema="definition",
        symbols="ALL_SYMBOLS",
        start=0,
    )
    definitions_client.add_callback(
        on_definition,
        exception_callback=on_definition_error,
    )
    definitions_client.start()
    definitions_client.block_for_close(timeout=12)

    result["definitionProbe"] = {
        "dataset": "EQUS.MINI",
        "schema": "definition",
        "symbols": "ALL_SYMBOLS",
        "recordCount": int(sum(definition_types.values())),
        "uniqueRawSymbolCount": len(definition_symbols),
        "sampleSymbols": sorted(definition_symbols)[:20],
        "recordTypes": dict(definition_types),
        "errors": definition_errors[:10],
    }

    mbp_types = Counter()
    mbp_instruments = Counter()
    mbp_samples = []
    mbp_errors = []

    def safe_value(value):
        if value is None:
            return None
        try:
            return int(value)
        except Exception:
            return str(value)[:100]

    def on_mbp(msg):
        name = type(msg).__name__
        mbp_types[name] += 1

        instrument_id = getattr(msg, "instrument_id", None)
        if instrument_id is not None:
            mbp_instruments[str(instrument_id)] += 1

        if len(mbp_samples) < 12:
            sample = {
                "type": name,
                "instrument_id": safe_value(instrument_id),
                "ts_event": safe_value(getattr(msg, "ts_event", None)),
                "ts_recv": safe_value(getattr(msg, "ts_recv", None)),
                "action": str(getattr(msg, "action", ""))[:20],
                "price": safe_value(getattr(msg, "price", None)),
                "size": safe_value(getattr(msg, "size", None)),
            }

            levels = getattr(msg, "levels", None)
            if levels:
                try:
                    level0 = levels[0]
                    sample["bid_px_00"] = safe_value(getattr(level0, "bid_px", None))
                    sample["ask_px_00"] = safe_value(getattr(level0, "ask_px", None))
                    sample["bid_sz_00"] = safe_value(getattr(level0, "bid_sz", None))
                    sample["ask_sz_00"] = safe_value(getattr(level0, "ask_sz", None))
                except Exception:
                    pass

            mbp_samples.append(sample)

    def on_mbp_error(exc):
        mbp_errors.append(repr(exc))

    mbp_client = db.Live(key=api_key)
    mbp_client.subscribe(
        dataset="EQUS.MINI",
        schema="mbp-1",
        symbols=["AAPL", "MSFT"],
    )
    mbp_client.add_callback(
        on_mbp,
        exception_callback=on_mbp_error,
    )
    mbp_client.start()
    mbp_client.block_for_close(timeout=25)

    mbp_count = int(sum(mbp_types.values()))

    result["mbp1Probe"] = {
        "dataset": "EQUS.MINI",
        "schema": "mbp-1",
        "symbols": ["AAPL", "MSFT"],
        "recordCount": mbp_count,
        "instrumentIdsObserved": dict(mbp_instruments),
        "recordTypes": dict(mbp_types),
        "samples": mbp_samples,
        "errors": mbp_errors[:10],
    }

    combined_errors = definition_errors + mbp_errors
    combined_error_text = " ".join(combined_errors).lower()

    auth_error = any(
        token in combined_error_text
        for token in (
            "auth",
            "unauthorized",
            "permission",
            "license",
            "entitlement",
            "invalid key",
        )
    )

    definitions_ok = len(definition_symbols) > 0
    mbp_ok = mbp_count > 0

    if auth_error:
        result["classification"] = "AUTH_OR_ENTITLEMENT_FAILED"
    elif definitions_ok and mbp_ok:
        result["classification"] = "EQUS_MINI_MBP1_LIVE_CONFIRMED"
        result["ok"] = True
    elif definitions_ok:
        result["classification"] = "ENTITLEMENT_CONFIRMED_NO_LIVE_TICKS_IN_WINDOW"
        result["ok"] = True
    else:
        result["classification"] = "LIVE_PROBE_INCONCLUSIVE"

    if result["ok"]:
        result["envBackup"] = persist_env_key()
        result["envPersisted"] = True

except Exception as exc:
    result["error"] = repr(exc)
    if result["classification"] is None:
        result["classification"] = "S10_6A_EXCEPTION"

finally:
    try:
        shutil.rmtree(tmpdir)
        result["temporaryFilesRemoved"] = True
    except Exception as exc:
        result["temporaryFilesRemoved"] = False
        result["temporaryCleanupError"] = repr(exc)

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
Write-Host "=== 1. COPY TEMPORARY SMOKE HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN SECURE DATABENTO LIVE SMOKE ===" -ForegroundColor Green

$resultLines = $plainKey | & ssh @sshArgs $VpsHost "/opt/skilledge/stock-engine/.venv/bin/python '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"

$plainKey = $null
$secure = $null

if ($LASTEXITCODE -ne 0) {
    throw "Remote Databento smoke failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Databento smoke returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6A DATABENTO LIVE ENTITLEMENT SMOKE",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "API_KEY_PRESENT=$($result.apiKeyPresent)",
    "API_KEY_FINGERPRINT_PREFIX=$($result.apiKeyFingerprintPrefix)",
    "API_KEY_OUTPUT=$($result.apiKeyOutput)",
    "SDK_VERSION_REQUESTED=$($result.sdkVersionRequested)",
    "SDK_VERSION_OBSERVED=$($result.sdkVersionObserved)",
    "DEFINITION_RECORDS=$($result.definitionProbe.recordCount)",
    "DEFINITION_UNIQUE_SYMBOLS=$($result.definitionProbe.uniqueRawSymbolCount)",
    "MBP1_RECORDS=$($result.mbp1Probe.recordCount)",
    "ENV_PERSISTED=$($result.envPersisted)",
    "ENV_BACKUP=$($result.envBackup)",
    "SERVICE_RESTARTED=$($result.serviceRestarted)",
    "PRODUCTION_CODE_CHANGED=$($result.productionCodeChanged)",
    "TEMPORARY_FILES_REMOVED=$($result.temporaryFilesRemoved)",
    "ERROR=$($result.error)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesDir "S10_6A_DATABENTO_LIVE_SMOKE_$stamp.md"

$milestone = @"
# S10.6A Databento Live Entitlement Smoke

Generated: $stamp

- Classification: $($result.classification)
- OK: $($result.ok)
- Dataset: EQUS.MINI
- Definition schema / ALL_SYMBOLS records: $($result.definitionProbe.recordCount)
- Unique symbols observed: $($result.definitionProbe.uniqueRawSymbolCount)
- MBP-1 records for AAPL/MSFT: $($result.mbp1Probe.recordCount)
- API key persisted securely: $($result.envPersisted)
- Service restart performed: $($result.serviceRestarted)
- Production code changed: $($result.productionCodeChanged)
- API key output: $($result.apiKeyOutput)

Next milestone:
Day 2 - Canonical MarketEvent contract and provider abstraction.
"@

$milestone | Set-Content -LiteralPath $milestonePath -Encoding UTF8

$nextStepPath = Join-Path $StateDir "NEXT_STEP.md"

@"
# NEXT STEP

Updated: $stamp

Current milestone result:
$($result.classification)

If OK:
Proceed to Day 2 - Canonical MarketEvent contract and provider abstraction.

Do not:
- reset paper;
- manually call paper run-once;
- restart unrelated services;
- weaken client/Telegram gates;
- expose the Databento API key;
- buy FMP Ultimate, Pusher or Sentry Team.
"@ | Set-Content -LiteralPath $nextStepPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6A COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Definitions: $($result.definitionProbe.recordCount)"
Write-Host "Unique symbols: $($result.definitionProbe.uniqueRawSymbolCount)"
Write-Host "MBP-1 records: $($result.mbp1Probe.recordCount)"
Write-Host "Key persisted: $($result.envPersisted)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host "Milestone: $milestonePath"
Write-Host ""
Write-Host "NO SERVICE RESTART / NO PAPER POST / NO CLIENT GATE CHANGE." -ForegroundColor Yellow
