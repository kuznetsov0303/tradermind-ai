param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9g3_exact_component_extract_$stamp.py"

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

def find_function_block(function_name: str) -> tuple[int, int, str]:
    start_token = f"function {function_name}("
    start = text.find(start_token)

    if start == -1:
        raise SystemExit(f"Function not found: {function_name}")

    next_function = text.find("\nfunction ", start + len(start_token))
    next_async_function = text.find("\nasync function ", start + len(start_token))

    candidates = [
        value for value in (next_function, next_async_function)
        if value != -1
    ]

    end = min(candidates) if candidates else len(text)
    block = text[start:end].rstrip()

    start_line = text.count("\n", 0, start) + 1
    end_line = text.count("\n", 0, end) + 1

    return start_line, end_line, block

edge_start, edge_end, edge_block = find_function_block("PersonalEdgeEnginePanel")

journal_needles = [
    'md:grid-cols-[minmax(0,1fr)_116px]',
    'flex w-full flex-row flex-wrap items-center gap-2',
    'onOpenTradeChart(trade)',
    'onTradeEditStart(trade)',
    'onTradeDelete(trade.id)',
]

journal_contexts = []
seen = set()

for needle in journal_needles:
    search_from = 0

    while True:
        offset = text.find(needle, search_from)

        if offset == -1:
            break

        line_number = text.count("\n", 0, offset) + 1
        start_line = max(1, line_number - 40)
        end_line = min(len(lines), line_number + 100)
        key = (start_line, end_line)

        if key not in seen:
            seen.add(key)
            journal_contexts.append({
                "needle": needle,
                "line": line_number,
                "startLine": start_line,
                "endLine": end_line,
                "context": [
                    f"{i}: {lines[i-1]}"
                    for i in range(start_line, end_line + 1)
                ],
            })

        search_from = offset + len(needle)

result = {
    "ok": True,
    "classification": "EXACT_EDGE_COMPONENT_AND_JOURNAL_CARD_EXTRACT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "file": str(dashboard.relative_to(project)),
    "personalEdgeFunction": {
        "name": "PersonalEdgeEnginePanel",
        "startLine": edge_start,
        "endLine": edge_end,
        "source": edge_block,
    },
    "journalContexts": journal_contexts,
    "journalContextCount": len(journal_contexts),
    "nextAction": "BUILD_EDGE_HERO_AND_JOURNAL_ACTIONS_CORRECTION_PATCH",
}

raw = audit / f"S10_9G3_EXACT_EDGE_JOURNAL_EXTRACT_raw_{stamp}.json"
report = audit / f"S10_9G3_EXACT_EDGE_JOURNAL_EXTRACT_report_{stamp}.txt"
milestone = milestones / f"S10_9G3_EXACT_EDGE_JOURNAL_EXTRACT_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9G3 EXACT EDGE COMPONENT / JOURNAL CARD EXTRACT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=EXACT_EDGE_COMPONENT_AND_JOURNAL_CARD_EXTRACT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"EDGE_FUNCTION_START={edge_start}",
    f"EDGE_FUNCTION_END={edge_end}",
    f"JOURNAL_CONTEXTS={len(journal_contexts)}",
    "",
    "=== PERSONAL EDGE ENGINE PANEL SOURCE ===",
    edge_block,
    "",
    "=== JOURNAL CARD CONTEXTS ===",
]

for item in journal_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | needle={item['needle']} --"
    )
    report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_EDGE_HERO_AND_JOURNAL_ACTIONS_CORRECTION_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9G3 Exact Edge / Journal Extract",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- PersonalEdgeEnginePanel lines: {edge_start}-{edge_end}",
        f"- Journal contexts: {len(journal_contexts)}",
        "- Next: corrective apply patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9G3 COMPLETE ===")
print("OK: True")
print("Classification: EXACT_EDGE_COMPONENT_AND_JOURNAL_CARD_EXTRACT_COMPLETE")
print(f"PersonalEdgeEnginePanel lines: {edge_start}-{edge_end}")
print(f"Journal contexts: {len(journal_contexts)}")
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
  throw "S10.9G3 exact Edge/Journal extract blocked"
}
