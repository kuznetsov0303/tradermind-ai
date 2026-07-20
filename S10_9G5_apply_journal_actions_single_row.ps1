param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9g5_journal_actions_single_row_$stamp.py"

$python=@'
from __future__ import annotations

import json
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

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9G5_journal_actions_single_row_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / dashboard.relative_to(project)
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")

old_header = '''  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-3">
      <h4 className="text-lg font-black">
        {trade.ticker}
      </h4>

      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
        {getDirectionLabel(trade.direction)}
      </span>

      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
        {getMarketLabel(trade.market)}
      </span>
    </div>

    <p className="mt-1 text-sm text-white/45">
      {trade.trade_date}
    </p>
  </div>'''

new_header = '''  <div className="flex min-w-0 items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-lg font-black">
          {trade.ticker}
        </h4>

        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
          {getDirectionLabel(trade.direction)}
        </span>

        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
          {getMarketLabel(trade.market)}
        </span>
      </div>

      <p className="mt-1 text-sm text-white/45">
        {trade.trade_date}
      </p>
    </div>

    <div className="shrink-0 text-right">
      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
        PnL
      </div>

      <div className="mt-0.5 text-lg font-black text-white">
        {trade.pnl === null ? "—" : `$${trade.pnl}`}
      </div>
    </div>
  </div>'''

if old_header not in text:
    restore()
    raise SystemExit("Journal trade header anchor not found")

text = text.replace(old_header, new_header, 1)

old_actions_start = '''  <div className="flex w-full flex-row flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3 md:justify-end">
    <div className="mr-auto min-w-[96px] text-left md:text-right">
      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
        PnL
      </div>

      <div className="mt-0.5 text-lg font-black text-white">
        {trade.pnl === null ? "—" : `$${trade.pnl}`}
      </div>
    </div>

    <button'''

new_actions_start = '''  <div className="grid w-full grid-cols-2 gap-2 border-t border-white/[0.07] pt-3 xl:grid-cols-4">
    <button'''

if old_actions_start not in text:
    restore()
    raise SystemExit("Journal action-row anchor not found")

text = text.replace(old_actions_start, new_actions_start, 1)

button_class_updates = [
    (
        'className="w-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"',
        'className="w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"',
    ),
    (
        'className="w-auto shrink-0 rounded-full border border-[#00C076]/20 bg-[#00C076]/10 px-4 py-2 text-xs font-black text-[#DFFFEF] transition hover:bg-[#00C076]/15"',
        'className="w-full rounded-full border border-[#00C076]/20 bg-[#00C076]/10 px-3 py-2 text-xs font-black text-[#DFFFEF] transition hover:bg-[#00C076]/15"',
    ),
    (
        'className="w-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"',
        'className="w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"',
    ),
    (
        'className="w-auto shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-bold text-red-200 transition hover:bg-red-400/15"',
        'className="w-full rounded-full border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-400/15"',
    ),
]

for old, new in button_class_updates:
    if old not in text:
        restore()
        raise SystemExit(f"Journal button class anchor missing: {old[:60]}")
    text = text.replace(old, new, 1)

old_screenshot = '<div className="ml-auto w-auto text-right text-xs text-white/35">'
new_screenshot = '<div className="col-span-2 text-right text-xs text-white/35 xl:col-span-4">'

if old_screenshot not in text:
    restore()
    raise SystemExit("Journal screenshot-count anchor not found")

text = text.replace(old_screenshot, new_screenshot, 1)

required_tokens = [
    'flex min-w-0 items-start justify-between gap-4',
    'grid w-full grid-cols-2 gap-2',
    'xl:grid-cols-4',
    'col-span-2 text-right',
]

for token in required_tokens:
    if token not in text:
        restore()
        raise SystemExit(f"Safety check failed: {token}")

dashboard.write_text(text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9G5_JOURNAL_ACTIONS_SINGLE_ROW_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; original dashboard restored. See: {build_log}")

result = {
    "ok": True,
    "classification": "JOURNAL_ACTIONS_SINGLE_ROW_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "pnlMovedToHeader": True,
    "actionsGridDesktopColumns": 4,
    "actionsGridCompactColumns": 2,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_JOURNAL",
}

raw = audit / f"S10_9G5_JOURNAL_ACTIONS_SINGLE_ROW_raw_{stamp}.json"
report = audit / f"S10_9G5_JOURNAL_ACTIONS_SINGLE_ROW_report_{stamp}.txt"
milestone = milestones / f"S10_9G5_JOURNAL_ACTIONS_SINGLE_ROW_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9G5 JOURNAL ACTIONS SINGLE ROW",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=JOURNAL_ACTIONS_SINGLE_ROW_PATCH_PASSED",
        "PNL_MOVED_TO_HEADER=True",
        "ACTIONS_GRID_DESKTOP_COLUMNS=4",
        "ACTIONS_GRID_COMPACT_COLUMNS=2",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=LOCAL_VISUAL_VERIFY_JOURNAL",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9G5 Journal Actions Single Row",
        "",
        "- OK: True",
        "- PnL moved to header: True",
        "- Desktop action columns: 4",
        "- Compact action columns: 2",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9G5 COMPLETE ===")
print("OK: True")
print("Classification: JOURNAL_ACTIONS_SINGLE_ROW_PATCH_PASSED")
print("PnL moved to header: True")
print("Desktop action columns: 4")
print("Compact action columns: 2")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_JOURNAL")
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
  if($LASTEXITCODE -eq 0){ $pythonMode="py" }
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

if(-not $pythonMode){ throw "Usable Python not found" }

if($pythonMode -eq "py"){
  & py -3 $runner $ProjectRoot
}else{
  & $pythonPath $runner $ProjectRoot
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9G5 Journal single-row patch blocked"
}
