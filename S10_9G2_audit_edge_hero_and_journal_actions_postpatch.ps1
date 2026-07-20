param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9g2_edge_journal_postpatch_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

dashboard = project / "app" / "dashboard" / "page.tsx"
if not dashboard.is_file():
    raise SystemExit(f"Required file missing: {dashboard}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

text = dashboard.read_text(encoding="utf-8-sig")
lines = text.splitlines()

def context_for_offset(offset: int, before: int, after: int):
    line_number = text.count("\n", 0, offset) + 1
    start = max(1, line_number - before)
    end = min(len(lines), line_number + after)
    return {
        "line": line_number,
        "start": start,
        "end": end,
        "context": [
            f"{i}: {lines[i-1]}"
            for i in range(start, end + 1)
        ],
    }

edge_needles = [
    "PERSONAL EDGE ENGINE",
    "Personal Edge Engine",
    "personal edge engine",
    "PERSONALIZATION WARMING UP",
    "Personal Edge.",
    "edge-command-root",
]

journal_needles = [
    "journal_card_actions_horizontal",
    "flex w-full flex-row flex-wrap items-center gap-2",
    "onOpenTradeChart(trade)",
    "onTradeEditStart(trade)",
    "onTradeDelete(trade.id)",
    "t.journal.analyzeTradeButton",
    "t.journal.openChartButton",
    "t.journal.editTradeButton",
    "t.journal.deleteTradeButton",
]

edge_contexts = []
seen = set()
for needle in edge_needles:
    start = 0
    while True:
        offset = text.lower().find(needle.lower(), start)
        if offset == -1:
            break
        item = context_for_offset(offset, 35, 85)
        key = (item["start"], item["end"])
        if key not in seen:
            seen.add(key)
            item["needle"] = needle
            edge_contexts.append(item)
        start = offset + max(1, len(needle))

journal_contexts = []
seen = set()
for needle in journal_needles:
    start = 0
    while True:
        offset = text.find(needle, start)
        if offset == -1:
            break
        item = context_for_offset(offset, 28, 65)
        key = (item["start"], item["end"])
        if key not in seen:
            seen.add(key)
            item["needle"] = needle
            journal_contexts.append(item)
        start = offset + max(1, len(needle))

# Capture parent wrappers around the current Journal action row.
wrapper_matches = []
pattern = re.compile(
    r'<div className="[^"]*flex-row flex-wrap[^"]*">.*?'
    r'onOpenTradeChart\(trade\).*?onTradeDelete\(trade\.id\).*?</div>',
    re.DOTALL,
)
for match in pattern.finditer(text):
    wrapper_matches.append(context_for_offset(match.start(), 45, 95))

result = {
    "ok": True,
    "classification": "EDGE_JOURNAL_POSTPATCH_RUNTIME_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "file": str(dashboard.relative_to(project)),
    "edgeContexts": edge_contexts,
    "journalContexts": journal_contexts,
    "journalWrapperMatches": wrapper_matches,
    "counts": {
        "edgeContexts": len(edge_contexts),
        "journalContexts": len(journal_contexts),
        "journalWrapperMatches": len(wrapper_matches),
    },
    "nextAction": "BUILD_EDGE_HERO_AND_JOURNAL_ACTIONS_CORRECTION_PATCH",
}

raw = audit / f"S10_9G2_EDGE_JOURNAL_POSTPATCH_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9G2_EDGE_JOURNAL_POSTPATCH_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9G2_EDGE_JOURNAL_POSTPATCH_AUDIT_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9G2 EDGE / JOURNAL POST-PATCH RUNTIME AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=EDGE_JOURNAL_POSTPATCH_RUNTIME_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    "",
    "=== EDGE HERO CONTEXTS ===",
]

for item in edge_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | needle={item['needle']} --"
    )
    report_lines.extend(item["context"])

report_lines.append("")
report_lines.append("=== JOURNAL ACTION CONTEXTS ===")

for item in journal_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | needle={item['needle']} --"
    )
    report_lines.extend(item["context"])

report_lines.append("")
report_lines.append("=== JOURNAL WRAPPER MATCHES ===")

for item in wrapper_matches:
    report_lines.append("")
    report_lines.append(f"-- line {item['line']} --")
    report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_EDGE_HERO_AND_JOURNAL_ACTIONS_CORRECTION_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9G2 Edge / Journal Post-Patch Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Edge contexts: {len(edge_contexts)}",
        f"- Journal contexts: {len(journal_contexts)}",
        f"- Journal wrapper matches: {len(wrapper_matches)}",
        "- Next: exact corrective patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9G2 COMPLETE ===")
print("OK: True")
print("Classification: EDGE_JOURNAL_POSTPATCH_RUNTIME_AUDIT_COMPLETE")
print(f"Edge contexts: {len(edge_contexts)}")
print(f"Journal contexts: {len(journal_contexts)}")
print(f"Journal wrapper matches: {len(wrapper_matches)}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: BUILD_EDGE_HERO_AND_JOURNAL_ACTIONS_CORRECTION_PATCH")
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
  throw "S10.9G2 Edge/Journal post-patch audit blocked"
}
