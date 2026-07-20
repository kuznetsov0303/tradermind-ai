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
$BackendRoot = Join-Path $ProjectRoot "services\stock-engine"
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_5A_realtime_readiness_audit_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5A_realtime_readiness_audit_raw_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5a_realtime_audit_$stamp.py"
$remotePy = "/tmp/s10_5a_realtime_audit_$stamp.py"

Write-Host ""
Write-Host "=== S10.5A REAL-TIME READINESS AUDIT ===" -ForegroundColor Green
Write-Host "READ-ONLY" -ForegroundColor Yellow
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE CHANGE / NO PAPER POST" -ForegroundColor Yellow

$pythonCode = @'
import ast
import json
import os
import re
import socket
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path("/opt/skilledge/stock-engine")
APP = ROOT / "app/api/app.py"
OPS = ROOT / "ops/scripts"
SYSTEMD = Path("/etc/systemd/system")

EXCLUDED_DIRS = {
    ".venv", "venv", "__pycache__", ".git",
    "data", "reports", "historical_learning", "rollback_snapshots"
}

TEXT_SUFFIXES = {
    ".py", ".sh", ".service", ".timer", ".json", ".md", ".txt", ".conf"
}

def safe_text(path: Path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""

def collect_text_files():
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        bp = Path(base)
        for name in files:
            p = bp / name
            if p.suffix.lower() in TEXT_SUFFIXES or "." not in p.name:
                out.append(p)

    for p in SYSTEMD.glob("skilledge-*"):
        if p.is_file():
            out.append(p)

    return sorted(set(out), key=lambda p: str(p))

files = collect_text_files()

patterns = {
    "websocket": re.compile(r"\bwebsocket\b|\bwebsockets\b|WebSocket", re.I),
    "polling": re.compile(r"poll|sleep\(|OnUnitActiveSec|OnActiveSec|timer", re.I),
    "fmp": re.compile(r"financialmodelingprep|FMP_|/api/v3/quote|stable/|aftermarket", re.I),
    "quote": re.compile(r"\bquote\b|_s103_quote|latest price", re.I),
    "redis": re.compile(r"upstash|redis", re.I),
    "supabase": re.compile(r"supabase", re.I),
    "paper": re.compile(r"/engine/paper|paper_", re.I),
}

hits = {k: [] for k in patterns}

for p in files:
    txt = safe_text(p)
    for name, pat in patterns.items():
        if pat.search(txt):
            lines = txt.splitlines()
            snippets = []
            for i, line in enumerate(lines, 1):
                if pat.search(line):
                    snippets.append({"line": i, "text": line[:500]})
                    if len(snippets) >= 20:
                        break
            hits[name].append({
                "path": str(p),
                "snippets": snippets,
            })

# App routes
routes = []
if APP.exists():
    txt = safe_text(APP)
    route_re = re.compile(
        r'@app\.(get|post|put|delete|patch)\(\s*["\']([^"\']+)["\']',
        re.I
    )
    for m in route_re.finditer(txt):
        routes.append({
            "method": m.group(1).upper(),
            "path": m.group(2),
        })

# Functions relevant to paper / quote / lifecycle
functions = []
if APP.exists():
    try:
        tree = ast.parse(safe_text(APP))
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = node.name
                lname = name.lower()
                if any(tok in lname for tok in (
                    "paper", "quote", "update_open", "session_close",
                    "signal", "trade", "outcome", "evaluate"
                )):
                    functions.append({
                        "name": name,
                        "line": getattr(node, "lineno", None),
                    })
    except Exception as exc:
        functions.append({"parseError": str(exc)})

# systemd unit runtime snippets
units = []
for p in sorted(SYSTEMD.glob("skilledge-*")):
    if not p.is_file():
        continue
    txt = safe_text(p)
    if any(tok in p.name for tok in (
        "paper", "watchdog", "forward-shadow", "nightly", "research",
        "historical", "post-close", "api"
    )):
        execstart = []
        timers = []
        for line in txt.splitlines():
            stripped = line.strip()
            if stripped.startswith("ExecStart="):
                execstart.append(stripped)
            if stripped.startswith(("OnCalendar=", "OnUnitActiveSec=", "OnActiveSec=")):
                timers.append(stripped)
        units.append({
            "name": p.name,
            "execStart": execstart,
            "timerRules": timers,
        })

# systemctl states read-only
unit_states = []
try:
    proc = subprocess.run(
        ["systemctl", "list-unit-files", "skilledge-*", "--no-legend", "--no-pager"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    for line in proc.stdout.splitlines():
        parts = line.split()
        if parts:
            unit_states.append({
                "unit": parts[0],
                "state": parts[1] if len(parts) > 1 else None,
                "preset": parts[2] if len(parts) > 2 else None,
            })
except Exception as exc:
    unit_states.append({"error": str(exc)})

# Listening ports
listening = []
try:
    proc = subprocess.run(
        ["ss", "-ltnp"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("LISTEN"):
            listening.append(line[:1000])
except Exception as exc:
    listening.append("ERROR: " + str(exc))

# VPS resources
resources = {}
for cmd_name, cmd in {
    "memory": ["free", "-b"],
    "disk": ["df", "-B1", "/opt/skilledge/stock-engine"],
    "cpu": ["nproc"],
    "uptime": ["uptime"],
}.items():
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        resources[cmd_name] = proc.stdout.strip()
    except Exception as exc:
        resources[cmd_name] = "ERROR: " + str(exc)

# Process topology
processes = []
try:
    proc = subprocess.run(
        ["ps", "-eo", "pid,ppid,cmd", "--sort=pid"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    for line in proc.stdout.splitlines():
        if "skilledge" in line.lower() or "/opt/skilledge/stock-engine" in line:
            processes.append(line[:1500])
except Exception as exc:
    processes.append("ERROR: " + str(exc))

# Read-only health/status probes
probes = {}
for name, url in {
    "health": "http://127.0.0.1:8000/health",
    "engine_status": "http://127.0.0.1:8000/engine/status",
    "paper_status": "http://127.0.0.1:8000/engine/paper/status",
    "paper_trades": "http://127.0.0.1:8000/engine/paper/trades",
}.items():
    try:
        req = urllib.request.Request(
            url,
            method="GET",
            headers={"User-Agent": "S10.5A-read-only-audit"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body[:5000]
            probes[name] = {
                "ok": resp.status == 200,
                "status": resp.status,
                "body": parsed,
            }
    except Exception as exc:
        probes[name] = {
            "ok": False,
            "status": None,
            "error": str(exc),
        }

# Classification hints
classifications = []

def add_class(component, status, reason):
    classifications.append({
        "component": component,
        "classification": status,
        "reason": reason,
    })

add_class(
    "Current paper point-quote evaluator",
    "LEGACY_FALLBACK",
    "Point-in-time polling can miss intrabar stop/target order and is unsuitable as primary execution truth."
)

add_class(
    "Current app.py paper lifecycle logic",
    "EXTEND",
    "Existing state machine and ledger logic can be reused, but trigger input must become event-driven."
)

add_class(
    "FMP provider integration",
    "EXTEND",
    "Existing authenticated provider integration should be wrapped behind a streaming provider adapter."
)

add_class(
    "SQLite/Supabase durable records",
    "REUSE",
    "Suitable for durable lifecycle, trade, signal and outcome persistence; not raw high-frequency tick storage."
)

add_class(
    "Upstash runtime cache",
    "REUSE",
    "Suitable for shared latest-state/cache coordination; should not be sole durable source for critical lifecycle events."
)

add_class(
    "Market stream ingestor",
    "NEW_COMPONENT_REQUIRED",
    "No primary event-driven market stream service is established by current paper polling architecture."
)

add_class(
    "Real-time trade state engine",
    "NEW_COMPONENT_REQUIRED",
    "Needs deterministic event ordering, stop/target permanence, stale guards, gap detection and recovery."
)

add_class(
    "Client real-time fanout gateway",
    "AUDIT_FRONTEND_REQUIRED",
    "Backend audit alone cannot prove current browser polling/fanout architecture."
)

result = {
    "ok": True,
    "readOnly": True,
    "filesScanned": len(files),
    "patternHits": hits,
    "routes": routes,
    "relevantFunctions": functions,
    "systemdUnits": units,
    "unitStates": unit_states,
    "listeningPorts": listening,
    "resources": resources,
    "processes": processes,
    "probes": probes,
    "classifications": classifications,
    "summary": {
        "routesCount": len(routes),
        "relevantFunctionsCount": len(functions),
        "websocketFiles": len(hits["websocket"]),
        "pollingFiles": len(hits["polling"]),
        "fmpFiles": len(hits["fmp"]),
        "quoteFiles": len(hits["quote"]),
        "redisFiles": len(hits["redis"]),
        "supabaseFiles": len(hits["supabase"]),
        "paperFiles": len(hits["paper"]),
        "systemdUnitsInspected": len(units),
        "processesMatched": len(processes),
        "listeningSockets": len(listening),
    },
    "safety": {
        "deletePerformed": False,
        "movePerformed": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
        "paperPostPerformed": False,
    },
}

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
Write-Host "=== 1. COPY TEMP READ-ONLY AUDIT HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN READ-ONLY PRODUCTION AUDIT ===" -ForegroundColor Green

$remoteCommand = "python3 '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote audit failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote audit returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (-not [bool]$result.ok) {
    throw "Audit did not report ok=true"
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5A REAL-TIME READINESS AUDIT")
$lines.Add("Generated=$stamp")
$lines.Add("READ_ONLY=true")
$lines.Add("NO_DELETE=true")
$lines.Add("NO_MOVE=true")
$lines.Add("NO_DEPLOY=true")
$lines.Add("NO_RESTART=true")
$lines.Add("NO_SERVICE_STATE_CHANGE=true")
$lines.Add("NO_PAPER_POST=true")
$lines.Add("")
$lines.Add("=== SUMMARY ===")
$lines.Add("FILES_SCANNED=$($result.filesScanned)")
$lines.Add("ROUTES=$($result.summary.routesCount)")
$lines.Add("RELEVANT_FUNCTIONS=$($result.summary.relevantFunctionsCount)")
$lines.Add("WEBSOCKET_FILES=$($result.summary.websocketFiles)")
$lines.Add("POLLING_FILES=$($result.summary.pollingFiles)")
$lines.Add("FMP_FILES=$($result.summary.fmpFiles)")
$lines.Add("QUOTE_FILES=$($result.summary.quoteFiles)")
$lines.Add("REDIS_FILES=$($result.summary.redisFiles)")
$lines.Add("SUPABASE_FILES=$($result.summary.supabaseFiles)")
$lines.Add("PAPER_FILES=$($result.summary.paperFiles)")
$lines.Add("SYSTEMD_UNITS_INSPECTED=$($result.summary.systemdUnitsInspected)")
$lines.Add("MATCHED_PROCESSES=$($result.summary.processesMatched)")
$lines.Add("LISTENING_SOCKETS=$($result.summary.listeningSockets)")
$lines.Add("")
$lines.Add("=== READ-ONLY PROBES ===")

foreach ($prop in $result.probes.PSObject.Properties) {
    $probe = $prop.Value
    $lines.Add("$($prop.Name): ok=$($probe.ok) status=$($probe.status)")
}

$lines.Add("")
$lines.Add("=== COMPONENT CLASSIFICATION ===")

foreach ($item in @($result.classifications)) {
    $lines.Add("$($item.classification) | $($item.component) | $($item.reason)")
}

$lines.Add("")
$lines.Add("=== OUTPUTS ===")
$lines.Add("Raw=$RawPath")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5A COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE CHANGE / NO PAPER POST." -ForegroundColor Yellow
