param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9b_source_package_$stamp.py"

$python=@'
from __future__ import annotations

import json
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
audit = project / "audit_exports"
state = project / "PROJECT_STATE"
milestones = state / "milestones"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
package = state / f"S10_9B_frontend_payments_i18n_source_package_{stamp}"
source_root = package / "source"
docs = package / "docs"

source_root.mkdir(parents=True, exist_ok=True)
docs.mkdir(parents=True, exist_ok=True)

exact_files = [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "app/pricing/page.tsx",
    "app/legal/billing/page.tsx",
    "app/api/create-crypto-payment/route.ts",
    "app/api/nowpayments-webhook/route.ts",
    "components/Landing.tsx",
    "components/SupportWidget.tsx",
    "components/dashboard/SignalCockpitTab.tsx",
    "components/dashboard/UnifiedSkillEdgeSignalWidget.tsx",
    "components/dashboard/PersonalEdgeTab.tsx",
    "lib/billing-plans.ts",
    "lib/fondy.ts",
    "lib/i18n/config.ts",
    "lib/i18n/dictionaries.ts",
    "lib/i18n/dictionary-types.ts",
    "lib/i18n/index.ts",
    "lib/trading/signal-text-i18n.ts",
    "lib/security/subscription-access.ts",
    "lib/security/feature-gate.ts",
    "lib/security/ai-route-gate.ts",
]

patterns = [
    "supabase/migrations/**/*.sql",
    "database/**/*.sql",
    "sql/**/*.sql",
    "app/**/billing*.tsx",
    "app/**/pricing*.tsx",
    "components/**/*Payment*.tsx",
    "components/**/*Billing*.tsx",
    "components/**/*Pricing*.tsx",
]

excluded_tokens = (
    "backup",
    "archive",
    ".next",
    "node_modules",
    ".git",
    "audit_exports",
    "PROJECT_STATE",
)

selected = {}

for rel in exact_files:
    path = project / rel
    if path.is_file():
        selected[str(path.relative_to(project))] = path

for pattern in patterns:
    for path in project.glob(pattern):
        if not path.is_file():
            continue
        rel = str(path.relative_to(project))
        lower = rel.lower()
        if any(token.lower() in lower for token in excluded_tokens):
            continue
        if path.stat().st_size > 2 * 1024 * 1024:
            continue
        selected[rel] = path

env_names = []
env_examples = []

for env_path in project.glob(".env*"):
    if not env_path.is_file():
        continue

    lower = env_path.name.lower()

    if any(token in lower for token in ("example","sample","template")):
        env_examples.append(env_path)
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" not in line:
                continue
            key = line.split("=",1)[0].strip()
            if key and key.replace("_","").isalnum():
                env_names.append(key)

for rel, path in sorted(selected.items()):
    target = source_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

for env_path in env_examples:
    target = source_root / env_path.name
    shutil.copy2(env_path, target)

manifest = {
    "ok": True,
    "classification": "WEEKEND_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_BUILT",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "secretValuesIncluded": False,
    "realEnvFilesIncluded": False,
    "filesIncluded": sorted(selected.keys()),
    "fileCount": len(selected),
    "safeEnvVariableNames": sorted(set(env_names)),
    "focus": {
        "payments": [
            "NOWPayments create route",
            "NOWPayments webhook",
            "billing plans",
            "landing checkout UI",
            "subscription access",
            "legacy Fondy residue",
        ],
        "translations": [
            "custom locale config",
            "main dictionaries",
            "dictionary types",
            "signal text i18n",
            "active landing and dashboard UI",
        ],
        "frontend": [
            "active Landing only",
            "pricing",
            "support",
            "signals cockpit",
            "unified signal widget",
            "personal edge",
        ],
    },
    "nextAction": "UPLOAD_SOURCE_ZIP_FOR_EXACT_PATCH_PLAN",
}

manifest_path = package / "manifest.json"
manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

readme = docs / "README.md"
readme.write_text(
    "\n".join([
        "# S10.9B Frontend / Payments / I18N Source Package",
        "",
        f"- Files included: {len(selected)}",
        "- Real .env files included: False",
        "- Secret values included: False",
        "- Production mutation: False",
        "- VPS touched: False",
        "",
        "This package contains only active source files needed for:",
        "- NOWPayments payment flow review",
        "- subscription activation review",
        "- EN/RU/UA dictionary parity",
        "- frontend typography and layout fixes",
        "",
        "Backup Landing files are intentionally excluded.",
    ]) + "\n",
    encoding="utf-8",
)

zip_path = audit / f"S10_9B_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_{stamp}.zip"

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in package.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(package))

raw = audit / f"S10_9B_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_raw_{stamp}.json"
report = audit / f"S10_9B_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_report_{stamp}.txt"
milestone = milestones / f"S10_9B_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_{stamp}.md"

raw.write_text(
    json.dumps(
        {
            **manifest,
            "packageRoot": str(package),
            "zipPath": str(zip_path),
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)

report.write_text(
    "\n".join([
        "S10.9B FRONTEND / PAYMENTS / I18N SOURCE PACKAGE",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=WEEKEND_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_BUILT",
        f"FILES_INCLUDED={len(selected)}",
        "SECRET_VALUES_INCLUDED=False",
        "REAL_ENV_FILES_INCLUDED=False",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"ZIP={zip_path}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=UPLOAD_SOURCE_ZIP_FOR_EXACT_PATCH_PLAN",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9B Source Package",
        "",
        "- OK: True",
        "- Classification: WEEKEND_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_BUILT",
        f"- Files included: {len(selected)}",
        "- Secret values included: False",
        "- Real env files included: False",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- ZIP: {zip_path}",
        "- Next action: UPLOAD_SOURCE_ZIP_FOR_EXACT_PATCH_PLAN",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9B COMPLETE ===")
print("OK: True")
print("Classification: WEEKEND_FRONTEND_PAYMENTS_I18N_SOURCE_PACKAGE_BUILT")
print(f"Files included: {len(selected)}")
print("Secret values included: False")
print("Real env files included: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"ZIP: {zip_path}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: UPLOAD_SOURCE_ZIP_FOR_EXACT_PATCH_PLAN")
'@

[IO.File]::WriteAllText(
  $runner,
  $python,
  [Text.UTF8Encoding]::new($false)
)

$pythonExe=$null

try{
  & py -3 --version *> $null
  if($LASTEXITCODE -eq 0){
    $pythonExe="py"
  }
}catch{}

if($pythonExe -eq "py"){
  & py -3 $runner $ProjectRoot
}else{
  $candidates=@(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
  )

  $resolved=$null

  foreach($candidate in $candidates){
    if(Test-Path -LiteralPath $candidate){
      $resolved=$candidate
      break
    }
  }

  if(-not $resolved){
    throw "Usable Python not found"
  }

  & $resolved $runner $ProjectRoot
}

$exitCode=$LASTEXITCODE

Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9B source package blocked"
}
