param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9v_merge_complete_landing_locales_$stamp.py"

$python=@'
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

base_dir = project / "locales" / "landing"
supplemental_dir = project / "PROJECT_STATE" / "i18n_generated" / "landing_missing"
complete_dir = project / "locales" / "landing-complete"
audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9V_complete_landing_backup_{stamp}"

loader_file = project / "lib" / "i18n" / "landing-complete-locales.ts"
index_file = project / "lib" / "i18n" / "index.ts"
resolved_map_file = complete_dir / "path-map.json"
manifest_file = complete_dir / "manifest.json"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

locales = ["en","ru","uk","zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi"]

def read_object(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return value

def read_array(path: Path) -> list:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, list):
        raise SystemExit(f"Expected JSON array: {path}")
    return value

for locale in locales:
    if not (base_dir / f"{locale}.json").is_file():
        raise SystemExit(f"Missing base locale: {locale}")
    if not (supplemental_dir / f"{locale}.json").is_file():
        raise SystemExit(f"Missing supplemental locale: {locale}")

supplemental_path_map_file = supplemental_dir / "path-map.json"
if not supplemental_path_map_file.is_file():
    raise SystemExit(f"Missing supplemental path map: {supplemental_path_map_file}")

leaves_files = sorted(
    audit.glob("S10_9T_LANDING_DICT_AST_AUDIT_leaves_*.json"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
if not leaves_files:
    raise SystemExit("No S10_9T leaves JSON found")
leaves_file = leaves_files[0]

base_dictionaries = {locale: read_object(base_dir / f"{locale}.json") for locale in locales}
supplemental_dictionaries = {locale: read_object(supplemental_dir / f"{locale}.json") for locale in locales}

base_keys = list(base_dictionaries["en"].keys())
base_key_set = set(base_keys)
supplemental_keys = list(supplemental_dictionaries["en"].keys())
supplemental_key_set = set(supplemental_keys)

collisions = base_key_set & supplemental_key_set
if collisions:
    raise SystemExit(f"Key collision: {sorted(collisions)[:20]}")

for locale in locales:
    if set(base_dictionaries[locale]) != base_key_set:
        raise SystemExit(f"Base key parity failed for {locale}")
    if set(supplemental_dictionaries[locale]) != supplemental_key_set:
        raise SystemExit(f"Supplemental key parity failed for {locale}")

    for key, value in base_dictionaries[locale].items():
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f"Invalid base value {locale}:{key}")
    for key, value in supplemental_dictionaries[locale].items():
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f"Invalid supplemental value {locale}:{key}")

supplemental_path_map = read_object(supplemental_path_map_file)
leaves = read_array(leaves_file)

ambiguous_overrides = {
    "dict.en.viewProduct": "landing.viewProduct",
    "dict.en.viewPricing": "landing.viewPricing",
    "dict.en.viewAbout": "landing.viewAbout",
    "dict.en.nav.team": "landing.team",
    "dict.en.pricingPage.checkoutStatus.invoice": "landing.invoice",
    "dict.en.pricingPage.planBadge.core": "landing.core",
    "dict.en.pricingPage.planBadge.elite": "landing.elite",
    "dict.en.pricingPage.plans[2].cta": "landing.cta.3",
    "dict.en.pricingPage.disclaimer": "landing.disclaimer",
    "dict.en.footer.productLinks[3]": "landing.team",
    "dict.en.footer.risk": "landing.risk",
    "dict.en.footer.bottom": "landing.bottom",
    "dict.en.auth.register": "landing.register",
    "dict.en.auth.registerButton": "landing.registerButton",
    "dict.en.auth.creatingInvoice": "landing.creatingInvoice",
}

visible_technical_paths = {
    "dict.en.pricingPage.period.monthly",
    "dict.en.pricingPage.period.halfyear",
    "dict.en.pricingPage.period.yearly",
}

resolved_path_map = {}
unresolved_paths = []
technical_skipped = []

for row in leaves:
    if not isinstance(row, dict):
        continue

    ast_path = str(row.get("path") or "")
    status = str(row.get("mappingStatus") or "")
    technical = bool(row.get("technical"))

    if not ast_path:
        continue

    if status == "exact-unique":
        canonical_key = row.get("canonicalKey")
        if not isinstance(canonical_key, str) or not canonical_key:
            unresolved_paths.append(ast_path)
        else:
            resolved_path_map[ast_path] = canonical_key
        continue

    if status == "exact-ambiguous":
        canonical_key = ambiguous_overrides.get(ast_path)
        if not canonical_key:
            unresolved_paths.append(ast_path)
        else:
            resolved_path_map[ast_path] = canonical_key
        continue

    if ast_path in supplemental_path_map:
        resolved_path_map[ast_path] = supplemental_path_map[ast_path]
        continue

    if technical and ast_path not in visible_technical_paths:
        technical_skipped.append(ast_path)
        continue

    unresolved_paths.append(ast_path)

for ast_path in visible_technical_paths:
    if ast_path not in resolved_path_map:
        key = supplemental_path_map.get(ast_path)
        if not key:
            unresolved_paths.append(ast_path)
        else:
            resolved_path_map[ast_path] = key

if unresolved_paths:
    raise SystemExit("Unresolved AST paths: " + json.dumps(sorted(set(unresolved_paths)), ensure_ascii=False))

all_complete_keys = base_key_set | supplemental_key_set
for ast_path, canonical_key in resolved_path_map.items():
    if canonical_key not in all_complete_keys:
        raise SystemExit(f"Unknown key in path map: {ast_path} -> {canonical_key}")

for path in [complete_dir, loader_file, index_file]:
    if not path.exists():
        continue
    relative = path.relative_to(project)
    destination = backup_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if path.is_dir():
        shutil.copytree(path, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(path, destination)

def restore() -> None:
    if complete_dir.exists():
        shutil.rmtree(complete_dir)
    backup_complete = backup_root / complete_dir.relative_to(project)
    if backup_complete.exists():
        shutil.copytree(backup_complete, complete_dir)

    if loader_file.exists():
        loader_file.unlink()
    backup_loader = backup_root / loader_file.relative_to(project)
    if backup_loader.exists():
        loader_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_loader, loader_file)

    backup_index = backup_root / index_file.relative_to(project)
    if backup_index.exists():
        index_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_index, index_file)

complete_dir.mkdir(parents=True, exist_ok=True)

merged_dictionaries = {}
for locale in locales:
    merged = {**base_dictionaries[locale], **supplemental_dictionaries[locale]}
    merged_dictionaries[locale] = merged
    (complete_dir / f"{locale}.json").write_text(
        json.dumps(merged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

complete_key_set = set(merged_dictionaries["en"])
for locale in locales:
    if set(merged_dictionaries[locale]) != complete_key_set:
        restore()
        raise SystemExit(f"Complete key parity failed for {locale}")

resolved_map_file.write_text(
    json.dumps(resolved_path_map, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

manifest = {
    "baseEntries": len(base_key_set),
    "supplementalEntries": len(supplemental_key_set),
    "completeEntries": len(complete_key_set),
    "resolvedPathAssignments": len(resolved_path_map),
    "ambiguousOverrides": ambiguous_overrides,
    "technicalPathsSkipped": sorted(technical_skipped),
    "sourceLeavesFile": str(leaves_file),
    "sourceSupplementalPathMap": str(supplemental_path_map_file),
}
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

loader_file.parent.mkdir(parents=True, exist_ok=True)
imports = "\n".join(
    f'import {locale} from "@/locales/landing-complete/{locale}.json";'
    for locale in locales
)
entries = "\n  ".join(f"{locale}," for locale in locales)

loader_text = (
    'import type { Locale } from "./config";\n\n'
    + imports
    + "\n\n"
    + "export type CompleteLandingLocaleDictionary = typeof en;\n\n"
    + "export const COMPLETE_LANDING_LOCALE_DICTIONARIES: Record<\n"
    + "  Locale,\n"
    + "  CompleteLandingLocaleDictionary\n"
    + "> = {\n  "
    + entries
    + "\n};\n\n"
    + "export function getCompleteLandingLocaleDictionary(\n"
    + "  locale: Locale,\n"
    + "): CompleteLandingLocaleDictionary {\n"
    + "  return COMPLETE_LANDING_LOCALE_DICTIONARIES[locale] ?? en;\n"
    + "}\n"
)
loader_file.write_text(loader_text, encoding="utf-8")

if not index_file.is_file():
    restore()
    raise SystemExit(f"Missing i18n index: {index_file}")

index_text = index_file.read_text(encoding="utf-8-sig")
export_line = 'export * from "./landing-complete-locales";'
if export_line not in index_text:
    if index_text and not index_text.endswith("\n"):
        index_text += "\n"
    index_text += export_line + "\n"
    index_file.write_text(index_text, encoding="utf-8")

build = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9V_COMPLETE_LANDING_LOCALES_build_{stamp}.txt"
build_log.write_text((build.stdout or "") + "\n--- STDERR ---\n" + (build.stderr or ""), encoding="utf-8")

if build.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; restored. See {build_log}")

summary = {
    "ok": True,
    "classification": "COMPLETE_LANDING_LOCALE_BUNDLE_MERGED",
    "productionMutation": False,
    "vpsTouched": False,
    "runtimeAiTranslation": False,
    "landingComponentChanged": False,
    "baseEntries": len(base_key_set),
    "supplementalEntries": len(supplemental_key_set),
    "completeEntriesPerLocale": len(complete_key_set),
    "localesMerged": len(locales),
    "resolvedPathAssignments": len(resolved_path_map),
    "ambiguousOverridesResolved": len(ambiguous_overrides),
    "technicalPathsSkipped": len(technical_skipped),
    "keyParityPassed": True,
    "buildPassed": True,
    "completeDirectory": str(complete_dir),
    "pathMap": str(resolved_map_file),
    "loaderFile": str(loader_file),
    "backupRoot": str(backup_root),
    "buildLog": str(build_log),
    "nextAction": "WIRE_LANDING_TO_COMPLETE_AST_PATH_MAP",
}

raw = audit / f"S10_9V_COMPLETE_LANDING_LOCALES_raw_{stamp}.json"
report = audit / f"S10_9V_COMPLETE_LANDING_LOCALES_report_{stamp}.txt"
milestone = milestones / f"S10_9V_COMPLETE_LANDING_LOCALES_{stamp}.md"

raw.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
report.write_text("\n".join([
    "S10.9V COMPLETE LANDING LOCALE BUNDLE",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=COMPLETE_LANDING_LOCALE_BUNDLE_MERGED",
    f"BASE_ENTRIES={len(base_key_set)}",
    f"SUPPLEMENTAL_ENTRIES={len(supplemental_key_set)}",
    f"COMPLETE_ENTRIES_PER_LOCALE={len(complete_key_set)}",
    f"LOCALES_MERGED={len(locales)}",
    f"RESOLVED_PATH_ASSIGNMENTS={len(resolved_path_map)}",
    f"AMBIGUOUS_OVERRIDES_RESOLVED={len(ambiguous_overrides)}",
    f"TECHNICAL_PATHS_SKIPPED={len(technical_skipped)}",
    "KEY_PARITY_PASSED=True",
    "BUILD_PASSED=True",
    "LANDING_COMPONENT_CHANGED=False",
    "RUNTIME_AI_TRANSLATION=False",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"COMPLETE_DIRECTORY={complete_dir}",
    f"PATH_MAP={resolved_map_file}",
    f"LOADER_FILE={loader_file}",
    f"BACKUP_ROOT={backup_root}",
    f"BUILD_LOG={build_log}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=WIRE_LANDING_TO_COMPLETE_AST_PATH_MAP",
]) + "\n", encoding="utf-8")

milestone.write_text("\n".join([
    "# S10.9V Complete Landing Locale Bundle",
    "",
    "- OK: True",
    f"- Base entries: {len(base_key_set)}",
    f"- Supplemental entries: {len(supplemental_key_set)}",
    f"- Complete entries per locale: {len(complete_key_set)}",
    f"- Locales merged: {len(locales)}",
    f"- Resolved AST path assignments: {len(resolved_path_map)}",
    f"- Ambiguous overrides resolved: {len(ambiguous_overrides)}",
    "- Key parity: passed",
    "- Build: passed",
    "- Landing component changed: False",
    "- Runtime AI translation: False",
    "- Production mutation: False",
    "- VPS touched: False",
    "- Next: WIRE_LANDING_TO_COMPLETE_AST_PATH_MAP",
]) + "\n", encoding="utf-8")

print()
print("=== S10.9V COMPLETE ===")
print("OK: True")
print("Classification: COMPLETE_LANDING_LOCALE_BUNDLE_MERGED")
print(f"Base entries: {len(base_key_set)}")
print(f"Supplemental entries: {len(supplemental_key_set)}")
print(f"Complete entries per locale: {len(complete_key_set)}")
print(f"Locales merged: {len(locales)}")
print(f"Resolved AST path assignments: {len(resolved_path_map)}")
print(f"Ambiguous overrides resolved: {len(ambiguous_overrides)}")
print(f"Technical paths skipped: {len(technical_skipped)}")
print("Key parity passed: True")
print("Build passed: True")
print("Landing component changed: False")
print("Runtime AI translation: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"Complete directory: {complete_dir}")
print(f"Path map: {resolved_map_file}")
print(f"Loader: {loader_file}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: WIRE_LANDING_TO_COMPLETE_AST_PATH_MAP")
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
  throw "S10.9V complete Landing locale merge blocked"
}
