param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9f_layout_context_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

files = {
    "landing": project / "components" / "Landing.tsx",
    "edge": project / "components" / "dashboard" / "PersonalEdgeTab.tsx",
    "dashboard": project / "app" / "dashboard" / "page.tsx",
}

for name, path in files.items():
    if not path.is_file():
        raise SystemExit(f"Required {name} file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

search_groups = {
    "landing": [
        "hero",
        "grid-cols",
        "max-w-",
        "overflow-hidden",
        "min-w-",
        "col-span",
        "right",
        "trust",
        "pricing",
    ],
    "edge": [
        "min-h-",
        "h-full",
        "grid-cols",
        "overflow-hidden",
        "Personal Edge",
        "edge",
        "empty",
        "summary",
    ],
    "dashboard": [
        "journal",
        "ticker",
        "edit",
        "delete",
        "remove",
        "details",
        "button",
        "trade",
        "actions",
    ],
}

def collect_contexts(path: Path, terms: list[str], radius: int = 4, limit: int = 120):
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    results = []
    seen = set()

    for index, line in enumerate(lines):
        lowered = line.lower()
        matched = [term for term in terms if term.lower() in lowered]
        if not matched:
            continue

        start = max(0, index - radius)
        end = min(len(lines), index + radius + 1)
        key = (start, end)

        if key in seen:
            continue

        seen.add(key)
        results.append({
            "line": index + 1,
            "matchedTerms": matched,
            "contextStart": start + 1,
            "contextEnd": end,
            "context": [
                f"{line_number + 1}: {lines[line_number]}"
                for line_number in range(start, end)
            ],
        })

        if len(results) >= limit:
            break

    return results

contexts = {
    name: collect_contexts(files[name], search_groups[name])
    for name in files
}

result = {
    "ok": True,
    "classification": "WEEKEND_LAYOUT_CONTEXT_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "files": {
        name: str(path.relative_to(project))
        for name, path in files.items()
    },
    "contextCounts": {
        name: len(items)
        for name, items in contexts.items()
    },
    "contexts": contexts,
    "nextAction": "BUILD_EXACT_LANDING_EDGE_JOURNAL_LAYOUT_PATCH",
}

raw = audit / f"S10_9F_LAYOUT_CONTEXT_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9F_LAYOUT_CONTEXT_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9F_LAYOUT_CONTEXT_AUDIT_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9F LANDING / EDGE / JOURNAL LAYOUT CONTEXT AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=WEEKEND_LAYOUT_CONTEXT_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
]

for name, items in contexts.items():
    report_lines.append("")
    report_lines.append(f"=== {name.upper()} CONTEXTS ({len(items)}) ===")

    for item in items:
        report_lines.append("")
        report_lines.append(
            f"-- line {item['line']} | terms={','.join(item['matchedTerms'])} --"
        )
        report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_EXACT_LANDING_EDGE_JOURNAL_LAYOUT_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9F Layout Context Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Landing contexts: {len(contexts['landing'])}",
        f"- Edge contexts: {len(contexts['edge'])}",
        f"- Dashboard/Journal contexts: {len(contexts['dashboard'])}",
        "- Next: exact Landing / Edge / Journal layout patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9F COMPLETE ===")
print("OK: True")
print("Classification: WEEKEND_LAYOUT_CONTEXT_AUDIT_COMPLETE")
print(f"Landing contexts: {len(contexts['landing'])}")
print(f"Edge contexts: {len(contexts['edge'])}")
print(f"Dashboard/Journal contexts: {len(contexts['dashboard'])}")
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
  throw "S10.9F layout context audit blocked"
}
