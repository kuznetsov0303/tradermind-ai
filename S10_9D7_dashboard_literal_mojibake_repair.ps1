param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9d7_literal_repair_$stamp.py"

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
backup_root = state / f"S10_9D7_literal_mojibake_repair_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / "app" / "dashboard" / "page.tsx"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")

# String literals only. This avoids decoding a whole TSX line that may also
# contain already-valid Ukrainian/Russian text.
literal_pattern = re.compile(r'(["\'`])((?:\\.|(?!\1).)*?)\1')

c1_pattern = re.compile(r"[\x80-\x9f]")
mojibake_pair_pattern = re.compile(
    r"[РС][\x80-\x9f\u00a0-\u00bf\u2010-\u203f]"
)

def suspicious_score(value: str) -> int:
    return (
        len(c1_pattern.findall(value))
        + len(mojibake_pair_pattern.findall(value))
    )

def mixed_cp1251_bytes(value: str) -> bytes:
    output = bytearray()

    for char in value:
        code = ord(char)

        if code <= 255:
            output.append(code)
        else:
            output.extend(char.encode("cp1251"))

    return bytes(output)

def repair_literal(value: str) -> tuple[str, int]:
    current = value
    passes = 0

    for _ in range(6):
        before = suspicious_score(current)

        if before == 0:
            break

        try:
            candidate = mixed_cp1251_bytes(current).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError, ValueError):
            break

        after = suspicious_score(candidate)

        if after >= before:
            break

        current = candidate
        passes += 1

    return current, passes

repaired_literals = 0
repair_passes = 0

def replace_literal(match: re.Match[str]) -> str:
    global repaired_literals, repair_passes

    quote = match.group(1)
    body = match.group(2)
    repaired, passes = repair_literal(body)

    if repaired != body:
        repaired_literals += 1
        repair_passes += passes

    return quote + repaired + quote

text = literal_pattern.sub(replace_literal, text)

# Exact fallback for the known residual phrases from the S10.9D5 diagnostic.
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

exact_hits = {}

for broken, fixed in exact_replacements.items():
    hits = text.count(broken)
    exact_hits[broken] = hits

    if hits:
        text = text.replace(broken, fixed)

# Remove only invalid C1 control characters. Printable punctuation and
# legitimate Cyrillic are never removed.
c1_before_strip = len(c1_pattern.findall(text))
text = c1_pattern.sub("", text)
c1_after_strip = len(c1_pattern.findall(text))

remaining = []

for line_number, line in enumerate(text.splitlines(), start=1):
    score = suspicious_score(line)

    if score:
        remaining.append({
            "line": line_number,
            "score": score,
            "preview": line.strip()[:300],
        })

if remaining:
    restore()
    diagnostic = audit / f"S10_9D7_LITERAL_REPAIR_remaining_{stamp}.json"
    diagnostic.write_text(
        json.dumps(remaining, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    raise SystemExit(
        f"Literal repair still has {len(remaining)} suspicious lines; "
        f"dashboard restored. See: {diagnostic}"
    )

if c1_after_strip != 0:
    restore()
    raise SystemExit(f"C1 controls remain: {c1_after_strip}")

if "languageMenuOpen" in text or "setLanguageMenuOpen" in text:
    restore()
    raise SystemExit("Dashboard language dropdown residue remains")

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

build_log = audit / f"S10_9D7_LITERAL_REPAIR_build_{stamp}.txt"
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
    "classification": "DASHBOARD_LITERAL_MOJIBAKE_REPAIR_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "repairedStringLiterals": repaired_literals,
    "repairPassesApplied": repair_passes,
    "exactReplacementHits": exact_hits,
    "c1ControlsBeforeStrip": c1_before_strip,
    "c1ControlsAfterStrip": c1_after_strip,
    "remainingSuspiciousLinesCount": 0,
    "dashboardLanguageDropdownPresent": False,
    "dashboardReadsPublicSiteLanguage": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_ALL_DASHBOARD_TABS",
}

raw = audit / f"S10_9D7_LITERAL_REPAIR_raw_{stamp}.json"
report = audit / f"S10_9D7_LITERAL_REPAIR_report_{stamp}.txt"
milestone = milestones / f"S10_9D7_LITERAL_REPAIR_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9D7 DASHBOARD STRING-LITERAL MOJIBAKE REPAIR",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=DASHBOARD_LITERAL_MOJIBAKE_REPAIR_PASSED",
        f"REPAIRED_STRING_LITERALS={repaired_literals}",
        f"REPAIR_PASSES_APPLIED={repair_passes}",
        f"C1_CONTROLS_BEFORE_STRIP={c1_before_strip}",
        f"C1_CONTROLS_AFTER_STRIP={c1_after_strip}",
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
        "# S10.9D7 Dashboard Literal Mojibake Repair",
        "",
        "- OK: True",
        "- Classification: DASHBOARD_LITERAL_MOJIBAKE_REPAIR_PASSED",
        f"- Repaired string literals: {repaired_literals}",
        f"- Repair passes: {repair_passes}",
        f"- C1 controls after strip: {c1_after_strip}",
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
print("=== S10.9D7 COMPLETE ===")
print("OK: True")
print("Classification: DASHBOARD_LITERAL_MOJIBAKE_REPAIR_PASSED")
print(f"Repaired string literals: {repaired_literals}")
print(f"Repair passes applied: {repair_passes}")
print(f"C1 controls before strip: {c1_before_strip}")
print(f"C1 controls after strip: {c1_after_strip}")
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
  throw "S10.9D7 literal mojibake repair blocked"
}
