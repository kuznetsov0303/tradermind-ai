param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9r_install_landing_locale_bundle_$stamp.py"

$python=@'
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

project=Path(sys.argv[1]).resolve()
stamp=datetime.now().strftime("%Y%m%d_%H%M%S")

source_dir=project/"PROJECT_STATE"/"i18n_generated"/"landing"
target_dir=project/"locales"/"landing"
loader=project/"lib"/"i18n"/"landing-locales.ts"
index_file=project/"lib"/"i18n"/"index.ts"

audit=project/"audit_exports"
milestones=project/"PROJECT_STATE"/"milestones"
backup_root=project/"PROJECT_STATE"/f"S10_9R_landing_locale_bundle_backup_{stamp}"

audit.mkdir(parents=True,exist_ok=True)
milestones.mkdir(parents=True,exist_ok=True)
backup_root.mkdir(parents=True,exist_ok=True)

locales=["en","ru","uk","zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi"]

for locale in locales:
    path=source_dir/f"{locale}.json"
    if not path.is_file():
        raise SystemExit(f"Missing generated locale: {path}")

def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

# Backup existing targets.
for path in [target_dir,loader,index_file]:
    if not path.exists():
        continue
    relative=path.relative_to(project)
    destination=backup_root/relative
    destination.parent.mkdir(parents=True,exist_ok=True)
    if path.is_dir():
        shutil.copytree(path,destination,dirs_exist_ok=True)
    else:
        shutil.copy2(path,destination)

def restore():
    if target_dir.exists():
        shutil.rmtree(target_dir)
    backup_target=backup_root/target_dir.relative_to(project)
    if backup_target.exists():
        shutil.copytree(backup_target,target_dir)

    if loader.exists():
        loader.unlink()
    backup_loader=backup_root/loader.relative_to(project)
    if backup_loader.exists():
        loader.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(backup_loader,loader)

    backup_index=backup_root/index_file.relative_to(project)
    if backup_index.exists():
        index_file.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(backup_index,index_file)

target_dir.mkdir(parents=True,exist_ok=True)

copied=[]
for locale in locales:
    source=source_dir/f"{locale}.json"
    destination=target_dir/f"{locale}.json"
    shutil.copy2(source,destination)
    copied.append({
        "locale":locale,
        "sourceSha256":sha256(source),
        "targetSha256":sha256(destination),
        "entries":len(json.loads(destination.read_text(encoding="utf-8-sig"))),
    })

mismatches=[row for row in copied if row["sourceSha256"]!=row["targetSha256"]]
if mismatches:
    restore()
    raise SystemExit(f"Locale copy hash mismatch: {mismatches}")

loader.parent.mkdir(parents=True,exist_ok=True)
loader_text='''import type { Locale } from "./config";

import en from "@/locales/landing/en.json";
import ru from "@/locales/landing/ru.json";
import uk from "@/locales/landing/uk.json";
import zh from "@/locales/landing/zh.json";
import de from "@/locales/landing/de.json";
import fr from "@/locales/landing/fr.json";
import es from "@/locales/landing/es.json";
import ar from "@/locales/landing/ar.json";
import it from "@/locales/landing/it.json";
import nb from "@/locales/landing/nb.json";
import ka from "@/locales/landing/ka.json";
import pl from "@/locales/landing/pl.json";
import tr from "@/locales/landing/tr.json";
import el from "@/locales/landing/el.json";
import hi from "@/locales/landing/hi.json";

export type LandingLocaleDictionary = typeof en;

export const LANDING_LOCALE_DICTIONARIES: Record<
  Locale,
  LandingLocaleDictionary
> = {
  en,
  ru,
  uk,
  zh,
  de,
  fr,
  es,
  ar,
  it,
  nb,
  ka,
  pl,
  tr,
  el,
  hi,
};

export function getLandingLocaleDictionary(
  locale: Locale,
): LandingLocaleDictionary {
  return LANDING_LOCALE_DICTIONARIES[locale] ?? en;
}
'''
loader.write_text(loader_text,encoding="utf-8")

if not index_file.is_file():
    restore()
    raise SystemExit(f"Missing i18n barrel: {index_file}")

index_text=index_file.read_text(encoding="utf-8-sig")
export_line='export * from "./landing-locales";'

if export_line not in index_text:
    if index_text and not index_text.endswith("\n"):
        index_text+="\n"
    index_text+=export_line+"\n"
    index_file.write_text(index_text,encoding="utf-8")

# Validate key parity again from installed files.
en_keys=set(json.loads((target_dir/"en.json").read_text(encoding="utf-8-sig")).keys())
key_issues=[]
for locale in locales:
    data=json.loads((target_dir/f"{locale}.json").read_text(encoding="utf-8-sig"))
    keys=set(data.keys())
    if keys!=en_keys:
        key_issues.append({
            "locale":locale,
            "missing":sorted(en_keys-keys),
            "extra":sorted(keys-en_keys),
        })

if key_issues:
    restore()
    raise SystemExit(f"Installed locale key mismatch: {key_issues}")

build=subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm","run","build"],
    cwd=project,text=True,capture_output=True
)

build_log=audit/f"S10_9R_LANDING_LOCALE_BUNDLE_build_{stamp}.txt"
build_log.write_text(
    (build.stdout or "")+"\n--- STDERR ---\n"+(build.stderr or ""),
    encoding="utf-8"
)

if build.returncode!=0:
    restore()
    raise SystemExit(f"Build failed; locale bundle restored. See: {build_log}")

result={
    "ok":True,
    "classification":"LANDING_LOCALE_BUNDLE_INSTALLED",
    "productionMutation":False,
    "vpsTouched":False,
    "runtimeAiTranslation":False,
    "filesChanged":[
        "locales/landing/*.json",
        "lib/i18n/landing-locales.ts",
        "lib/i18n/index.ts",
    ],
    "localesInstalled":len(locales),
    "entriesPerLocale":len(en_keys),
    "hashParityPassed":True,
    "keyParityPassed":True,
    "buildPassed":True,
    "landingComponentChanged":False,
    "backupRoot":str(backup_root),
    "buildLog":str(build_log),
    "copiedLocales":copied,
    "nextAction":"WIRE_LANDING_COMPONENT_TO_TYPED_LOCALE_BUNDLE",
}

raw=audit/f"S10_9R_LANDING_LOCALE_BUNDLE_raw_{stamp}.json"
report=audit/f"S10_9R_LANDING_LOCALE_BUNDLE_report_{stamp}.txt"
milestone=milestones/f"S10_9R_LANDING_LOCALE_BUNDLE_{stamp}.md"

raw.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
report.write_text("\n".join([
    "S10.9R LANDING LOCALE BUNDLE",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=LANDING_LOCALE_BUNDLE_INSTALLED",
    f"LOCALES_INSTALLED={len(locales)}",
    f"ENTRIES_PER_LOCALE={len(en_keys)}",
    "HASH_PARITY_PASSED=True",
    "KEY_PARITY_PASSED=True",
    "BUILD_PASSED=True",
    "LANDING_COMPONENT_CHANGED=False",
    "RUNTIME_AI_TRANSLATION=False",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"BACKUP_ROOT={backup_root}",
    f"BUILD_LOG={build_log}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=WIRE_LANDING_COMPONENT_TO_TYPED_LOCALE_BUNDLE",
])+"\n",encoding="utf-8")

milestone.write_text("\n".join([
    "# S10.9R Landing Locale Bundle",
    "",
    "- OK: True",
    f"- Locales installed: {len(locales)}",
    f"- Entries per locale: {len(en_keys)}",
    "- Hash parity: passed",
    "- Key parity: passed",
    "- Build: passed",
    "- Landing component changed: False",
    "- Runtime AI translation: False",
    "- Production mutation: False",
    "- VPS touched: False",
    f"- Backup: {backup_root}",
])+"\n",encoding="utf-8")

print()
print("=== S10.9R COMPLETE ===")
print("OK: True")
print("Classification: LANDING_LOCALE_BUNDLE_INSTALLED")
print(f"Locales installed: {len(locales)}")
print(f"Entries per locale: {len(en_keys)}")
print("Hash parity passed: True")
print("Key parity passed: True")
print("Build passed: True")
print("Landing component changed: False")
print("Runtime AI translation: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: WIRE_LANDING_COMPONENT_TO_TYPED_LOCALE_BUNDLE")
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
  throw "S10.9R Landing locale bundle installation blocked"
}
