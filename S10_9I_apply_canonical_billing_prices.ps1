param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9i_canonical_billing_$stamp.py"

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

billing = project / "lib" / "billing-plans.ts"
route = project / "app" / "api" / "create-crypto-payment" / "route.ts"
package_json = project / "package.json"

for path in (billing, route, package_json):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9I_canonical_billing_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

targets = [billing, route]

for source in targets:
    backup = backup_root / source.relative_to(project)
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, backup)

def restore() -> None:
    for source in targets:
        backup = backup_root / source.relative_to(project)
        if backup.is_file():
            shutil.copy2(backup, source)

billing_text = billing.read_text(encoding="utf-8-sig")
route_text = route.read_text(encoding="utf-8-sig")
results = []

def replace_required(text: str, old: str, new: str, name: str) -> str:
    hits = text.count(old)
    if hits == 0:
        restore()
        raise SystemExit(f"Required billing anchor missing: {name}")
    results.append({"name": name, "hits": hits})
    return text.replace(old, new)

billing_text = replace_required(
    billing_text,
    'export type BillingPeriod = "monthly" | "yearly";',
    'export type BillingPeriod = "monthly" | "halfyear" | "yearly";',
    "billing_period_halfyear",
)

billing_text = replace_required(
    billing_text,
    '  monthlyPriceUsd: number;\n  yearlyPriceUsd: number;',
    '  monthlyPriceUsd: number;\n  halfyearPriceUsd: number;\n  yearlyPriceUsd: number;',
    "billing_plan_halfyear_field",
)

for old, new, name in [
    (
        '    monthlyPriceUsd: 49,\n    yearlyPriceUsd: 490,\n    yearlySavingsLabel: "Save $98 yearly",',
        '    monthlyPriceUsd: 49,\n    halfyearPriceUsd: 249,\n    yearlyPriceUsd: 399,\n    yearlySavingsLabel: "Save $189 yearly",',
        "core_prices",
    ),
    (
        '    monthlyPriceUsd: 99,\n    yearlyPriceUsd: 990,\n    yearlySavingsLabel: "Save $198 yearly",',
        '    monthlyPriceUsd: 99,\n    halfyearPriceUsd: 499,\n    yearlyPriceUsd: 799,\n    yearlySavingsLabel: "Save $389 yearly",',
        "edge_prices",
    ),
    (
        '    monthlyPriceUsd: 179,\n    yearlyPriceUsd: 1790,\n    yearlySavingsLabel: "Save $358 yearly",',
        '    monthlyPriceUsd: 149,\n    halfyearPriceUsd: 749,\n    yearlyPriceUsd: 1249,\n    yearlySavingsLabel: "Save $539 yearly",',
        "elite_prices",
    ),
]:
    billing_text = replace_required(billing_text, old, new, name)

billing_text = replace_required(
    billing_text,
    '''export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}''',
    '''export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  if (value === "halfyear") return "halfyear";
  if (value === "yearly") return "yearly";
  return "monthly";
}''',
    "normalize_halfyear",
)

billing_text = replace_required(
    billing_text,
    '''  return billingPeriod === "yearly"
    ? plan.yearlyPriceUsd
    : plan.monthlyPriceUsd;''',
    '''  if (billingPeriod === "halfyear") {
    return plan.halfyearPriceUsd;
  }

  return billingPeriod === "yearly"
    ? plan.yearlyPriceUsd
    : plan.monthlyPriceUsd;''',
    "canonical_amount_halfyear",
)

billing_text = replace_required(
    billing_text,
    '''export function getBillingPeriodLabel(period: BillingPeriod): string {
  return period === "yearly" ? "Yearly" : "Monthly";
}''',
    '''export function getBillingPeriodLabel(period: BillingPeriod): string {
  if (period === "halfyear") return "6 months";
  return period === "yearly" ? "Yearly" : "Monthly";
}''',
    "period_label_halfyear",
)

billing_text = replace_required(
    billing_text,
    '''export function getBillingPeriodDays(period: BillingPeriod): number {
  return period === "yearly" ? 365 : 30;
}''',
    '''export function getBillingPeriodDays(period: BillingPeriod): number {
  if (period === "halfyear") return 183;
  return period === "yearly" ? 365 : 30;
}''',
    "period_days_halfyear",
)

route_text = replace_required(
    route_text,
    'import { supabaseAdmin } from "@/lib/supabaseAdmin";',
    '''import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getBillingAmountUsd,
  getBillingPeriodLabel,
  getBillingPlan,
  normalizeBillingPeriod as normalizeCanonicalBillingPeriod,
  type BillingPeriod,
} from "@/lib/billing-plans";''',
    "route_canonical_imports",
)

route_text = replace_required(
    route_text,
    'type BillingPeriod = "monthly" | "halfyear" | "yearly";\n',
    '',
    "route_remove_local_period_type",
)

plans_pattern = re.compile(
    r'const PLANS: Record<.*?> = \{.*?\n\};\n\n'
    r'const PERIOD_LABELS: Record<BillingPeriod, string> = \{.*?\n\};\n',
    re.DOTALL,
)

plans_match = plans_pattern.search(route_text)
if not plans_match:
    restore()
    raise SystemExit("Local crypto price table block not found")

route_text = route_text[:plans_match.start()] + route_text[plans_match.end():]
results.append({"name": "route_remove_local_price_tables", "hits": 1})

local_normalizer = '''function normalizeBillingPeriod(period: unknown): BillingPeriod {
  if (period === "monthly" || period === "halfyear" || period === "yearly") {
    return period;
  }

  return "monthly";
}

'''

if local_normalizer not in route_text:
    restore()
    raise SystemExit("Local route billing-period normalizer not found")

route_text = route_text.replace(local_normalizer, "", 1)
results.append({"name": "route_remove_local_period_normalizer", "hits": 1})

route_text = replace_required(
    route_text,
    '''    const billingPeriod = normalizeBillingPeriod(body?.billingPeriod);

    const plan = PLANS[planId];

    const amount = isDemo ? 11.99 : plan.prices[billingPeriod];''',
    '''    const billingPeriod = normalizeCanonicalBillingPeriod(body?.billingPeriod);

    const plan = getBillingPlan(planId);

    const amount = isDemo
      ? 11.99
      : getBillingAmountUsd(planId, billingPeriod);''',
    "route_use_canonical_amount",
)

route_text = replace_required(
    route_text,
    '`${plan.name} subscription - ${PERIOD_LABELS[billingPeriod]} - USDT TRC20 payment`;',
    '`${plan.publicName} subscription - ${getBillingPeriodLabel(billingPeriod)} - USDT TRC20 payment`;',
    "route_use_canonical_labels",
)

for stale in (
    "yearlyPriceUsd: 490",
    "yearlyPriceUsd: 990",
    "monthlyPriceUsd: 179",
    "yearlyPriceUsd: 1790",
    "const PLANS:",
    "const PERIOD_LABELS:",
):
    if stale in billing_text or stale in route_text:
        restore()
        raise SystemExit(f"Stale billing value/table remains: {stale}")

billing.write_text(billing_text, encoding="utf-8")
route.write_text(route_text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9I_CANONICAL_BILLING_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; billing files restored. See: {build_log}")

result = {
    "ok": True,
    "classification": "CANONICAL_BILLING_PRICES_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "banxaTouched": False,
    "filesChanged": [
        "lib/billing-plans.ts",
        "app/api/create-crypto-payment/route.ts",
    ],
    "canonicalPrices": {
        "core": {"monthly": 49, "halfyear": 249, "yearly": 399},
        "edge": {"monthly": 99, "halfyear": 499, "yearly": 799},
        "elite": {"monthly": 149, "halfyear": 749, "yearly": 1249},
    },
    "cryptoRouteUsesCanonicalCatalog": True,
    "halfyearSupported": True,
    "webhookChanged": False,
    "subscriptionActivationChanged": False,
    "replacementResults": results,
    "backupRoot": str(backup_root),
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "I18N_ARCHITECTURE_UNIFICATION_AUDIT",
}

raw = audit / f"S10_9I_CANONICAL_BILLING_raw_{stamp}.json"
report = audit / f"S10_9I_CANONICAL_BILLING_report_{stamp}.txt"
milestone = milestones / f"S10_9I_CANONICAL_BILLING_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9I CANONICAL BILLING PRICES",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=CANONICAL_BILLING_PRICES_PATCH_PASSED",
    "CORE=49/249/399",
    "EDGE=99/499/799",
    "ELITE=149/749/1249",
    "HALFYEAR_SUPPORTED=True",
    "CRYPTO_ROUTE_USES_CANONICAL_CATALOG=True",
    "WEBHOOK_CHANGED=False",
    "SUBSCRIPTION_ACTIVATION_CHANGED=False",
    "BANXA_TOUCHED=False",
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
    "NEXT_ACTION=I18N_ARCHITECTURE_UNIFICATION_AUDIT",
])
report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9I Canonical Billing Prices",
        "",
        "- OK: True",
        "- Core: 49 / 249 / 399",
        "- Edge: 99 / 499 / 799",
        "- Elite: 149 / 749 / 1249",
        "- Half-year supported: True",
        "- Crypto route uses canonical catalog: True",
        "- Webhook changed: False",
        "- Subscription activation changed: False",
        "- Banxa touched: False",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9I COMPLETE ===")
print("OK: True")
print("Classification: CANONICAL_BILLING_PRICES_PATCH_PASSED")
print("Core: 49 / 249 / 399")
print("Edge: 99 / 499 / 799")
print("Elite: 149 / 749 / 1249")
print("Halfyear supported: True")
print("Crypto route uses canonical catalog: True")
print("Webhook changed: False")
print("Subscription activation changed: False")
print("Banxa touched: False")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: I18N_ARCHITECTURE_UNIFICATION_AUDIT")
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
  throw "S10.9I canonical billing patch blocked"
}
