param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9d5_final_mojibake_repair_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

dashboard = project / "app" / "dashboard" / "page.tsx"
package_json = project / "package.json"

for path in (dashboard, package_json):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

state = project / "PROJECT_STATE"
audit = project / "audit_exports"
milestones = state / "milestones"
backup_root = state / f"S10_9D5_final_mojibake_repair_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / "app" / "dashboard" / "page.tsx"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")

MOJIBAKE_PATTERNS = (
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
    "Р", "Р", "Р", "Р",
)

# Real detection is based on Cyrillic bytes mixed with U+0080..U+009F controls.
mixed_mojibake = re.compile(r"[А-Яа-яЁё][\x80-\x9f]|[\x80-\x9f][А-Яа-яЁё]")

def suspicious_score(value: str) -> int:
    return len(mixed_mojibake.findall(value))

def encode_mixed_cp1251(value: str) -> bytes:
    output = bytearray()

    for char in value:
        code = ord(char)

        if code <= 255:
            output.append(code)
            continue

        output.extend(char.encode("cp1251"))

    return bytes(output)

def repair_once(value: str) -> str:
    before = suspicious_score(value)

    if before == 0:
        return value

    try:
        candidate = encode_mixed_cp1251(value).decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError, ValueError):
        return value

    return candidate if suspicious_score(candidate) < before else value

def repair_iterative(value: str) -> tuple[str, int]:
    current = value
    passes = 0

    for _ in range(5):
        candidate = repair_once(current)

        if candidate == current:
            break

        current = candidate
        passes += 1

    return current, passes

changed_lines = 0
repair_passes = 0
repaired_output = []

for line in text.splitlines(keepends=True):
    repaired, passes = repair_iterative(line)

    if repaired != line:
        changed_lines += 1
        repair_passes += passes

    repaired_output.append(repaired)

text = "".join(repaired_output)

remaining = []
for line_number, line in enumerate(text.splitlines(), start=1):
    current_score = suspicious_score(line)

    if current_score > 0:
        remaining.append({
            "line": line_number,
            "score": current_score,
            "preview": line.strip()[:260],
        })

if remaining:
    restore()
    diagnostic = audit / f"S10_9D5_FINAL_MOJIBAKE_REPAIR_remaining_{stamp}.json"
    diagnostic.write_text(
        json.dumps(remaining, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    raise SystemExit(
        f"Final mojibake repair still has {len(remaining)} suspicious lines; "
        f"dashboard restored. See: {diagnostic}"
    )

if "languageMenuOpen" in text or "setLanguageMenuOpen" in text:
    restore()
    raise SystemExit("Dashboard language dropdown residue returned")

if 'localStorage.getItem("skilledge_language")' not in text:
    restore()
    raise SystemExit("Dashboard lost public-site locale binding")

dashboard.write_text(text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9D5_FINAL_MOJIBAKE_REPAIR_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "")
    + "\n--- STDERR ---\n"
    + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(
        f"Build failed; original dashboard restored. See: {build_log}"
    )

result = {
    "ok": True,
    "classification": "FINAL_DASHBOARD_MOJIBAKE_REPAIR_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "changedLines": changed_lines,
    "repairPassesApplied": repair_passes,
    "remainingSuspiciousLinesCount": 0,
    "dashboardLanguageDropdownPresent": False,
    "dashboardReadsPublicSiteLanguage": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_ALL_DASHBOARD_TABS",
}

raw = audit / f"S10_9D5_FINAL_MOJIBAKE_REPAIR_raw_{stamp}.json"
report = audit / f"S10_9D5_FINAL_MOJIBAKE_REPAIR_report_{stamp}.txt"
milestone = milestones / f"S10_9D5_FINAL_MOJIBAKE_REPAIR_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9D5 FINAL DASHBOARD MOJIBAKE REPAIR",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=FINAL_DASHBOARD_MOJIBAKE_REPAIR_PASSED",
        f"CHANGED_LINES={changed_lines}",
        f"REPAIR_PASSES_APPLIED={repair_passes}",
        "REMAINING_SUSPICIOUS_LINES=0",
        "DASHBOARD_LANGUAGE_DROPDOWN_PRESENT=False",
        "DASHBOARD_READS_PUBLIC_SITE_LANGUAGE=True",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=LOCAL_VISUAL_VERIFY_ALL_DASHBOARD_TABS",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9D5 Final Dashboard Mojibake Repair",
        "",
        "- OK: True",
        "- Classification: FINAL_DASHBOARD_MOJIBAKE_REPAIR_PASSED",
        f"- Changed lines: {changed_lines}",
        f"- Repair passes: {repair_passes}",
        "- Remaining suspicious lines: 0",
        "- Dashboard language dropdown: absent",
        "- Dashboard reads public-site language: True",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9D5 COMPLETE ===")
print("OK: True")
print("Classification: FINAL_DASHBOARD_MOJIBAKE_REPAIR_PASSED")
print(f"Changed lines: {changed_lines}")
print(f"Repair passes applied: {repair_passes}")
print("Remaining suspicious lines: 0")
print("Dashboard language dropdown present: False")
print("Dashboard reads public-site language: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_ALL_DASHBOARD_TABS")
'@

[IO.File]::WriteAllText(
  $runner,
  $python,
  [Text.UTF8Encoding]::new($false)
)

$pythonMode=$null
$pythonPath=$null

try{
  & py -3 --version *> $null
  if($LASTEXITCODE -eq 0){
    $pythonMode="py"
  }
}catch{}

if(-not $pythonMode){
  foreach($candidate in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
  )){
    if(Test-Path -LiteralPath $candidate){
      $pythonMode="exe"
      $pythonPath=$candidate
      break
    }
  }
}

if(-not $pythonMode){
  throw "Usable Python not found"
}

if($pythonMode -eq "py"){
  & py -3 $runner $ProjectRoot
}else{
  & $pythonPath $runner $ProjectRoot
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9D5 final mojibake repair blocked"
}
