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

$ReportPath = Join-Path $AuditDir "S10_5C_tls_ca_diagnostic_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_5C_tls_ca_diagnostic_raw_$stamp.json"

$localPy = Join-Path $env:TEMP "s10_5c_tls_ca_diag_$stamp.py"
$remotePy = "/tmp/s10_5c_tls_ca_diag_$stamp.py"

Write-Host ""
Write-Host "=== S10.5C TLS / CA READ-ONLY DIAGNOSTIC ===" -ForegroundColor Green
Write-Host "NO INSTALL / NO PACKAGE CHANGE / NO CA CHANGE / NO SSL BYPASS" -ForegroundColor Yellow

$pythonCode = @'
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
from pathlib import Path

HOST = "websockets.financialmodelingprep.com"
PORT = 443

def run(cmd, timeout=25):
    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "cmd": cmd,
            "returncode": p.returncode,
            "stdout": p.stdout[-12000:],
            "stderr": p.stderr[-12000:],
        }
    except Exception as exc:
        return {
            "cmd": cmd,
            "error": repr(exc),
        }

def file_info(path):
    p = Path(path)
    return {
        "path": str(p),
        "exists": p.exists(),
        "isFile": p.is_file(),
        "size": p.stat().st_size if p.exists() and p.is_file() else None,
    }

result = {
    "ok": True,
    "host": HOST,
    "port": PORT,
    "system": {},
    "dns": {},
    "caFiles": [],
    "venvPython": {},
    "systemPython": {},
    "openssl": None,
    "curl": None,
    "opensslVersion": None,
    "safety": {
        "installPerformed": False,
        "packageChanged": False,
        "caChanged": False,
        "sslVerificationDisabled": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
    },
}

# Basic system information
result["system"] = {
    "pythonExecutable": sys.executable,
    "pythonVersion": sys.version,
    "opensslRuntime": ssl.OPENSSL_VERSION,
    "opensslBinary": shutil.which("openssl"),
    "curlBinary": shutil.which("curl"),
    "osRelease": run(["bash", "-lc", "cat /etc/os-release"]),
}

# DNS
try:
    infos = socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM)
    addrs = []
    for item in infos:
        addr = item[4][0]
        if addr not in addrs:
            addrs.append(addr)
    result["dns"] = {
        "ok": True,
        "addresses": addrs,
    }
except Exception as exc:
    result["dns"] = {
        "ok": False,
        "error": repr(exc),
    }

# Common CA paths
common_paths = [
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/pki/tls/certs/ca-bundle.crt",
    "/etc/ssl/cert.pem",
]

for p in common_paths:
    result["caFiles"].append(file_info(p))

def python_diag(executable):
    code = r'''
import json, socket, ssl, sys
out = {
    "executable": sys.executable,
    "version": sys.version,
    "openssl": ssl.OPENSSL_VERSION,
    "defaultVerifyPaths": {
        "cafile": ssl.get_default_verify_paths().cafile,
        "capath": ssl.get_default_verify_paths().capath,
        "openssl_cafile_env": ssl.get_default_verify_paths().openssl_cafile_env,
        "openssl_cafile": ssl.get_default_verify_paths().openssl_cafile,
        "openssl_capath_env": ssl.get_default_verify_paths().openssl_capath_env,
        "openssl_capath": ssl.get_default_verify_paths().openssl_capath,
    },
    "certifi": {
        "installed": False,
        "version": None,
        "where": None,
    },
    "tls": {
        "ok": False,
        "peerSubject": None,
        "peerIssuer": None,
        "notBefore": None,
        "notAfter": None,
        "error": None,
    },
}
try:
    import certifi
    out["certifi"]["installed"] = True
    out["certifi"]["version"] = getattr(certifi, "__version__", None)
    out["certifi"]["where"] = certifi.where()
except Exception as exc:
    out["certifi"]["error"] = repr(exc)

try:
    ctx = ssl.create_default_context()
    with socket.create_connection(("websockets.financialmodelingprep.com", 443), timeout=15) as sock:
        with ctx.wrap_socket(sock, server_hostname="websockets.financialmodelingprep.com") as ssock:
            cert = ssock.getpeercert()
            out["tls"]["ok"] = True
            out["tls"]["peerSubject"] = cert.get("subject")
            out["tls"]["peerIssuer"] = cert.get("issuer")
            out["tls"]["notBefore"] = cert.get("notBefore")
            out["tls"]["notAfter"] = cert.get("notAfter")
except Exception as exc:
    out["tls"]["error"] = repr(exc)

print(json.dumps(out))
'''
    return run([executable, "-c", code], timeout=30)

venv_python = "/opt/skilledge/stock-engine/.venv/bin/python"
system_python = shutil.which("python3") or "/usr/bin/python3"

result["venvPython"] = python_diag(venv_python) if Path(venv_python).exists() else {
    "error": "venv python missing",
    "path": venv_python,
}

result["systemPython"] = python_diag(system_python)

# OpenSSL direct chain/verify diagnostic
if shutil.which("openssl"):
    result["opensslVersion"] = run(["openssl", "version", "-a"])
    result["openssl"] = run([
        "bash", "-lc",
        "printf '' | openssl s_client "
        "-connect websockets.financialmodelingprep.com:443 "
        "-servername websockets.financialmodelingprep.com "
        "-showcerts -verify_return_error 2>&1"
    ], timeout=30)

# Curl HTTPS trust diagnostic
if shutil.which("curl"):
    result["curl"] = run([
        "curl",
        "-I",
        "--max-time",
        "20",
        "--silent",
        "--show-error",
        "https://websockets.financialmodelingprep.com",
    ], timeout=30)

# Classification
def parse_nested_json(run_result):
    try:
        if isinstance(run_result, dict) and run_result.get("stdout"):
            return json.loads(run_result["stdout"])
    except Exception:
        return None
    return None

venv = parse_nested_json(result["venvPython"])
systemp = parse_nested_json(result["systemPython"])

classification = "UNRESOLVED"

venv_tls = bool(venv and venv.get("tls", {}).get("ok"))
system_tls = bool(systemp and systemp.get("tls", {}).get("ok"))
openssl_ok = bool(
    isinstance(result.get("openssl"), dict)
    and result["openssl"].get("returncode") == 0
    and "Verify return code: 0 (ok)" in (
        (result["openssl"].get("stdout") or "")
        + (result["openssl"].get("stderr") or "")
    )
)
curl_ok = bool(
    isinstance(result.get("curl"), dict)
    and result["curl"].get("returncode") == 0
)

if venv_tls:
    classification = "VENV_TLS_OK_NOW"
elif system_tls and not venv_tls:
    classification = "VENV_ONLY_CA_TRUST_PROBLEM"
elif openssl_ok and not venv_tls:
    classification = "PYTHON_CA_TRUST_PROBLEM"
elif curl_ok and not venv_tls:
    classification = "PYTHON_CA_TRUST_PROBLEM"
elif not system_tls and not venv_tls:
    classification = "SYSTEM_OR_ENDPOINT_CHAIN_PROBLEM"

result["classification"] = classification
result["observed"] = {
    "venvTlsOk": venv_tls,
    "systemPythonTlsOk": system_tls,
    "opensslVerifyOk": openssl_ok,
    "curlHttpsOk": curl_ok,
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
Write-Host "=== 1. COPY TEMP READ-ONLY DIAGNOSTIC HELPER ===" -ForegroundColor Green

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== 2. RUN TLS / CA DIAGNOSTIC ===" -ForegroundColor Green

$remoteCommand = "python3 '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote diagnostic failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote diagnostic returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5C TLS / CA READ-ONLY DIAGNOSTIC")
$lines.Add("Generated=$stamp")
$lines.Add("HOST=$($result.host)")
$lines.Add("PORT=$($result.port)")
$lines.Add("CLASSIFICATION=$($result.classification)")
$lines.Add("")
$lines.Add("=== OBSERVED ===")
$lines.Add("VENV_TLS_OK=$($result.observed.venvTlsOk)")
$lines.Add("SYSTEM_PYTHON_TLS_OK=$($result.observed.systemPythonTlsOk)")
$lines.Add("OPENSSL_VERIFY_OK=$($result.observed.opensslVerifyOk)")
$lines.Add("CURL_HTTPS_OK=$($result.observed.curlHttpsOk)")
$lines.Add("")
$lines.Add("=== DNS ===")
$lines.Add("DNS_OK=$($result.dns.ok)")
if ($result.dns.ok) {
    $lines.Add("ADDRESSES=$(@($result.dns.addresses) -join ',')")
}
elseif ($null -ne $result.dns.error) {
    $lines.Add("DNS_ERROR=$($result.dns.error)")
}
$lines.Add("")
$lines.Add("=== CA FILES ===")
foreach ($item in @($result.caFiles)) {
    $lines.Add("$($item.path) | exists=$($item.exists) | isFile=$($item.isFile) | size=$($item.size)")
}
$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("INSTALL_PERFORMED=$($result.safety.installPerformed)")
$lines.Add("PACKAGE_CHANGED=$($result.safety.packageChanged)")
$lines.Add("CA_CHANGED=$($result.safety.caChanged)")
$lines.Add("SSL_VERIFICATION_DISABLED=$($result.safety.sslVerificationDisabled)")
$lines.Add("DEPLOY_PERFORMED=$($result.safety.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.safety.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.safety.serviceStateChanged)")
$lines.Add("")
$lines.Add("RAW_JSON=$RawPath")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5C COMPLETE ===" -ForegroundColor Green
Write-Host "Classification: $($result.classification)"
Write-Host "Report: $ReportPath"
Write-Host "Raw JSON: $RawPath"
Write-Host ""
Write-Host "NO INSTALL / NO PACKAGE CHANGE / NO CA CHANGE / NO SSL BYPASS." -ForegroundColor Yellow
