param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9h_payment_runtime_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

candidate_paths = [
    project / "lib" / "billing-plans.ts",
    project / "app" / "api" / "create-crypto-payment" / "route.ts",
    project / "app" / "api" / "nowpayments-webhook" / "route.ts",
    project / "app" / "pricing" / "page.tsx",
    project / "app" / "legal" / "billing" / "page.tsx",
    project / "components" / "Landing.tsx",
    project / "package.json",
]

missing = [str(path) for path in candidate_paths if not path.is_file()]

if missing:
    raise SystemExit("Required billing files missing:\n" + "\n".join(missing))

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

safe_env_names = []
env_example = project / ".env.example"

if env_example.is_file():
    for line in env_example.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        safe_env_names.append(stripped.split("=", 1)[0].strip())

search_terms = [
    "NOWPAYMENTS",
    "create-crypto-payment",
    "nowpayments-webhook",
    "PaymentMethodId",
    "fondy",
    "stripe",
    "crypto",
    "monthly",
    "sixMonth",
    "yearly",
    "249",
    "399",
    "499",
    "799",
    "749",
    "1249",
    "subscription",
    "activate",
    "plan",
    "period",
    "payment_status",
    "price_amount",
    "pay_currency",
    "order_id",
    "invoice",
]

def collect_contexts(path: Path, radius: int = 5, limit: int = 160):
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    contexts = []
    seen = set()

    for index, line in enumerate(lines):
        lowered = line.lower()
        matched = [term for term in search_terms if term.lower() in lowered]

        if not matched:
            continue

        start = max(0, index - radius)
        end = min(len(lines), index + radius + 1)
        key = (start, end)

        if key in seen:
            continue

        seen.add(key)
        contexts.append({
            "line": index + 1,
            "matchedTerms": matched,
            "context": [
                f"{line_number + 1}: {lines[line_number]}"
                for line_number in range(start, end)
            ],
        })

        if len(contexts) >= limit:
            break

    return contexts

file_contexts = {
    str(path.relative_to(project)): collect_contexts(path)
    for path in candidate_paths
}

# Discover current migrations and billing/payment-related routes without reading
# secret values or real environment files.
discovered_files = []

for base in (project / "app", project / "lib", project / "supabase", project / "migrations"):
    if not base.exists():
        continue

    for path in base.rglob("*"):
        if not path.is_file():
            continue

        rel = str(path.relative_to(project)).replace("\\", "/")
        lowered = rel.lower()

        if any(token in lowered for token in (
            "payment",
            "billing",
            "subscription",
            "plan",
            "nowpayment",
            "invoice",
            "webhook",
        )):
            discovered_files.append(rel)

discovered_files = sorted(set(discovered_files))

# Search for hardcoded canonical prices in the selected sources.
price_pattern = re.compile(r"(?<![\w.])(?:49|99|149|249|399|499|749|799|1249)(?![\w.])")
price_hits = {}

for path in candidate_paths:
    text = path.read_text(encoding="utf-8-sig")
    hits = []

    for line_number, line in enumerate(text.splitlines(), start=1):
        values = price_pattern.findall(line)
        if values:
            hits.append({
                "line": line_number,
                "values": values,
                "preview": line.strip()[:260],
            })

    price_hits[str(path.relative_to(project))] = hits

result = {
    "ok": True,
    "classification": "PAYMENT_RUNTIME_AND_PRICE_SOURCE_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "realEnvRead": False,
    "secretValuesIncluded": False,
    "safeEnvNames": safe_env_names,
    "filesInspected": [
        str(path.relative_to(project))
        for path in candidate_paths
    ],
    "discoveredBillingFiles": discovered_files,
    "priceHits": price_hits,
    "contexts": file_contexts,
    "nextAction": "RECONCILE_CANONICAL_PRICES_AND_DESIGN_NOWPAYMENTS_FIAT_ONRAMP_FLOW",
}

raw = audit / f"S10_9H_PAYMENT_RUNTIME_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9H_PAYMENT_RUNTIME_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9H_PAYMENT_RUNTIME_AUDIT_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9H PAYMENT RUNTIME / PRICE SOURCE AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=PAYMENT_RUNTIME_AND_PRICE_SOURCE_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    "REAL_ENV_READ=False",
    "SECRET_VALUES_INCLUDED=False",
    "",
    "=== SAFE ENV VARIABLE NAMES ===",
    *safe_env_names,
    "",
    "=== DISCOVERED BILLING FILES ===",
    *discovered_files,
    "",
    "=== HARDCODED PRICE HITS ===",
]

for rel, hits in price_hits.items():
    report_lines.append("")
    report_lines.append(f"-- {rel} --")

    for hit in hits:
        report_lines.append(
            f"line {hit['line']} | values={','.join(hit['values'])} | {hit['preview']}"
        )

report_lines.append("")
report_lines.append("=== PAYMENT SOURCE CONTEXTS ===")

for rel, contexts in file_contexts.items():
    report_lines.append("")
    report_lines.append(f"## {rel}")

    for item in contexts:
        report_lines.append("")
        report_lines.append(
            f"-- line {item['line']} | terms={','.join(item['matchedTerms'])} --"
        )
        report_lines.extend(item["context"])

report_lines.extend([
    "",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=RECONCILE_CANONICAL_PRICES_AND_DESIGN_NOWPAYMENTS_FIAT_ONRAMP_FLOW",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9H Payment Runtime Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Real environment read: False",
        "- Secret values included: False",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Files inspected: {len(candidate_paths)}",
        f"- Billing files discovered: {len(discovered_files)}",
        "- Next: canonical price reconciliation and fiat on-ramp design",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9H COMPLETE ===")
print("OK: True")
print("Classification: PAYMENT_RUNTIME_AND_PRICE_SOURCE_AUDIT_COMPLETE")
print(f"Files inspected: {len(candidate_paths)}")
print(f"Billing files discovered: {len(discovered_files)}")
print("Inspection only: True")
print("Real env read: False")
print("Secret values included: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: RECONCILE_CANONICAL_PRICES_AND_DESIGN_NOWPAYMENTS_FIAT_ONRAMP_FLOW")
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
  throw "S10.9H payment runtime audit blocked"
}
