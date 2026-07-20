param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9d3_dashboard_locale_repair_$stamp.py"

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
backup_root = state / f"S10_9D3_dashboard_locale_repair_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / "app" / "dashboard" / "page.tsx"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")

# Remove every language-dropdown fragment introduced by S10.9D.
text = re.sub(
    r'^\s*const \[languageMenuOpen,\s*setLanguageMenuOpen\]\s*=\s*useState\(false\);\s*\n',
    '',
    text,
    count=1,
    flags=re.MULTILINE,
)

text = re.sub(
    r'^\s*const changeLanguage\s*=\s*\(nextLanguage:\s*Language\)\s*=>\s*\{.*?^\s*\};\s*\n',
    '',
    text,
    count=1,
    flags=re.MULTILINE | re.DOTALL,
)

back_to_site_anchor = """      <a
        href="/"
        className="se-dashboard-button-secondary rounded-full px-5 py-3 text-sm font-black transition hover:-translate-y-0.5"
      >"""

back_index = text.find(back_to_site_anchor)

if back_index == -1:
    restore()
    raise SystemExit("Back-to-site anchor not found")

prefix = text[:back_index]
handler_index = prefix.rfind("setLanguageMenuOpen")

if handler_index != -1:
    start_index = prefix.rfind('      <div className="relative">', 0, handler_index)

    if start_index == -1:
        restore()
        raise SystemExit("Language dropdown start wrapper not found")

    text = text[:start_index] + text[back_index:]

text = re.sub(
    r'^\s*setLanguageMenuOpen\([^\n]*\);\s*\n',
    '',
    text,
    flags=re.MULTILINE,
)

text = text.replace(
    'onClick={() => setLanguageMenuOpen((current) => !current)}',
    '',
)
text = text.replace(
    'onClick={() => setLanguageMenuOpen(false)}',
    '',
)

MOJIBAKE_TOKENS = (
    "Рџ", "РЎ", "Рђ", "Р—", "Рћ", "Рќ", "Рў", "Р’", "Рљ",
    "Рњ", "Рџ", "Рµ", "Р°", "Рё", "СЃ", "С‚", "СЏ", "С‹",
    "СЊ", "С‡", "С€", "С‰", "С–", "С—", "вЂ", "в„", "РЦ",
)

def score(value: str) -> int:
    return sum(value.count(token) for token in MOJIBAKE_TOKENS)

def repair_once(value: str) -> str:
    current_score = score(value)
    if current_score == 0:
        return value

    best = value
    best_score = current_score

    for encoding in ("cp1251", "latin1"):
        try:
            candidate = value.encode(encoding).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue

        candidate_score = score(candidate)

        if candidate_score < best_score:
            best = candidate
            best_score = candidate_score

    return best

def repair_iterative(value: str) -> tuple[str, int]:
    current = value
    passes = 0

    for _ in range(4):
        repaired = repair_once(current)

        if repaired == current:
            break

        current = repaired
        passes += 1

    return current, passes

lines = text.splitlines(keepends=True)
repaired_lines = []
changed_line_count = 0
repair_pass_count = 0

for line in lines:
    repaired, passes = repair_iterative(line)

    if repaired != line:
        changed_line_count += 1
        repair_pass_count += passes

    repaired_lines.append(repaired)

text = "".join(repaired_lines)

# Dashboard must only consume the language chosen on the public site.
if 'localStorage.getItem("skilledge_language")' not in text:
    restore()
    raise SystemExit("Dashboard no longer reads public-site language preference")

# The language dropdown must be gone.
residue_patterns = {
    "languageMenuOpen": r"\blanguageMenuOpen\b",
    "setLanguageMenuOpen": r"\bsetLanguageMenuOpen\b",
    "changeLanguage": r"\bchangeLanguage\s*\(",
    "languageMenuAria": r'aria-haspopup="menu"',
}

for residue_name, residue_pattern in residue_patterns.items():
    match = re.search(residue_pattern, text)

    if match:
        restore()
        line_number = text.count("\n", 0, match.start()) + 1
        raise SystemExit(
            f"Dashboard language dropdown residue remains: "
            f"{residue_name} at line {line_number}"
        )

remaining_lines = []
for number, line in enumerate(text.splitlines(), start=1):
    if score(line) >= 2:
        remaining_lines.append({
            "line": number,
            "preview": line.strip()[:240],
            "score": score(line),
        })

dashboard.write_text(text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9D3_DASHBOARD_LOCALE_REPAIR_build_{stamp}.txt"
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
    "classification": "DASHBOARD_SITE_LOCALE_AND_MOJIBAKE_REPAIR_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "dashboardLanguageDropdownRemoved": True,
    "dashboardReadsPublicSiteLanguage": True,
    "localStorageKey": "skilledge_language",
    "changedLines": changed_line_count,
    "repairPassesApplied": repair_pass_count,
    "remainingSuspiciousLinesCount": len(remaining_lines),
    "remainingSuspiciousLines": remaining_lines[:100],
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_STRATEGY_AND_DASHBOARD_LANGUAGES",
}

raw = audit / f"S10_9D3_DASHBOARD_LOCALE_REPAIR_raw_{stamp}.json"
report = audit / f"S10_9D3_DASHBOARD_LOCALE_REPAIR_report_{stamp}.txt"
milestone = milestones / f"S10_9D3_DASHBOARD_LOCALE_REPAIR_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report.write_text(
    "\n".join([
        "S10.9D3 DASHBOARD SITE-LOCALE / MOJIBAKE REPAIR",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=DASHBOARD_SITE_LOCALE_AND_MOJIBAKE_REPAIR_PASSED",
        "DASHBOARD_LANGUAGE_DROPDOWN_REMOVED=True",
        "DASHBOARD_READS_PUBLIC_SITE_LANGUAGE=True",
        "LOCAL_STORAGE_KEY=skilledge_language",
        f"CHANGED_LINES={changed_line_count}",
        f"REPAIR_PASSES_APPLIED={repair_pass_count}",
        f"REMAINING_SUSPICIOUS_LINES={len(remaining_lines)}",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=LOCAL_VISUAL_VERIFY_STRATEGY_AND_DASHBOARD_LANGUAGES",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9D3 Dashboard Locale Repair",
        "",
        "- OK: True",
        "- Classification: DASHBOARD_SITE_LOCALE_AND_MOJIBAKE_REPAIR_PASSED",
        "- Dashboard language dropdown removed: True",
        "- Dashboard reads public-site language: True",
        "- Local storage key: skilledge_language",
        f"- Changed lines: {changed_line_count}",
        f"- Repair passes: {repair_pass_count}",
        f"- Remaining suspicious lines: {len(remaining_lines)}",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9D3 COMPLETE ===")
print("OK: True")
print("Classification: DASHBOARD_SITE_LOCALE_AND_MOJIBAKE_REPAIR_PASSED")
print("Dashboard language dropdown removed: True")
print("Dashboard reads public-site language: True")
print("Local storage key: skilledge_language")
print(f"Changed lines: {changed_line_count}")
print(f"Repair passes applied: {repair_pass_count}")
print(f"Remaining suspicious lines: {len(remaining_lines)}")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_STRATEGY_AND_DASHBOARD_LANGUAGES")
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
  throw "S10.9D3 dashboard locale repair blocked"
}
