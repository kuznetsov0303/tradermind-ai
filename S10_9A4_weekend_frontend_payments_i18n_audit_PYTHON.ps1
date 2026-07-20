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
$runner=Join-Path $env:TEMP "s10_9a4_frontend_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

project = Path(sys.argv[1]).resolve()
audit = project / "audit_exports"
state = project / "PROJECT_STATE"
milestones = state / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

roots = [project / x for x in ("app","components","lib","src","public")]
extensions = {
    ".ts",".tsx",".js",".jsx",".json",".md",".mjs",".cjs",
    ".css",".scss",".html",".sql",".yml",".yaml"
}
excluded = {
    "node_modules",".next",".git",".vercel","audit_exports",
    "PROJECT_STATE","backups","archives"
}

files = []
for root in roots:
    if not root.exists():
        continue
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in extensions:
            continue
        if path.stat().st_size > 2 * 1024 * 1024:
            continue
        if any(part in excluded for part in path.parts):
            continue
        files.append(path)

groups = {
    "payments": [
        r"\bpayment\b", r"\bcheckout\b", r"\bbilling\b",
        r"\bsubscription\b", r"\bcrypto\b", r"\busdt\b",
        r"\bstripe\b", r"\bfondy\b", r"\bcoinbase\b",
        r"\bnowpayments\b", r"\bwebhook\b", r"\btransaction\b",
    ],
    "translations": [
        r"\bi18n\b", r"\blocale\b", r"\btranslations?\b",
        r"\bdictionary\b", r"\bmessages\b", r"\bnext-intl\b",
        r"\breact-i18next\b", r"\blanguage\b",
    ],
    "frontendRisks": [
        r"\bTODO\b", r"\bFIXME\b", r"\bHACK\b",
        r"console\.log", r"font-size\s*:\s*(8|9|10)px",
        r"text-\[(8|9|10)px\]", r"overflow-hidden",
        r"min-w-\[", r"max-w-\[",
    ],
    "authAndPlans": [
        r"\bauth\b", r"\bplan\b", r"\btier\b", r"\bpremium\b",
        r"\bcore\b", r"\bedge\b", r"\belite\b",
        r"\bentitlement\b", r"\baccess\b",
    ],
}

matches = {key: [] for key in groups}

for path in files:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    lines = text.splitlines()
    rel = str(path.relative_to(project))
    for group, patterns in groups.items():
        for pattern in patterns:
            rx = re.compile(pattern, re.I)
            if not rx.search(text):
                continue
            hit_lines = [i + 1 for i, line in enumerate(lines) if rx.search(line)][:20]
            matches[group].append({
                "path": rel,
                "pattern": pattern,
                "lines": hit_lines,
            })

package_json = project / "package.json"
errors = []
warnings = []

dependencies = {}
package_present = package_json.exists()

if package_present:
    try:
        pkg = json.loads(package_json.read_text(encoding="utf-8-sig"))
        for section in ("dependencies","devDependencies"):
            dependencies.update(pkg.get(section, {}) or {})
    except Exception as exc:
        warnings.append(f"PACKAGE_JSON_PARSE_FAILED:{type(exc).__name__}")
else:
    errors.append("PACKAGE_JSON_NOT_FOUND")

payment_dependencies = [
    {"name": name, "version": version}
    for name, version in sorted(dependencies.items())
    if re.search(r"stripe|fondy|coinbase|crypto|payment|checkout|commerce|nowpayments", name, re.I)
]

i18n_dependencies = [
    {"name": name, "version": version}
    for name, version in sorted(dependencies.items())
    if re.search(r"next-intl|i18next|lingui|formatjs|intl", name, re.I)
]

dictionary_files = []
for path in files:
    rel = str(path.relative_to(project))
    name = path.name.lower()
    if (
        re.match(r"^(en|ru|ua|uk)([-_].*)?\.json$", name)
        or re.search(r"translations|messages|locales|dictionaries|i18n", rel, re.I)
    ):
        dictionary_files.append({
            "path": rel,
            "sizeBytes": path.stat().st_size,
        })

route_files = []
for path in files:
    rel = str(path.relative_to(project))
    if re.search(r"(^|[\\/])app[\\/]api[\\/]", rel, re.I) or re.match(r"route\.(ts|js)$", path.name, re.I):
        route_files.append({
            "path": rel,
            "sizeBytes": path.stat().st_size,
        })

translation_inventory = {"en":[],"ru":[],"ua":[],"uk":[],"other":[]}

for item in dictionary_files:
    rel = item["path"]
    name = Path(rel).name.lower()
    bucket = "other"
    for lang in ("en","ru","ua","uk"):
        if re.match(rf"^{lang}([_-]|\.)", name):
            bucket = lang
            break
    translation_inventory[bucket].append(rel)

env_names = []
for env_path in project.glob(".env*"):
    if not env_path.is_file():
        continue
    lower = env_path.name.lower()
    if not any(token in lower for token in ("example","sample","template")):
        warnings.append(f"REAL_ENV_FILE_PRESENT_NOT_READ_{env_path.name}")
        continue
    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if m:
            env_names.append(m.group(1))

if not files:
    errors.append("NO_FRONTEND_SOURCE_FILES_FOUND")

result = {
    "ok": not errors,
    "classification": (
        "WEEKEND_FRONTEND_PAYMENTS_I18N_AUDIT_COMPLETED"
        if not errors else
        "WEEKEND_FRONTEND_PAYMENTS_I18N_AUDIT_BLOCKED"
    ),
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "sourceFilesScanned": len(files),
    "rootsScanned": [str(r.relative_to(project)) for r in roots if r.exists()],
    "packageJsonPresent": package_present,
    "paymentDependencies": payment_dependencies,
    "i18nDependencies": i18n_dependencies,
    "dictionaryFiles": dictionary_files,
    "translationInventory": translation_inventory,
    "apiRouteFiles": route_files,
    "safeEnvVariableNames": sorted(set(env_names)),
    "matches": matches,
    "errors": errors,
    "warnings": sorted(set(warnings)),
    "recommendedOrder": [
        "FRONTEND_BUG_AND_LAYOUT_AUDIT",
        "PAYMENT_DOMAIN_AND_DATABASE_FLOW",
        "PAYMENT_PROVIDER_DECISION_WITH_COST_DISCLOSURE",
        "EN_RU_UA_DICTIONARY_PARITY",
        "PRODUCTION_BUILD_AND_SMOKE_TEST",
    ],
    "nextAction": (
        "UPLOAD_S10_9A_REPORT_AND_RAW_FOR_IMPLEMENTATION_PLAN"
        if not errors else
        "FIX_LOCAL_AUDIT_BLOCKERS"
    ),
}

raw = audit / f"S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9A FRONTEND / PAYMENTS / I18N AUDIT",
    f"Generated={stamp}",
    f"OK={result['ok']}",
    f"CLASSIFICATION={result['classification']}",
    f"SOURCE_FILES_SCANNED={result['sourceFilesScanned']}",
    f"ROOTS_SCANNED={','.join(result['rootsScanned'])}",
    f"PACKAGE_JSON_PRESENT={result['packageJsonPresent']}",
    f"PAYMENT_DEPENDENCIES={len(payment_dependencies)}",
    f"I18N_DEPENDENCIES={len(i18n_dependencies)}",
    f"DICTIONARY_FILES={len(dictionary_files)}",
    f"API_ROUTE_FILES={len(route_files)}",
    f"PAYMENT_MATCHES={len(matches['payments'])}",
    f"TRANSLATION_MATCHES={len(matches['translations'])}",
    f"FRONTEND_RISK_MATCHES={len(matches['frontendRisks'])}",
    f"AUTH_PLAN_MATCHES={len(matches['authAndPlans'])}",
    f"ERRORS={','.join(errors)}",
    f"WARNINGS={','.join(result['warnings'])}",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"NEXT_ACTION={result['nextAction']}",
    f"RAW_JSON={raw}",
]

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9A Frontend / Payments / I18N Audit",
        "",
        f"- OK: {result['ok']}",
        f"- Classification: {result['classification']}",
        f"- Source files scanned: {result['sourceFilesScanned']}",
        f"- Payment dependencies: {len(payment_dependencies)}",
        f"- I18N dependencies: {len(i18n_dependencies)}",
        f"- Dictionary files: {len(dictionary_files)}",
        f"- API routes: {len(route_files)}",
        f"- Payment matches: {len(matches['payments'])}",
        f"- Translation matches: {len(matches['translations'])}",
        f"- Frontend risk matches: {len(matches['frontendRisks'])}",
        f"- Auth/plan matches: {len(matches['authAndPlans'])}",
        f"- Errors: {', '.join(errors)}",
        f"- Warnings: {', '.join(result['warnings'])}",
        f"- Next action: {result['nextAction']}",
        "",
        "Read-only inspection.",
        "No secret values collected.",
        "No VPS connection.",
        "No production mutation.",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9A COMPLETE ===")
print(f"OK: {result['ok']}")
print(f"Classification: {result['classification']}")
print(f"Source files scanned: {result['sourceFilesScanned']}")
print(f"Payment dependencies: {len(payment_dependencies)}")
print(f"I18N dependencies: {len(i18n_dependencies)}")
print(f"Dictionary files: {len(dictionary_files)}")
print(f"API routes: {len(route_files)}")
print(f"Payment matches: {len(matches['payments'])}")
print(f"Translation matches: {len(matches['translations'])}")
print(f"Frontend risk matches: {len(matches['frontendRisks'])}")
print(f"Auth/plan matches: {len(matches['authAndPlans'])}")
print(f"Errors: {', '.join(errors)}")
print(f"Warnings: {', '.join(result['warnings'])}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print(f"Next action: {result['nextAction']}")

sys.exit(0 if result["ok"] else 1)
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
  throw "S10.9A Python audit blocked"
}
