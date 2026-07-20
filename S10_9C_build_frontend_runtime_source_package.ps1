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
$runner=Join-Path $env:TEMP "s10_9c_runtime_package_$stamp.py"

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
package = state / f"S10_9C_frontend_runtime_source_package_{stamp}"
source_root = package / "source"
docs = package / "docs"

source_root.mkdir(parents=True, exist_ok=True)
docs.mkdir(parents=True, exist_ok=True)

exact_files = [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "app/dashboard/layout.tsx",
    "app/dashboard/page.tsx",
    "app/pricing/page.tsx",
    "app/legal/billing/page.tsx",
    "app/api/create-crypto-payment/route.ts",
    "app/api/nowpayments-webhook/route.ts",
    "components/Landing.tsx",
    "components/SupportWidget.tsx",
    "components/GlobalAlertsWidget.tsx",
    "components/marketing/BrandMark.tsx",
    "components/marketing/SiteFooter.tsx",
    "components/marketing/CookieConsent.tsx",
    "components/marketing/LegalFooter.tsx",
    "components/dashboard/PersonalEdgeTab.tsx",
    "components/dashboard/SignalCockpitTab.tsx",
    "components/dashboard/UnifiedSkillEdgeSignalWidget.tsx",
    "components/dashboard/TelegramSignalsConnectButton.tsx",
    "lib/billing-plans.ts",
    "lib/plan-limits.ts",
    "lib/site.ts",
    "lib/i18n/config.ts",
    "lib/i18n/dictionaries.ts",
    "lib/i18n/dictionary-types.ts",
    "lib/i18n/index.ts",
    "lib/trading/signal-text-i18n.ts",
    "lib/security/subscription-access.ts",
    "lib/security/feature-gate.ts",
    "lib/security/ai-route-gate.ts",
    "lib/security/client-auth-fetch.ts",
    "lib/security/server-auth.ts",
]

glob_patterns = [
    "components/dashboard/**/*.tsx",
    "components/dashboard/**/*.ts",
    "app/dashboard/**/*.tsx",
    "app/dashboard/**/*.ts",
    "components/marketing/**/*.tsx",
    "components/marketing/**/*.ts",
    "lib/i18n/**/*.ts",
    "lib/security/**/*.ts",
    "supabase/migrations/**/*.sql",
]

excluded_parts = {
    "node_modules",
    ".next",
    ".git",
    ".vercel",
    "audit_exports",
    "PROJECT_STATE",
    "backups",
    "archives",
}

def is_excluded(path: Path) -> bool:
    lower_parts = {part.lower() for part in path.parts}
    if any(part.lower() in lower_parts for part in excluded_parts):
        return True

    lower_name = path.name.lower()
    return "backup" in lower_name or "archive" in lower_name

selected: dict[str, Path] = {}

for rel in exact_files:
    path = project / rel
    if path.is_file() and not is_excluded(path):
        selected[str(path.relative_to(project))] = path

for pattern in glob_patterns:
    for path in project.glob(pattern):
        if not path.is_file():
            continue
        if is_excluded(path):
            continue
        if path.stat().st_size > 3 * 1024 * 1024:
            continue
        selected[str(path.relative_to(project))] = path

# Discover active Journal-related files by filename and source references.
for base in (project / "components", project / "app"):
    if not base.exists():
        continue

    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if is_excluded(path):
            continue
        if path.suffix.lower() not in {".ts", ".tsx"}:
            continue
        if path.stat().st_size > 3 * 1024 * 1024:
            continue

        name = path.name.lower()

        if any(token in name for token in (
            "journal",
            "trade",
            "dashboard",
            "language",
            "locale",
            "navigation",
            "header",
            "sidebar",
        )):
            selected[str(path.relative_to(project))] = path

env_names = []
for env_path in project.glob(".env*"):
    if not env_path.is_file():
        continue

    lower = env_path.name.lower()

    if not any(token in lower for token in ("example", "sample", "template")):
        continue

    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "=" not in line:
            continue
        key = line.split("=", 1)[0].strip()
        if key and key.replace("_", "").isalnum():
            env_names.append(key)

for rel, path in sorted(selected.items()):
    target = source_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

required_runtime = {
    "dashboardPage": "app/dashboard/page.tsx",
    "dashboardLayout": "app/dashboard/layout.tsx",
    "globalStyles": "app/globals.css",
    "landing": "components/Landing.tsx",
    "signalCockpit": "components/dashboard/SignalCockpitTab.tsx",
    "personalEdge": "components/dashboard/PersonalEdgeTab.tsx",
}

presence = {
    key: (project / rel).is_file()
    for key, rel in required_runtime.items()
}

journal_candidates = sorted(
    rel for rel in selected
    if "journal" in rel.lower() or "trade" in Path(rel).name.lower()
)

manifest = {
    "ok": all(presence.values()) and bool(journal_candidates),
    "classification": (
        "WEEKEND_FRONTEND_RUNTIME_SOURCE_PACKAGE_BUILT"
        if all(presence.values()) and journal_candidates
        else "WEEKEND_FRONTEND_RUNTIME_SOURCE_PACKAGE_INCOMPLETE"
    ),
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "secretValuesIncluded": False,
    "realEnvFilesIncluded": False,
    "fileCount": len(selected),
    "filesIncluded": sorted(selected),
    "requiredRuntimePresence": presence,
    "journalCandidates": journal_candidates,
    "safeEnvVariableNames": sorted(set(env_names)),
    "nextAction": (
        "UPLOAD_RUNTIME_ZIP_FOR_UNIFIED_FRONTEND_PATCH"
        if all(presence.values()) and journal_candidates
        else "REVIEW_MISSING_RUNTIME_FILES"
    ),
}

manifest_path = package / "manifest.json"
manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

(docs / "README.md").write_text(
    "\n".join([
        "# S10.9C Frontend Runtime Source Package",
        "",
        f"- Files included: {len(selected)}",
        f"- Journal candidates: {len(journal_candidates)}",
        "- Real env files included: False",
        "- Secret values included: False",
        "- Production mutation: False",
        "- VPS touched: False",
        "",
        "Purpose:",
        "- unify landing and dashboard locales",
        "- fix encoding and mojibake root cause",
        "- add dashboard back-to-site navigation",
        "- fix Edge empty space",
        "- fix Journal action layout",
        "- add Signals back navigation",
        "- remove Holly references",
        "- fix responsive typography and overflow",
    ]) + "\n",
    encoding="utf-8",
)

zip_path = audit / f"S10_9C_FRONTEND_RUNTIME_SOURCE_PACKAGE_{stamp}.zip"

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in package.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(package))

raw = audit / f"S10_9C_FRONTEND_RUNTIME_SOURCE_PACKAGE_raw_{stamp}.json"
report = audit / f"S10_9C_FRONTEND_RUNTIME_SOURCE_PACKAGE_report_{stamp}.txt"
milestone = milestones / f"S10_9C_FRONTEND_RUNTIME_SOURCE_PACKAGE_{stamp}.md"

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
        "S10.9C FRONTEND RUNTIME SOURCE PACKAGE",
        f"Generated={stamp}",
        f"OK={manifest['ok']}",
        f"CLASSIFICATION={manifest['classification']}",
        f"FILES_INCLUDED={len(selected)}",
        f"JOURNAL_CANDIDATES={len(journal_candidates)}",
        "SECRET_VALUES_INCLUDED=False",
        "REAL_ENV_FILES_INCLUDED=False",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"ZIP={zip_path}",
        f"RAW_JSON={raw}",
        f"NEXT_ACTION={manifest['nextAction']}",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9C Frontend Runtime Source Package",
        "",
        f"- OK: {manifest['ok']}",
        f"- Classification: {manifest['classification']}",
        f"- Files included: {len(selected)}",
        f"- Journal candidates: {len(journal_candidates)}",
        "- Secret values included: False",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Next action: {manifest['nextAction']}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9C COMPLETE ===")
print(f"OK: {manifest['ok']}")
print(f"Classification: {manifest['classification']}")
print(f"Files included: {len(selected)}")
print(f"Journal candidates: {len(journal_candidates)}")
print(f"Required runtime presence: {presence}")
print("Secret values included: False")
print("Real env files included: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"ZIP: {zip_path}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print(f"Next action: {manifest['nextAction']}")

sys.exit(0 if manifest["ok"] else 1)
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
  if($LASTEXITCODE -eq 0){
    $pythonMode="py"
  }
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

if(-not $pythonMode){
  throw "Usable Python not found"
}

if($pythonMode -eq "py"){
  & py -3 $runner $ProjectRoot
}else{
  & $pythonPath $runner $ProjectRoot
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9C runtime package incomplete"
}
