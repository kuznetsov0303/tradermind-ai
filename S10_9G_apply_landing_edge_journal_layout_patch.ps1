param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9g_layout_patch_$stamp.py"

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

landing = project / "components" / "Landing.tsx"
edge = project / "components" / "dashboard" / "PersonalEdgeTab.tsx"
dashboard = project / "app" / "dashboard" / "page.tsx"
targets = [landing, edge, dashboard]

for path in targets + [project / "package.json"]:
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9G_landing_edge_journal_layout_backup_{stamp}"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

for source in targets:
    backup = backup_root / source.relative_to(project)
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, backup)

def restore() -> None:
    for source in targets:
        backup = backup_root / source.relative_to(project)
        if backup.is_file():
            shutil.copy2(backup, source)

def replace_required(text: str, old: str, new: str, name: str):
    hits = text.count(old)
    if hits == 0:
        restore()
        raise SystemExit(f"Required layout anchor missing: {name}")
    return text.replace(old, new), hits

landing_text = landing.read_text(encoding="utf-8-sig")
edge_text = edge.read_text(encoding="utf-8-sig")
dashboard_text = dashboard.read_text(encoding="utf-8-sig")
results = []

def apply(text: str, old: str, new: str, name: str):
    updated, hits = replace_required(text, old, new, name)
    results.append({"name": name, "hits": hits})
    return updated

# LANDING: widen Home only, preserve max-w-6xl on other public pages.
landing_text = apply(
    landing_text,
    '<main className="relative z-10 mx-auto max-w-6xl px-4 py-12 md:px-8">',
    '<main className={`relative z-10 mx-auto w-full py-12 ${active === "home" ? "max-w-[1760px] px-0" : "max-w-6xl px-4 md:px-8"}`}>',
    "landing_home_outer_width",
)

landing_text = apply(
    landing_text,
    'className="relative grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center"',
    'className="relative grid min-w-0 gap-10 xl:grid-cols-[1.05fr_0.95fr] xl:items-center 2xl:grid-cols-[1.08fr_0.92fr]"',
    "landing_hero_columns",
)

landing_text = apply(
    landing_text,
    '          <div>\n            <div className="inline-flex rounded-full',
    '          <div className="min-w-0">\n            <div className="inline-flex max-w-full rounded-full',
    "landing_left_column",
)

landing_text = apply(
    landing_text,
    'className="mt-7 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.065em] text-white md:text-6xl xl:text-8xl"',
    'className="mt-7 max-w-5xl break-words text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white md:text-6xl xl:text-7xl 2xl:text-8xl"',
    "landing_title_wrap",
)

for old, new, name in [
    (
        'className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.07]"',
        'className="min-w-0 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.07]"',
        "landing_trust_card",
    ),
    (
        '<div className="text-sm font-black text-white">{item[0]}</div>',
        '<div className="break-words text-sm font-black leading-6 text-white">{item[0]}</div>',
        "landing_trust_title",
    ),
    (
        '<p className="mt-2 text-xs font-semibold leading-5 text-white/48">',
        '<p className="mt-2 break-words text-xs font-semibold leading-5 text-white/48">',
        "landing_trust_text",
    ),
    (
        'className="group rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 text-left shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.075]"',
        'className="group min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 text-left shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.075]"',
        "landing_feature_card",
    ),
    (
        '<div className="mt-5 text-lg font-black text-white">{feature[0]}</div>',
        '<div className="mt-5 break-words text-lg font-black leading-7 text-white">{feature[0]}</div>',
        "landing_feature_title",
    ),
    (
        '<p className="mt-3 text-sm font-semibold leading-7 text-white/56">',
        '<p className="mt-3 break-words text-sm font-semibold leading-7 text-white/56">',
        "landing_feature_text",
    ),
]:
    landing_text = apply(landing_text, old, new, name)

# EDGE: stop shorter grid cards from stretching to the taller neighbor.
edge_text = apply(
    edge_text,
    '<section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">',
    '<section className="grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]">',
    "edge_primary_grid_items_start",
)
edge_text = apply(
    edge_text,
    '<section className="grid gap-5 xl:grid-cols-2">',
    '<section className="grid items-start gap-5 xl:grid-cols-2">',
    "edge_secondary_grid_items_start",
)

# JOURNAL CARD: replace vertical action rail with horizontal wrapping row.
dashboard_text = apply(
    dashboard_text,
    '<div className="flex w-full flex-col items-stretch gap-2 md:items-end">',
    '<div className="flex w-full flex-row flex-wrap items-center gap-2 md:w-auto md:max-w-[620px] md:justify-end">',
    "journal_card_actions_horizontal",
)
dashboard_text = apply(
    dashboard_text,
    '<div className="mb-1 text-right md:w-[112px]">',
    '<div className="mb-1 min-w-[96px] text-right">',
    "journal_pnl_auto_width",
)

# Remove fixed 112px widths only where they exist in the Journal action rail.
for old, new, name in [
    (' disabled:opacity-35 md:w-[112px]"', ' disabled:opacity-35"', "journal_analyze_auto"),
    (' hover:bg-[#00C076]/15 md:w-[112px]"', ' hover:bg-[#00C076]/15"', "journal_chart_auto"),
    (' hover:bg-white/10 hover:text-white md:w-[112px]"', ' hover:bg-white/10 hover:text-white"', "journal_edit_auto"),
    (' hover:bg-red-400/15 md:w-[112px]"', ' hover:bg-red-400/15"', "journal_delete_auto"),
    ('<div className="text-center text-xs text-white/35 md:w-[112px]">', '<div className="w-full text-right text-xs text-white/35">', "journal_screenshot_row"),
]:
    hits = dashboard_text.count(old)
    if hits:
        dashboard_text = dashboard_text.replace(old, new)
    results.append({"name": name, "hits": hits})

# JOURNAL TABLE: wrap the three buttons in a horizontal flex container.
cell_pattern = re.compile(
    r'(<td className="py-4 pr-4 text-right">\s*)'
    r'(<button\s+type="button"\s+onClick=\{\(\) => onOpenTradeChart\(trade\)\}.*?'
    r'\{t\.journal\.deleteTradeButton\}\s*</button>)'
    r'(\s*</td>)',
    re.DOTALL,
)

match = cell_pattern.search(dashboard_text)
if not match:
    restore()
    raise SystemExit("Required layout anchor missing: journal_table_action_cell")

buttons = match.group(2)
buttons = buttons.replace('className="mr-2 ', 'className="')
buttons = re.sub(r'\n\s*<button', '\n                      <button', buttons)
buttons = re.sub(r'\n\s*</button>', '\n                      </button>', buttons)

replacement = (
    '<td className="py-4 pr-4">\n'
    '                    <div className="flex min-w-max flex-row flex-wrap items-center justify-end gap-2">\n'
    '                      ' + buttons.strip() + '\n'
    '                    </div>\n'
    '                  </td>'
)

dashboard_text = (
    dashboard_text[:match.start()] + replacement + dashboard_text[match.end():]
)
results.append({"name": "journal_table_actions_horizontal", "hits": 1})

# Safety checks.
checks = [
    ('active === "home" ? "max-w-[1760px] px-0"', landing_text, "Landing wide shell"),
    ('xl:grid-cols-[1.05fr_0.95fr]', landing_text, "Landing balanced hero"),
    ('grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]', edge_text, "Edge primary anti-stretch"),
    ('grid items-start gap-5 xl:grid-cols-2', edge_text, "Edge secondary anti-stretch"),
    ('flex w-full flex-row flex-wrap items-center gap-2', dashboard_text, "Journal card horizontal actions"),
    ('flex min-w-max flex-row flex-wrap items-center justify-end gap-2', dashboard_text, "Journal table horizontal actions"),
]
for token, content, label in checks:
    if token not in content:
        restore()
        raise SystemExit(f"Safety check failed: {label}")

landing.write_text(landing_text, encoding="utf-8")
edge.write_text(edge_text, encoding="utf-8")
dashboard.write_text(dashboard_text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9G_LAYOUT_PATCH_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; all layout files restored. See: {build_log}")

result = {
    "ok": True,
    "classification": "LANDING_EDGE_JOURNAL_LAYOUT_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "filesChanged": [
        "components/Landing.tsx",
        "components/dashboard/PersonalEdgeTab.tsx",
        "app/dashboard/page.tsx",
    ],
    "backupRoot": str(backup_root),
    "replacementResults": results,
    "landingHomeWideShell": True,
    "landingResponsiveHero": True,
    "landingTextOverflowProtection": True,
    "edgeGridStretchRemoved": True,
    "journalCardActionsHorizontal": True,
    "journalTableActionsHorizontal": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_LANDING_EDGE_JOURNAL",
}

raw = audit / f"S10_9G_LAYOUT_PATCH_raw_{stamp}.json"
report = audit / f"S10_9G_LAYOUT_PATCH_report_{stamp}.txt"
milestone = milestones / f"S10_9G_LAYOUT_PATCH_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9G LANDING / EDGE / JOURNAL LAYOUT PATCH",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=LANDING_EDGE_JOURNAL_LAYOUT_PATCH_PASSED",
    "LANDING_HOME_WIDE_SHELL=True",
    "LANDING_RESPONSIVE_HERO=True",
    "LANDING_TEXT_OVERFLOW_PROTECTION=True",
    "EDGE_GRID_STRETCH_REMOVED=True",
    "JOURNAL_CARD_ACTIONS_HORIZONTAL=True",
    "JOURNAL_TABLE_ACTIONS_HORIZONTAL=True",
    "BUILD_PASSED=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
]
for row in results:
    report_lines.append(f"REPLACEMENT_{row['name'].upper()}={row['hits']}")
report_lines.extend([
    f"BACKUP_ROOT={backup_root}",
    f"BUILD_LOG={build_log}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=LOCAL_VISUAL_VERIFY_LANDING_EDGE_JOURNAL",
])
report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9G Landing / Edge / Journal Layout Patch",
        "",
        "- OK: True",
        "- Landing Home wide shell: True",
        "- Landing responsive hero: True",
        "- Landing text overflow protection: True",
        "- Edge grid stretch removed: True",
        "- Journal card actions horizontal: True",
        "- Journal table actions horizontal: True",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9G COMPLETE ===")
print("OK: True")
print("Classification: LANDING_EDGE_JOURNAL_LAYOUT_PATCH_PASSED")
for row in results:
    print(f"{row['name']}: {row['hits']}")
print("Landing Home wide shell: True")
print("Edge grid stretch removed: True")
print("Journal card actions horizontal: True")
print("Journal table actions horizontal: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_LANDING_EDGE_JOURNAL")
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
  throw "S10.9G Landing/Edge/Journal layout patch blocked"
}
