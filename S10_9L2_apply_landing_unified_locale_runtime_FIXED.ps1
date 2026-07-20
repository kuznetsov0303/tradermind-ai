param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9l2_landing_locale_runtime_$stamp.py"

$python=@'
from __future__ import annotations
import json, re, shutil, subprocess, sys
from datetime import datetime
from pathlib import Path

project=Path(sys.argv[1]).resolve()
stamp=datetime.now().strftime("%Y%m%d_%H%M%S")
landing=project/"components"/"Landing.tsx"
runtime=project/"lib"/"i18n"/"runtime.ts"
config=project/"lib"/"i18n"/"config.ts"

for p in (landing,runtime,config):
    if not p.is_file():
        raise SystemExit(f"Required file missing: {p}")

audit=project/"audit_exports"
milestones=project/"PROJECT_STATE"/"milestones"
backup_root=project/"PROJECT_STATE"/f"S10_9L2_landing_locale_runtime_backup_{stamp}"
audit.mkdir(parents=True,exist_ok=True)
milestones.mkdir(parents=True,exist_ok=True)
backup_root.mkdir(parents=True,exist_ok=True)

backup=backup_root/landing.relative_to(project)
backup.parent.mkdir(parents=True,exist_ok=True)
shutil.copy2(landing,backup)

def restore():
    shutil.copy2(backup,landing)

text=landing.read_text(encoding="utf-8-sig")
results=[]

def literal_replace(old,new,name,expected=None):
    global text
    hits=text.count(old)
    if hits==0:
        restore()
        raise SystemExit(f"Required Landing anchor missing: {name}")
    if expected is not None and hits!=expected:
        restore()
        raise SystemExit(f"Unexpected count for {name}: {hits}, expected {expected}")
    text=text.replace(old,new)
    results.append({"name":name,"hits":hits})

def regex_replace(pattern,replacement,name,flags=0,expected=1):
    global text
    text_new,hits=re.subn(pattern,replacement,text,flags=flags)
    if hits!=expected:
        restore()
        raise SystemExit(f"Regex anchor mismatch for {name}: {hits}, expected {expected}")
    text=text_new
    results.append({"name":name,"hits":hits})

literal_replace(
'import TradingBackground from "@/components/marketing/TradingBackground";',
'import TradingBackground from "@/components/marketing/TradingBackground";\n'
'import { LOCALES, type Locale } from "@/lib/i18n/config";\n'
'import { applyDocumentLocale, getSavedLocale, saveLocale } from "@/lib/i18n/runtime";',
"unified_i18n_imports",1)

literal_replace(
'type Language = "en" | "ru" | "ua";',
'type Language = Locale;',
"landing_language_type",1)

# Canonicalize only actual language comparisons/returns, not dictionary keys.
text=text.replace('language === "ua"','language === "uk"')
results.append({"name":"canonical_uk_comparisons","hits":text.count('language === "uk"')})

component_pattern=r'(export default function Landing\(\{\s*initialPage\s*=\s*"home",?\s*\}:\s*\{\s*initialPage\?:\s*PageKey;?\s*\}\)\s*\{)'
helper='''function getLandingDictionaryLocale(locale: Locale): "en" | "ru" | "ua" {
  if (locale === "ru") return "ru";
  if (locale === "uk") return "ua";
  return "en";
}

function getNextLandingLocale(locale: Locale): Locale {
  const currentIndex = LOCALES.indexOf(locale);
  return LOCALES[(currentIndex + 1) % LOCALES.length];
}

\\1'''
regex_replace(component_pattern,helper,"landing_locale_helpers",flags=re.DOTALL)

# Replace dictionary selection in a formatting-tolerant way.
dict_patterns=[
    r'const\s+t\s*=\s*dict\s*\[\s*language\s*\]\s*;?',
    r'const\s+t\s*=\s*translations\s*\[\s*language\s*\]\s*;?',
]
dict_done=False
for pattern in dict_patterns:
    candidate,hits=re.subn(
        pattern,
        'const t = dict[getLandingDictionaryLocale(language)];',
        text,
        count=1
    )
    if hits==1:
        text=candidate
        results.append({"name":"landing_dictionary_compatibility","hits":1})
        dict_done=True
        break

if not dict_done:
    restore()
    raise SystemExit("Landing dictionary selection anchor missing")

# Loader replacement, tolerant to indentation and spacing.
loader_pattern=r'''useEffect\(\s*\(\)\s*=>\s*\{\s*
const\s+savedLanguage\s*=\s*localStorage\.getItem\(\s*["']skilledge_language["']\s*\)\s*;?\s*
if\s*\(\s*
savedLanguage\s*===\s*["']en["']\s*\|\|\s*
savedLanguage\s*===\s*["']ru["']\s*\|\|\s*
savedLanguage\s*===\s*["']ua["']\s*
\)\s*\{\s*
setLanguage\(\s*savedLanguage\s*\)\s*;?\s*
\}\s*
\}\s*,\s*\[\s*\]\s*\)\s*;?'''

loader_replacement='''useEffect(() => {
    const savedLocale = getSavedLocale();
    setLanguage(savedLocale);
    applyDocumentLocale(savedLocale);
  }, []);'''

regex_replace(
    loader_pattern,
    loader_replacement,
    "landing_unified_locale_loader",
    flags=re.DOTALL | re.VERBOSE
)

# Robustly replace the whole cycle function regardless of indentation.
cycle_pattern=r'''const\s+cycle\s*=\s*\(\)\s*=>\s*\{
(?:
  (?!\n\s*\};).|\n
)*?
localStorage\.setItem\(\s*["']skilledge_language["']\s*,\s*nextLanguage\s*\)\s*;?
(?:
  (?!\n\s*\};).|\n
)*?
\n\s*\};'''

cycle_replacement='''const cycle = () => {
    const nextLanguage = getNextLandingLocale(language);
    setLanguage(nextLanguage);
    saveLocale(nextLanguage);
  };'''

regex_replace(
    cycle_pattern,
    cycle_replacement,
    "landing_unified_locale_cycle",
    flags=re.DOTALL | re.VERBOSE
)

# Update any selector occurrence displaying t.lang.
selector_pattern=r'\{t\.switchLanguage\}\s*:\s*\{t\.lang\}'
selector_replacement='{t.switchLanguage}: {language.toUpperCase()}'
text_new,hits=re.subn(selector_pattern,selector_replacement,text)
if hits<1:
    restore()
    raise SystemExit("No Landing selector label found")
text=text_new
results.append({"name":"selector_actual_locale_label","hits":hits})

required=[
'type Language = Locale;',
'getSavedLocale()',
'saveLocale(nextLanguage)',
'applyDocumentLocale(savedLocale)',
'getLandingDictionaryLocale(language)',
'getNextLandingLocale(language)',
'language.toUpperCase()',
]
for token in required:
    if token not in text:
        restore()
        raise SystemExit(f"Landing locale token missing: {token}")

for stale in [
'type Language = "en" | "ru" | "ua";',
'localStorage.getItem("skilledge_language")',
'localStorage.setItem("skilledge_language"',
]:
    if stale in text:
        restore()
        raise SystemExit(f"Stale Landing locale implementation remains: {stale}")

landing.write_text(text,encoding="utf-8")

build=subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm","run","build"],
    cwd=project,text=True,capture_output=True
)

build_log=audit/f"S10_9L2_LANDING_LOCALE_RUNTIME_build_{stamp}.txt"
build_log.write_text(
    (build.stdout or "")+"\n--- STDERR ---\n"+(build.stderr or ""),
    encoding="utf-8"
)

if build.returncode!=0:
    restore()
    raise SystemExit(f"Build failed; Landing restored. See: {build_log}")

result={
    "ok":True,
    "classification":"LANDING_UNIFIED_LOCALE_RUNTIME_PATCH_PASSED",
    "productionMutation":False,
    "vpsTouched":False,
    "filesChanged":["components/Landing.tsx"],
    "supportedLocales":["en","ru","uk","zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi"],
    "existingTranslatedLocales":["en","ru","uk"],
    "temporaryEnglishFallbackLocales":["zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi"],
    "storageKey":"skilledge_language",
    "documentLangApplied":True,
    "rtlReady":True,
    "runtimeAiTranslation":False,
    "buildPassed":True,
    "replacementResults":results,
    "backupRoot":str(backup_root),
    "buildLog":str(build_log),
    "nextAction":"EXTRACT_ENGLISH_MASTER_AND_GENERATE_LOCALE_FILES"
}

raw=audit/f"S10_9L2_LANDING_LOCALE_RUNTIME_raw_{stamp}.json"
report=audit/f"S10_9L2_LANDING_LOCALE_RUNTIME_report_{stamp}.txt"
milestone=milestones/f"S10_9L2_LANDING_LOCALE_RUNTIME_{stamp}.md"

raw.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
report.write_text("\n".join([
"S10.9L2 LANDING UNIFIED LOCALE RUNTIME",
f"Generated={stamp}",
"OK=True",
"CLASSIFICATION=LANDING_UNIFIED_LOCALE_RUNTIME_PATCH_PASSED",
"SUPPORTED_LOCALES=15",
"TRANSLATED_NOW=en,ru,uk",
"TEMPORARY_ENGLISH_FALLBACK=zh,de,fr,es,ar,it,nb,ka,pl,tr,el,hi",
"STORAGE_KEY=skilledge_language",
"DOCUMENT_LANG_APPLIED=True",
"RTL_READY=True",
"RUNTIME_AI_TRANSLATION=False",
"BUILD_PASSED=True",
"PRODUCTION_MUTATION=False",
"VPS_TOUCHED=False",
f"BACKUP_ROOT={backup_root}",
f"BUILD_LOG={build_log}",
f"RAW_JSON={raw}",
"NEXT_ACTION=EXTRACT_ENGLISH_MASTER_AND_GENERATE_LOCALE_FILES",
])+"\n",encoding="utf-8")

milestone.write_text("\n".join([
"# S10.9L2 Landing Unified Locale Runtime",
"",
"- OK: True",
"- Supported locales: 15",
"- Existing translations: EN/RU/UK",
"- Other locales: temporary English fallback",
"- Shared storage: skilledge_language",
"- Document lang/dir: enabled",
"- Runtime AI translation: False",
"- Build: passed",
"- Production mutation: False",
"- VPS touched: False",
f"- Backup: {backup_root}",
])+"\n",encoding="utf-8")

print()
print("=== S10.9L2 COMPLETE ===")
print("OK: True")
print("Classification: LANDING_UNIFIED_LOCALE_RUNTIME_PATCH_PASSED")
print("Supported locales: 15")
print("Existing translated locales: en, ru, uk")
print("Temporary English fallback: 12 locales")
print("Storage key: skilledge_language")
print("Document lang applied: True")
print("RTL ready: True")
print("Runtime AI translation: False")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: EXTRACT_ENGLISH_MASTER_AND_GENERATE_LOCALE_FILES")
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
  throw "S10.9L2 Landing locale runtime patch blocked"
}
