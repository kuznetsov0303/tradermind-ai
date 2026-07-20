param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9e2_signals_literal_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

cockpit = project / "components" / "dashboard" / "SignalCockpitTab.tsx"
dashboard = project / "app" / "dashboard" / "page.tsx"

for path in (cockpit, dashboard):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

tokens = [
    "AI WATCHLIST",
    "Search ticker",
    "Поиск тикера",
    "Select a ticker",
    "Выбери тикер",
    "PRICE",
    "ЦЕНА",
    "SCORE",
    "VOLUME",
    "WATCH",
    "ARMED",
    "ACTIVE",
    "CLOSED",
    "UNKNOWN",
    "HISTORY + LIVE",
    "LIFECYCLE",
    "Confirmations",
    "Подтверждения",
    "Updated",
    "Live 0",
    "Closed 0",
    "0/0",
    "candles",
    "свеч",
    "days",
    "дн.",
    "ALL",
    "ВСЕ",
]

def contexts(path: Path, radius: int = 4):
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    found = []
    seen = set()

    for index, line in enumerate(lines):
        matched = [token for token in tokens if token.lower() in line.lower()]
        if not matched:
            continue

        start = max(0, index - radius)
        end = min(len(lines), index + radius + 1)
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)

        found.append({
            "line": index + 1,
            "matchedTokens": matched,
            "contextStart": start + 1,
            "contextEnd": end,
            "context": [
                f"{line_number + 1}: {lines[line_number]}"
                for line_number in range(start, end)
            ],
        })

    return found

cockpit_contexts = contexts(cockpit, radius=5)
dashboard_contexts = contexts(dashboard, radius=3)

literal_pattern = re.compile(r"""(["\'`])((?:\\.|(?!\1).)*?)\1""")
cockpit_text = cockpit.read_text(encoding="utf-8-sig")
literals = []

for match in literal_pattern.finditer(cockpit_text):
    body = match.group(2)
    matched = [token for token in tokens if token.lower() in body.lower()]
    if matched:
        literals.append({
            "value": body,
            "matchedTokens": matched,
            "offset": match.start(),
        })

result = {
    "ok": True,
    "classification": "SIGNALS_REMAINING_LOCALIZATION_CONTEXT_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "cockpitFile": str(cockpit.relative_to(project)),
    "dashboardFile": str(dashboard.relative_to(project)),
    "tokens": tokens,
    "cockpitContextCount": len(cockpit_contexts),
    "dashboardContextCount": len(dashboard_contexts),
    "matchingLiteralCount": len(literals),
    "cockpitContexts": cockpit_contexts,
    "dashboardContexts": dashboard_contexts,
    "matchingLiterals": literals,
    "nextAction": "BUILD_EXACT_SIGNALS_LOCALIZATION_COMPLETION_PATCH",
}

raw = audit / f"S10_9E2_SIGNALS_REMAINING_LOCALIZATION_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9E2_SIGNALS_REMAINING_LOCALIZATION_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9E2_SIGNALS_REMAINING_LOCALIZATION_AUDIT_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9E2 SIGNALS REMAINING LOCALIZATION CONTEXT AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=SIGNALS_REMAINING_LOCALIZATION_CONTEXT_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"COCKPIT_CONTEXTS={len(cockpit_contexts)}",
    f"DASHBOARD_CONTEXTS={len(dashboard_contexts)}",
    f"MATCHING_LITERALS={len(literals)}",
    "",
    "=== MATCHING STRING LITERALS ===",
]

for item in literals:
    report_lines.append(
        f"TOKENS={','.join(item['matchedTokens'])} | VALUE={item['value']}"
    )

report_lines.append("")
report_lines.append("=== COCKPIT SOURCE CONTEXTS ===")

for item in cockpit_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | tokens={','.join(item['matchedTokens'])} --"
    )
    report_lines.extend(item["context"])

report_lines.append("")
report_lines.append("=== DASHBOARD SOURCE CONTEXTS ===")

for item in dashboard_contexts:
    report_lines.append("")
    report_lines.append(
        f"-- line {item['line']} | tokens={','.join(item['matchedTokens'])} --"
    )
    report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_EXACT_SIGNALS_LOCALIZATION_COMPLETION_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9E2 Signals Remaining Localization Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Cockpit contexts: {len(cockpit_contexts)}",
        f"- Matching literals: {len(literals)}",
        "- Next: exact localization completion patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9E2 COMPLETE ===")
print("OK: True")
print("Classification: SIGNALS_REMAINING_LOCALIZATION_CONTEXT_AUDIT_COMPLETE")
print(f"Cockpit contexts: {len(cockpit_contexts)}")
print(f"Dashboard contexts: {len(dashboard_contexts)}")
print(f"Matching literals: {len(literals)}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: BUILD_EXACT_SIGNALS_LOCALIZATION_COMPLETION_PATCH")
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
  throw "S10.9E2 Signals localization audit blocked"
}
