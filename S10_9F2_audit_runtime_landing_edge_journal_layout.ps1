param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9f2_runtime_layout_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

landing = project / "components" / "Landing.tsx"
edge = project / "components" / "dashboard" / "PersonalEdgeTab.tsx"
dashboard = project / "app" / "dashboard" / "page.tsx"

for path in (landing, edge, dashboard):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8-sig").splitlines()

def line_slice(lines: list[str], start: int, end: int) -> list[str]:
    start = max(1, start)
    end = min(len(lines), end)
    return [f"{i}: {lines[i-1]}" for i in range(start, end + 1)]

landing_lines = read_lines(landing)
edge_lines = read_lines(edge)
dashboard_lines = read_lines(dashboard)

# Exact runtime slices based on the previous audit.
landing_runtime = {
    "homeHero": line_slice(landing_lines, 2238, 2452),
    "outerShell": line_slice(landing_lines, 1180, 1332),
}

edge_runtime = {
    "mainRuntime": line_slice(edge_lines, 300, min(len(edge_lines), 700)),
}

# Find the actual Journal tab runtime, then collect focused contexts around
# trade cards and action buttons.
journal_markers = [
    "journal",
    "trade card",
    "ticker",
    "edit",
    "delete",
    "remove",
    "details",
    "open",
    "review",
    "onEdit",
    "onDelete",
    "selectedTrade",
    "journalTrades",
]

journal_contexts = []
seen = set()

for index, line in enumerate(dashboard_lines):
    lowered = line.lower()
    matched = [marker for marker in journal_markers if marker.lower() in lowered]

    if not matched:
        continue

    # Ignore dictionary-heavy areas and focus on runtime JSX/functions.
    if index + 1 < 2500:
        continue

    start = max(0, index - 7)
    end = min(len(dashboard_lines), index + 12)
    key = (start, end)

    if key in seen:
        continue

    seen.add(key)
    journal_contexts.append({
        "line": index + 1,
        "matched": matched,
        "context": [
            f"{line_no + 1}: {dashboard_lines[line_no]}"
            for line_no in range(start, end)
        ],
    })

    if len(journal_contexts) >= 80:
        break

# Additional structural scan for flex/grid wrappers that contain multiple
# button elements near Journal runtime.
button_cluster_contexts = []
for index, line in enumerate(dashboard_lines):
    if index + 1 < 2500:
        continue

    if "className=" not in line:
        continue

    window = "\n".join(dashboard_lines[index:index + 45])

    if window.count("<button") < 2:
        continue

    if not any(token in window.lower() for token in ("journal", "trade", "ticker")):
        continue

    button_cluster_contexts.append({
        "line": index + 1,
        "context": [
            f"{line_no + 1}: {dashboard_lines[line_no]}"
            for line_no in range(index, min(len(dashboard_lines), index + 45))
        ],
    })

    if len(button_cluster_contexts) >= 20:
        break

result = {
    "ok": True,
    "classification": "RUNTIME_LAYOUT_CONTEXT_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "files": {
        "landing": str(landing.relative_to(project)),
        "edge": str(edge.relative_to(project)),
        "dashboard": str(dashboard.relative_to(project)),
    },
    "landingRuntime": landing_runtime,
    "edgeRuntime": edge_runtime,
    "journalContexts": journal_contexts,
    "journalButtonClusters": button_cluster_contexts,
    "counts": {
        "landingHomeHeroLines": len(landing_runtime["homeHero"]),
        "landingOuterShellLines": len(landing_runtime["outerShell"]),
        "edgeRuntimeLines": len(edge_runtime["mainRuntime"]),
        "journalContexts": len(journal_contexts),
        "journalButtonClusters": len(button_cluster_contexts),
    },
    "nextAction": "BUILD_EXACT_LANDING_EDGE_JOURNAL_LAYOUT_PATCH",
}

raw = audit / f"S10_9F2_RUNTIME_LAYOUT_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9F2_RUNTIME_LAYOUT_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9F2_RUNTIME_LAYOUT_AUDIT_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9F2 RUNTIME LAYOUT CONTEXT AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=RUNTIME_LAYOUT_CONTEXT_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    "",
    "=== LANDING OUTER SHELL ===",
    *landing_runtime["outerShell"],
    "",
    "=== LANDING HOME HERO ===",
    *landing_runtime["homeHero"],
    "",
    "=== EDGE RUNTIME ===",
    *edge_runtime["mainRuntime"],
    "",
    "=== JOURNAL CONTEXTS ===",
]

for item in journal_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | matched={','.join(item['matched'])} --"
    )
    report_lines.extend(item["context"])

report_lines.append("")
report_lines.append("=== JOURNAL BUTTON CLUSTERS ===")

for item in button_cluster_contexts:
    report_lines.append("")
    report_lines.append(f"-- line {item['line']} --")
    report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_EXACT_LANDING_EDGE_JOURNAL_LAYOUT_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9F2 Runtime Layout Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Journal contexts: {len(journal_contexts)}",
        f"- Journal button clusters: {len(button_cluster_contexts)}",
        "- Next: exact Landing / Edge / Journal layout patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9F2 COMPLETE ===")
print("OK: True")
print("Classification: RUNTIME_LAYOUT_CONTEXT_AUDIT_COMPLETE")
print(f"Landing home hero lines: {len(landing_runtime['homeHero'])}")
print(f"Landing outer shell lines: {len(landing_runtime['outerShell'])}")
print(f"Edge runtime lines: {len(edge_runtime['mainRuntime'])}")
print(f"Journal contexts: {len(journal_contexts)}")
print(f"Journal button clusters: {len(button_cluster_contexts)}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: BUILD_EXACT_LANDING_EDGE_JOURNAL_LAYOUT_PATCH")
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
  throw "S10.9F2 runtime layout audit blocked"
}
