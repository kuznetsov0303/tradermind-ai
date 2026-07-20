param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9g4_edge_journal_correction_$stamp.py"

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
backup_root = project / "PROJECT_STATE" / f"S10_9G4_edge_journal_correction_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / dashboard.relative_to(project)
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(dashboard, backup)

def restore() -> None:
    shutil.copy2(backup, dashboard)

text = dashboard.read_text(encoding="utf-8-sig")
results = []

def replace_required(old: str, new: str, name: str) -> None:
    global text

    hits = text.count(old)

    if hits == 0:
        restore()
        raise SystemExit(f"Required correction anchor missing: {name}")

    text = text.replace(old, new)
    results.append({"name": name, "hits": hits})

# ---------------------------------------------------------------------------
# EDGE
# The dashboard main section already provides the premium panel shell.
# Remove the nested global se-dashboard-panel class from PersonalEdgeEnginePanel
# and give it an explicit compact local background.
# ---------------------------------------------------------------------------
replace_required(
    '<div className="se-dashboard-panel relative overflow-hidden rounded-[2.35rem] border border-white/[0.08] p-6 shadow-[0_34px_130px_rgba(0,0,0,0.38)]">',
    '<div className="relative overflow-hidden rounded-[2.1rem] border border-white/[0.08] bg-[#07111F]/58 p-5 shadow-[0_22px_90px_rgba(0,0,0,0.26)] md:p-6">',
    "edge_remove_nested_dashboard_panel",
)

# Make the outer main content section self-start in the dashboard's two-column
# grid so it does not inherit the full height of the right command sidebar.
replace_required(
    'className={activeTab === "cockpit" ? "relative h-full overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none" : "se-dashboard-panel relative overflow-hidden rounded-[1.75rem] p-3 sm:rounded-[2.25rem] sm:p-4 md:p-6"}',
    'className={activeTab === "cockpit" ? "relative h-full overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none" : "se-dashboard-panel relative self-start overflow-hidden rounded-[1.75rem] p-3 sm:rounded-[2.25rem] sm:p-4 md:p-6"}',
    "dashboard_main_section_self_start",
)

# ---------------------------------------------------------------------------
# JOURNAL
# Remove the fixed 116px action column. Keep trade identity on the first row,
# then place PnL and all action buttons in a full-width horizontal row.
# ---------------------------------------------------------------------------
replace_required(
    '<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_116px] md:items-start">',
    '<div className="flex flex-col gap-3">',
    "journal_remove_fixed_action_column",
)

replace_required(
    '<div className="flex w-full flex-row flex-wrap items-center gap-2 md:w-auto md:max-w-[620px] md:justify-end">',
    '<div className="flex w-full flex-row flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3 md:justify-end">',
    "journal_full_width_action_row",
)

replace_required(
    '<div className="mb-1 min-w-[96px] text-right">',
    '<div className="mr-auto min-w-[96px] text-left md:text-right">',
    "journal_pnl_alignment",
)

button_class_replacements = [
    (
        'className="w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"',
        'className="w-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"',
        "journal_analyze_button_auto_width",
    ),
    (
        'className="w-full rounded-full border border-[#00C076]/20 bg-[#00C076]/10 px-3 py-1.5 text-xs font-black text-[#DFFFEF] transition hover:bg-[#00C076]/15"',
        'className="w-auto shrink-0 rounded-full border border-[#00C076]/20 bg-[#00C076]/10 px-4 py-2 text-xs font-black text-[#DFFFEF] transition hover:bg-[#00C076]/15"',
        "journal_open_chart_auto_width",
    ),
    (
        'className="w-full rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"',
        'className="w-auto shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"',
        "journal_edit_auto_width",
    ),
    (
        'className="w-full rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-200 transition hover:bg-red-400/15"',
        'className="w-auto shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-bold text-red-200 transition hover:bg-red-400/15"',
        "journal_delete_auto_width",
    ),
    (
        '<div className="w-full text-right text-xs text-white/35">',
        '<div className="ml-auto w-auto text-right text-xs text-white/35">',
        "journal_screenshot_count_inline",
    ),
]

for old, new, name in button_class_replacements:
    replace_required(old, new, name)

# Safety checks.
required_tokens = [
    'bg-[#07111F]/58',
    'self-start overflow-hidden',
    '<div className="flex flex-col gap-3">',
    'border-t border-white/[0.07] pt-3 md:justify-end',
    'w-auto shrink-0 rounded-full',
    'ml-auto w-auto text-right',
]

for token in required_tokens:
    if token not in text:
        restore()
        raise SystemExit(f"Safety check failed: {token}")

if 'md:grid-cols-[minmax(0,1fr)_116px]' in text:
    restore()
    raise SystemExit("Old fixed 116px Journal action column remains")

dashboard.write_text(text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9G4_EDGE_JOURNAL_CORRECTION_build_{stamp}.txt"
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
    "classification": "EDGE_JOURNAL_LAYOUT_CORRECTION_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "app/dashboard/page.tsx",
    "backupRoot": str(backup_root),
    "replacementResults": results,
    "edgeNestedDashboardPanelRemoved": True,
    "dashboardMainSectionSelfStart": True,
    "journalFixedActionColumnRemoved": True,
    "journalActionsFullWidthHorizontal": True,
    "journalButtonsAutoWidth": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_EDGE_AND_JOURNAL",
}

raw = audit / f"S10_9G4_EDGE_JOURNAL_CORRECTION_raw_{stamp}.json"
report = audit / f"S10_9G4_EDGE_JOURNAL_CORRECTION_report_{stamp}.txt"
milestone = milestones / f"S10_9G4_EDGE_JOURNAL_CORRECTION_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9G4 EDGE / JOURNAL LAYOUT CORRECTION",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=EDGE_JOURNAL_LAYOUT_CORRECTION_PASSED",
    "EDGE_NESTED_DASHBOARD_PANEL_REMOVED=True",
    "DASHBOARD_MAIN_SECTION_SELF_START=True",
    "JOURNAL_FIXED_ACTION_COLUMN_REMOVED=True",
    "JOURNAL_ACTIONS_FULL_WIDTH_HORIZONTAL=True",
    "JOURNAL_BUTTONS_AUTO_WIDTH=True",
    "BUILD_PASSED=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
]

for row in results:
    report_lines.append(
        f"REPLACEMENT_{row['name'].upper()}={row['hits']}"
    )

report_lines.extend([
    f"BACKUP_ROOT={backup_root}",
    f"BUILD_LOG={build_log}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=LOCAL_VISUAL_VERIFY_EDGE_AND_JOURNAL",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9G4 Edge / Journal Layout Correction",
        "",
        "- OK: True",
        "- Edge nested dashboard panel removed: True",
        "- Dashboard main section self-start: True",
        "- Journal fixed 116px column removed: True",
        "- Journal actions full-width horizontal: True",
        "- Journal buttons auto-width: True",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9G4 COMPLETE ===")
print("OK: True")
print("Classification: EDGE_JOURNAL_LAYOUT_CORRECTION_PASSED")
for row in results:
    print(f"{row['name']}: {row['hits']}")
print("Edge nested dashboard panel removed: True")
print("Dashboard main section self-start: True")
print("Journal fixed action column removed: True")
print("Journal actions full-width horizontal: True")
print("Journal buttons auto-width: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_EDGE_AND_JOURNAL")
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
  throw "S10.9G4 Edge/Journal correction blocked"
}
