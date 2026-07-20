param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9l_landing_locale_runtime_$stamp.py"

$python=@'
from __future__ import annotations
import json, shutil, subprocess, sys
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
backup_root=project/"PROJECT_STATE"/f"S10_9L_landing_locale_runtime_backup_{stamp}"
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

def req(old,new,name,expected=None):
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

req(
'import TradingBackground from "@/components/marketing/TradingBackground";',
'import TradingBackground from "@/components/marketing/TradingBackground";\n'
'import { LOCALES, type Locale } from "@/lib/i18n/config";\n'
'import { applyDocumentLocale, getSavedLocale, saveLocale } from "@/lib/i18n/runtime";',
"unified_i18n_imports",1)

req('type Language = "en" | "ru" | "ua";','type Language = Locale;',"landing_language_type",1)

text=text.replace('language === "ua"','language === "uk"')
text=text.replace('? "ua" : "en"','? "uk" : "en"')
results.append({"name":"canonical_uk_comparisons","hits":text.count('language === "uk"')})

component_anchor='''export default function Landing({
  initialPage = "home",
}: {
  initialPage?: PageKey;
}) {'''

helper='''function getLandingDictionaryLocale(locale: Locale): "en" | "ru" | "ua" {
  if (locale === "ru") return "ru";
  if (locale === "uk") return "ua";
  return "en";
}

function getNextLandingLocale(locale: Locale): Locale {
  const currentIndex = LOCALES.indexOf(locale);
  return LOCALES[(currentIndex + 1) % LOCALES.length];
}

'''

if component_anchor not in text:
    restore()
    raise SystemExit("Landing component anchor missing")
text=text.replace(component_anchor,helper+component_anchor,1)
results.append({"name":"landing_locale_helpers","hits":1})

dict_done=False
for old,new in [
    ('const t = dict[language];','const t = dict[getLandingDictionaryLocale(language)];'),
    ('const t = dict[language]','const t = dict[getLandingDictionaryLocale(language)]')
]:
    if old in text:
        text=text.replace(old,new,1)
        dict_done=True
        break
if not dict_done:
    restore()
    raise SystemExit("Landing dictionary selection anchor missing")
results.append({"name":"landing_dictionary_compatibility","hits":1})

old_loader='''  useEffect(() => {
    const savedLanguage = localStorage.getItem("skilledge_language");

    if (savedLanguage === "en" || savedLanguage === "ru" || savedLanguage === "ua") {
      setLanguage(savedLanguage);
    }
  }, []);'''

new_loader='''  useEffect(() => {
    const savedLocale = getSavedLocale();
    setLanguage(savedLocale);
    applyDocumentLocale(savedLocale);
  }, []);'''

req(old_loader,new_loader,"landing_unified_locale_loader",1)

old_cycle='''  const cycle = () => {
  const nextLanguage =
    language === "en" ? "ru" : language === "ru" ? "ua" : "en";

  setLanguage(nextLanguage);
  localStorage.setItem("skilledge_language", nextLanguage);

  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("skilledge:language-changed", {
        detail: { language: nextLanguage },
      })
    );
  }, 0);
};'''

new_cycle='''  const cycle = () => {
    const nextLanguage = getNextLandingLocale(language);
    setLanguage(nextLanguage);
    saveLocale(nextLanguage);
  };'''

req(old_cycle,new_cycle,"landing_unified_locale_cycle",1)

old_button='''                <button onClick={cycle} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75">
                  {t.switchLanguage}: {t.lang}
                </button>'''

new_button='''                <button
                  onClick={cycle}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75"
                  title="Cycle through available languages"
                >
                  {t.switchLanguage}: {language.toUpperCase()}
                </button>'''

req(old_button,new_button,"mobile_selector_actual_locale_label",1)

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

build_log=audit/f"S10_9L_LANDING_LOCALE_RUNTIME_build_{stamp}.txt"
build_log.write_text((build.stdout or "")+"\n--- STDERR ---\n"+(build.stderr or ""),encoding="utf-8")

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

raw=audit/f"S10_9L_LANDING_LOCALE_RUNTIME_raw_{stamp}.json"
report=audit/f"S10_9L_LANDING_LOCALE_RUNTIME_report_{stamp}.txt"
milestone=milestones/f"S10_9L_LANDING_LOCALE_RUNTIME_{stamp}.md"

raw.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
report.write_text("\n".join([
"S10.9L LANDING UNIFIED LOCALE RUNTIME",
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
"# S10.9L Landing Unified Locale Runtime",
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
print("=== S10.9L COMPLETE ===")
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
  throw "S10.9L Landing locale runtime patch blocked"
}
