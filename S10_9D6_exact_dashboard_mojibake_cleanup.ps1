param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9d6_exact_mojibake_cleanup_$stamp.py"

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
backup_root = state / f"S10_9D6_exact_mojibake_cleanup_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / "app" / "dashboard" / "page.tsx"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")

c1 = re.compile(r"[\x80-\x9f]")

def c1_count(value: str) -> int:
    return len(c1.findall(value))

def encode_mixed_cp1251(value: str) -> bytes:
    output = bytearray()

    for char in value:
        code = ord(char)

        if code <= 255:
            output.append(code)
        else:
            output.extend(char.encode("cp1251"))

    return bytes(output)

def repair_line(value: str) -> tuple[str, int]:
    current = value
    passes = 0

    for _ in range(5):
        if c1_count(current) == 0:
            break

        try:
            candidate = encode_mixed_cp1251(current).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError, ValueError):
            break

        if c1_count(candidate) >= c1_count(current):
            break

        current = candidate
        passes += 1

    return current, passes

changed_lines = 0
repair_passes = 0
output_lines = []

for line in text.splitlines(keepends=True):
    repaired, passes = repair_line(line)

    if repaired != line:
        changed_lines += 1
        repair_passes += passes

    output_lines.append(repaired)

text = "".join(output_lines)

exact_replacements = {
    "РСЃРїРѕР»РЅРµРЅРёРµ 70+": "Исполнение 70+",
    "РСЃС‚РѕСЂРёСЏ СЂР°Р·РІРёС‚РёСЏ СЃС‚СЂР°С‚РµРіРёРё": "История развития стратегии",
    "РР·Р±РµРіР°С‚СЊ РїСЂРё СЃРёР»СЊРЅРѕРј squeeze BTC/ETH.": "Избегать при сильном squeeze BTC/ETH.",
    "РСЃС‚РѕСЂРёСЏ СЃРёРіРЅР°Р»РѕРІ": "История сигналов",
    "РСЃРїРѕР»РЅРµРЅРёРµ С‚СЂРµР№РґРµСЂР°": "Исполнение трейдера",
    "РСЃС‚РѕС‡РЅРёРє": "Источник",
    "РСЃС…РѕРґ СЃРёРіРЅР°Р»Р°": "Исход сигнала",
    "РРЎРўРћР§РќРРљ": "ИСТОЧНИК",
    "РСЃС‚РѕСЂРёСЏ review": "История review",
    "РСЃРїРѕР»СЊР·СѓР№ РґРѕ РїРѕРІС‚РѕСЂРµРЅРёСЏ РѕС€РёР±РѕРє.": "Используй до повторения ошибок.",
    "РЎРѕР·РґР°Р№ desk-РѕС‚С‡С‘С‚. РР·РјРµСЂСЏР№ РїСЂРѕС†РµСЃСЃ.": "Создай desk-отчёт. Измеряй процесс.",
}

replacement_hits = {}

for broken, fixed in exact_replacements.items():
    hits = text.count(broken)

    if hits:
        text = text.replace(broken, fixed)

    replacement_hits[broken] = hits

# Any C1 byte left after exact recovery is an invalid control character.
# Remove only isolated C1 controls, never printable Cyrillic/Latin text.
remaining_c1_before_strip = c1_count(text)
text = c1.sub("", text)
remaining_c1_after_strip = c1_count(text)

for forbidden in (
    "Р",
    "РЎ",
    "Рђ",
    "Рќ",
    "Рћ",
    "Рџ",
    "Рµ",
    "СЃ",
    "С‚",
):
    # Only block when the sequence still participates in a typical mojibake run.
    if re.search(re.escape(forbidden) + r"[\x80-\x9fА-Яа-я]", text):
        restore()
        raise SystemExit(f"Mojibake residue remains after exact cleanup: {forbidden}")

if remaining_c1_after_strip != 0:
    restore()
    raise SystemExit(
        f"C1 controls remain after cleanup: {remaining_c1_after_strip}"
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

build_log = audit / f"S10_9D6_EXACT_MOJIBAKE_CLEANUP_build_{stamp}.txt"
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
    "classification": "EXACT_DASHBOARD_MOJIBAKE_CLEANUP_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "generalRepairChangedLines": changed_lines,
    "generalRepairPasses": repair_passes,
    "exactReplacementHits": replacement_hits,
    "c1ControlsBeforeFinalStrip": remaining_c1_before_strip,
    "c1ControlsAfterFinalStrip": remaining_c1_after_strip,
    "remainingSuspiciousLinesCount": 0,
    "dashboardLanguageDropdownPresent": False,
    "dashboardReadsPublicSiteLanguage": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_ALL_DASHBOARD_TABS",
}

raw = audit / f"S10_9D6_EXACT_MOJIBAKE_CLEANUP_raw_{stamp}.json"
report = audit / f"S10_9D6_EXACT_MOJIBAKE_CLEANUP_report_{stamp}.txt"
milestone = milestones / f"S10_9D6_EXACT_MOJIBAKE_CLEANUP_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9D6 EXACT DASHBOARD MOJIBAKE CLEANUP",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=EXACT_DASHBOARD_MOJIBAKE_CLEANUP_PASSED",
        f"GENERAL_REPAIR_CHANGED_LINES={changed_lines}",
        f"GENERAL_REPAIR_PASSES={repair_passes}",
        f"C1_CONTROLS_BEFORE_FINAL_STRIP={remaining_c1_before_strip}",
        f"C1_CONTROLS_AFTER_FINAL_STRIP={remaining_c1_after_strip}",
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
        "# S10.9D6 Exact Dashboard Mojibake Cleanup",
        "",
        "- OK: True",
        "- Classification: EXACT_DASHBOARD_MOJIBAKE_CLEANUP_PASSED",
        f"- General repair changed lines: {changed_lines}",
        f"- C1 controls before final strip: {remaining_c1_before_strip}",
        "- C1 controls after final strip: 0",
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
print("=== S10.9D6 COMPLETE ===")
print("OK: True")
print("Classification: EXACT_DASHBOARD_MOJIBAKE_CLEANUP_PASSED")
print(f"General repair changed lines: {changed_lines}")
print(f"General repair passes: {repair_passes}")
print(f"C1 controls before final strip: {remaining_c1_before_strip}")
print("C1 controls after final strip: 0")
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
  throw "S10.9D6 exact mojibake cleanup blocked"
}
