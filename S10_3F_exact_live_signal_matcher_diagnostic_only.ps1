param(
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host ("`n> {0} {1}" -f $FilePath, ($Arguments -join " ")) -ForegroundColor Cyan
    & $FilePath @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$localInstaller = Join-Path $env:TEMP "s10_3f_install_$stamp.py"
$remoteInstaller = "/tmp/s10_3f_install_$stamp.py"

$pythonInstaller = @'
#!/usr/bin/env python3
from __future__ import annotations

import base64
import pathlib
import py_compile
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

APP_PATH = pathlib.Path("/opt/skilledge/stock-engine/app/api/app.py")
START = "def _s103_fetch_live_signal_index():"
END = "def _s103_enrich_selected_ideas(selected):"
NEW_BLOCK = base64.b64decode("CmRlZiBfczEwM19mZXRjaF9saXZlX3NpZ25hbF9pbmRleCgpOgogICAgZXJyb3JzID0gW10KICAgIHBheWxvYWQgPSBOb25lCgogICAgdHJ5OgogICAgICAgIHBheWxvYWQgPSBfczEwM19odHRwX2pzb24oIi9lbmdpbmUvc2lnbmFscz9saW1pdD0xMDAwIiwgdGltZW91dD02MCkKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZXhjOgogICAgICAgIGVycm9ycy5hcHBlbmQoZiIvZW5naW5lL3NpZ25hbHM/bGltaXQ9MTAwMDp7cmVwcihleGMpfSIpCgogICAgaWYgbm90IGlzaW5zdGFuY2UocGF5bG9hZCwgZGljdCk6CiAgICAgICAgcmV0dXJuIHt9LCB7CiAgICAgICAgICAgICJvayI6IEZhbHNlLAogICAgICAgICAgICAiZXJyb3JzIjogZXJyb3JzLAogICAgICAgICAgICAicGF5bG9hZFR5cGUiOiB0eXBlKHBheWxvYWQpLl9fbmFtZV9fLAogICAgICAgICAgICAiaXRlbXNDb3VudCI6IDAsCiAgICAgICAgICAgICJhY3RpdmVQYXNzZWRDb3VudCI6IDAsCiAgICAgICAgICAgICJleGFjdEtleXNDb3VudCI6IDAsCiAgICAgICAgICAgICJzb3VyY2VQYXRoIjogIi9lbmdpbmUvc2lnbmFscy5pdGVtcyIsCiAgICAgICAgfQoKICAgIGl0ZW1zID0gcGF5bG9hZC5nZXQoIml0ZW1zIikKICAgIGlmIG5vdCBpc2luc3RhbmNlKGl0ZW1zLCBsaXN0KToKICAgICAgICByZXR1cm4ge30sIHsKICAgICAgICAgICAgIm9rIjogRmFsc2UsCiAgICAgICAgICAgICJlcnJvcnMiOiBlcnJvcnMgKyBbIml0ZW1zX25vdF9saXN0Il0sCiAgICAgICAgICAgICJwYXlsb2FkVHlwZSI6IHR5cGUocGF5bG9hZCkuX19uYW1lX18sCiAgICAgICAgICAgICJwYXlsb2FkS2V5cyI6IHNvcnRlZChwYXlsb2FkLmtleXMoKSksCiAgICAgICAgICAgICJpdGVtc0NvdW50IjogMCwKICAgICAgICAgICAgImFjdGl2ZVBhc3NlZENvdW50IjogMCwKICAgICAgICAgICAgImV4YWN0S2V5c0NvdW50IjogMCwKICAgICAgICAgICAgInNvdXJjZVBhdGgiOiAiL2VuZ2luZS9zaWduYWxzLml0ZW1zIiwKICAgICAgICB9CgogICAgaW5kZXggPSB7fQogICAgYWN0aXZlX3Bhc3NlZCA9IDAKICAgIHNraXBwZWQgPSB7CiAgICAgICAgIm5vdF9kaWN0IjogMCwKICAgICAgICAibWlzc2luZ19zeW1ib2wiOiAwLAogICAgICAgICJtaXNzaW5nX3NldHVwIjogMCwKICAgICAgICAibm90X2FjdGl2ZSI6IDAsCiAgICAgICAgInF1YWxpdHlfbm90X3Bhc3NlZCI6IDAsCiAgICAgICAgIm1pc3Npbmdfc2lnbmFsX2lkIjogMCwKICAgICAgICAibWlzc2luZ19zaWduYWxfdGltZSI6IDAsCiAgICB9CgogICAgZm9yIHNpZ25hbCBpbiBpdGVtczoKICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShzaWduYWwsIGRpY3QpOgogICAgICAgICAgICBza2lwcGVkWyJub3RfZGljdCJdICs9IDEKICAgICAgICAgICAgY29udGludWUKCiAgICAgICAgc3ltYm9sID0gc3RyKHNpZ25hbC5nZXQoInN5bWJvbCIpIG9yICIiKS5zdHJpcCgpLnVwcGVyKCkKICAgICAgICBzZXR1cF9zbHVnID0gc3RyKHNpZ25hbC5nZXQoInNldHVwU2x1ZyIpIG9yICIiKS5zdHJpcCgpCgogICAgICAgIGlmIG5vdCBzeW1ib2w6CiAgICAgICAgICAgIHNraXBwZWRbIm1pc3Npbmdfc3ltYm9sIl0gKz0gMQogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIG5vdCBzZXR1cF9zbHVnOgogICAgICAgICAgICBza2lwcGVkWyJtaXNzaW5nX3NldHVwIl0gKz0gMQogICAgICAgICAgICBjb250aW51ZQoKICAgICAgICBzdGF0dXMgPSBzdHIoc2lnbmFsLmdldCgic3RhdHVzIikgb3IgIiIpLnN0cmlwKCkudXBwZXIoKQogICAgICAgIHF1YWxpdHkgPSBzdHIoc2lnbmFsLmdldCgicXVhbGl0eVN0YXR1cyIpIG9yICIiKS5zdHJpcCgpLnVwcGVyKCkKCiAgICAgICAgaWYgc3RhdHVzICE9ICJBQ1RJVkUiOgogICAgICAgICAgICBza2lwcGVkWyJub3RfYWN0aXZlIl0gKz0gMQogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIHF1YWxpdHkgIT0gIlBBU1NFRCI6CiAgICAgICAgICAgIHNraXBwZWRbInF1YWxpdHlfbm90X3Bhc3NlZCJdICs9IDEKICAgICAgICAgICAgY29udGludWUKCiAgICAgICAgc2lnbmFsX2lkID0gc3RyKHNpZ25hbC5nZXQoInNpZ25hbElkIikgb3IgIiIpLnN0cmlwKCkKICAgICAgICBzaWduYWxfdGltZSA9ICgKICAgICAgICAgICAgc2lnbmFsLmdldCgidHJpZ2dlclRpbWUiKQogICAgICAgICAgICBvciBzaWduYWwuZ2V0KCJjcmVhdGVkQXQiKQogICAgICAgICAgICBvciBzaWduYWwuZ2V0KCJzdG9yZWRBdCIpCiAgICAgICAgKQogICAgICAgIHNpZ25hbF9kdCA9IF9zMTAzX3BhcnNlX2R0KHNpZ25hbF90aW1lKQoKICAgICAgICBpZiBub3Qgc2lnbmFsX2lkOgogICAgICAgICAgICBza2lwcGVkWyJtaXNzaW5nX3NpZ25hbF9pZCJdICs9IDEKICAgICAgICAgICAgY29udGludWUKICAgICAgICBpZiBzaWduYWxfZHQgaXMgTm9uZToKICAgICAgICAgICAgc2tpcHBlZFsibWlzc2luZ19zaWduYWxfdGltZSJdICs9IDEKICAgICAgICAgICAgY29udGludWUKCiAgICAgICAgYWN0aXZlX3Bhc3NlZCArPSAxCgogICAgICAgIGl0ZW0gPSB7CiAgICAgICAgICAgICJyYXciOiBzaWduYWwsCiAgICAgICAgICAgICJzeW1ib2wiOiBzeW1ib2wsCiAgICAgICAgICAgICJzZXR1cFNsdWciOiBzZXR1cF9zbHVnLAogICAgICAgICAgICAic3RhdHVzIjogc3RhdHVzLAogICAgICAgICAgICAicXVhbGl0eVN0YXR1cyI6IHF1YWxpdHksCiAgICAgICAgICAgICJzb3VyY2VTaWduYWxUaW1lIjogc2lnbmFsX3RpbWUsCiAgICAgICAgICAgICJzb3VyY2VTaWduYWxJZCI6IHNpZ25hbF9pZCwKICAgICAgICAgICAgInNvdXJjZUR0Ijogc2lnbmFsX2R0LAogICAgICAgIH0KCiAgICAgICAga2V5ID0gKHN5bWJvbCwgc2V0dXBfc2x1ZykKICAgICAgICBjdXJyZW50ID0gaW5kZXguZ2V0KGtleSkKCiAgICAgICAgaWYgY3VycmVudCBpcyBOb25lIG9yIHNpZ25hbF9kdCA+IGN1cnJlbnRbInNvdXJjZUR0Il06CiAgICAgICAgICAgIGluZGV4W2tleV0gPSBpdGVtCgogICAgcmV0dXJuIGluZGV4LCB7CiAgICAgICAgIm9rIjogVHJ1ZSwKICAgICAgICAiZXJyb3JzIjogZXJyb3JzLAogICAgICAgICJwYXlsb2FkVHlwZSI6IHR5cGUocGF5bG9hZCkuX19uYW1lX18sCiAgICAgICAgInBheWxvYWRLZXlzIjogc29ydGVkKHBheWxvYWQua2V5cygpKSwKICAgICAgICAiaXRlbXNDb3VudCI6IGxlbihpdGVtcyksCiAgICAgICAgImFjdGl2ZVBhc3NlZENvdW50IjogYWN0aXZlX3Bhc3NlZCwKICAgICAgICAiZXhhY3RLZXlzQ291bnQiOiBsZW4oaW5kZXgpLAogICAgICAgICJza2lwcGVkIjogc2tpcHBlZCwKICAgICAgICAic291cmNlUGF0aCI6ICIvZW5naW5lL3NpZ25hbHMuaXRlbXMiLAogICAgICAgICJtYXRjaFJ1bGUiOiAiZXhhY3Rfc3ltYm9sX3BsdXNfc2V0dXBTbHVnIiwKICAgICAgICAicmVxdWlyZWRMaXZlU3RhdHVzIjogIkFDVElWRSIsCiAgICAgICAgInJlcXVpcmVkTGl2ZVF1YWxpdHlTdGF0dXMiOiAiUEFTU0VEIiwKICAgIH0K").decode("utf-8")

def run(command, check=True):
    print("+", " ".join(command), flush=True)
    result = subprocess.run(command, text=True, capture_output=True)

    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    if check and result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}"
        )

    return result

def wait_for_api():
    for _ in range(60):
        result = run(
            [
                "curl", "-fsS", "--max-time", "15",
                "http://127.0.0.1:8000/health",
            ],
            check=False,
        )
        if result.returncode == 0:
            return
        time.sleep(3)

    run(
        [
            "journalctl", "-u", "skilledge-stock-engine-api.service",
            "-n", "200", "--no-pager",
        ],
        check=False,
    )
    raise RuntimeError("API did not become healthy after S10.3F")

def main():
    if not APP_PATH.exists():
        raise FileNotFoundError(f"app.py not found: {APP_PATH}")

    print("Keeping paper timer disabled during S10.3F...")
    run(
        ["systemctl", "disable", "--now", "skilledge-s10-paper-trading.timer"],
        check=False,
    )
    run(
        ["systemctl", "stop", "skilledge-s10-paper-trading.service"],
        check=False,
    )

    source = APP_PATH.read_text(encoding="utf-8")
    start = source.find(START)
    end = source.find(END, start + len(START))

    if start < 0:
        raise RuntimeError("_s103_fetch_live_signal_index was not found")
    if end < 0:
        raise RuntimeError("_s103_enrich_selected_ideas was not found")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = APP_PATH.with_name(f"app.py.bak_s103f_{stamp}")
    shutil.copy2(APP_PATH, backup)
    print(f"Backup: {backup}")

    patched = source[:start] + NEW_BLOCK + "\n\n" + source[end:]
    APP_PATH.write_text(patched, encoding="utf-8")

    py_compile.compile(str(APP_PATH), doraise=True)
    print("py_compile: OK")

    run(["systemctl", "restart", "skilledge-stock-engine-api.service"])
    wait_for_api()

    print("\n=== S10.3F SOURCE DIAGNOSTIC ===")
    run(
        [
            "curl", "-fsS", "--max-time", "90",
            "http://127.0.0.1:8000/engine/paper/source-diagnostic",
        ]
    )

    print("\n=== PAPER STATUS — MUST REMAIN CLEAN ===")
    run(
        [
            "curl", "-fsS", "--max-time", "60",
            "http://127.0.0.1:8000/engine/paper/status",
        ]
    )

    print("\n=== FINAL TIMER/SERVICE STATE ===")
    run(
        [
            "systemctl", "show", "skilledge-s10-paper-trading.timer",
            "-p", "ActiveState", "-p", "SubState",
            "-p", "UnitFileState", "--no-pager",
        ],
        check=False,
    )
    run(
        [
            "systemctl", "show", "skilledge-s10-paper-trading.service",
            "-p", "ActiveState", "-p", "SubState",
            "-p", "Result", "-p", "ExecMainStatus",
            "--no-pager",
        ],
        check=False,
    )

    print("\nS10.3F installed.")
    print("No reset was performed.")
    print("No paper run-once was executed.")
    print("Paper timer remains disabled.")
    print("Telegram/client/research gates were NOT modified.")
    print(f"Backup: {backup}")

if __name__ == "__main__":
    main()
'@

try {
    [System.IO.File]::WriteAllText(
        $localInstaller,
        $pythonInstaller,
        [System.Text.UTF8Encoding]::new($false)
    )

    Invoke-NativeChecked -FilePath "scp" -Arguments @(
        "-i", $SshKey,
        "-o", "StrictHostKeyChecking=accept-new",
        $localInstaller,
        "${VpsHost}:$remoteInstaller"
    )

    $remoteCommand = @"
set -euo pipefail
chmod 700 '$remoteInstaller'
python3 '$remoteInstaller'
rm -f '$remoteInstaller'
"@

    Invoke-NativeChecked -FilePath "ssh" -Arguments @(
        "-i", $SshKey,
        "-o", "StrictHostKeyChecking=accept-new",
        $VpsHost,
        $remoteCommand
    )

    Write-Host "`nS10.3F matcher patch completed." -ForegroundColor Green
}
finally {
    Remove-Item -LiteralPath $localInstaller -Force -ErrorAction SilentlyContinue
}
