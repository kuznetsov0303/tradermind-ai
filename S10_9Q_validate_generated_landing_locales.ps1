param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9q_validate_landing_locales_$stamp.py"

$python=@'
from __future__ import annotations
import json,re,sys
from datetime import datetime
from pathlib import Path
project=Path(sys.argv[1]).resolve(); stamp=datetime.now().strftime("%Y%m%d_%H%M%S")
source_dir=project/"PROJECT_STATE"/"i18n_generated"/"landing"
audit=project/"audit_exports"; milestones=project/"PROJECT_STATE"/"milestones"
audit.mkdir(parents=True,exist_ok=True); milestones.mkdir(parents=True,exist_ok=True)
locales=["en","ru","uk","zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi"]
for locale in locales:
    p=source_dir/f"{locale}.json"
    if not p.is_file(): raise SystemExit(f"Missing generated locale file: {p}")
dictionaries={}
for locale in locales:
    p=source_dir/f"{locale}.json"
    try: value=json.loads(p.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e: raise SystemExit(f"Invalid JSON in {p}: {e}")
    if not isinstance(value,dict): raise SystemExit(f"Locale file must contain an object: {p}")
    dictionaries[locale]=value
english=dictionaries["en"]; english_keys=list(english.keys()); english_key_set=set(english_keys)
protected_terms=["SkillEdge AI","SkillEdge Core","SkillEdge Edge","SkillEdge Elite","Personal Edge","Strategy OS","AI Trading Desk","AI Alerts","AI Coach","AI Scanner","AI Market Brief","Market Intelligence","VWAP","EMA20","RVOL","PnL","TP1","TP2","RR"]
mojibake_patterns=["РІ","РЎ","Рµ","вЂ","вњ","Ð","Ñ"]
placeholder_pattern=re.compile(r"\{[^{}]+\}")
script_checks={"ru":re.compile(r"[\u0400-\u04FF]"),"uk":re.compile(r"[іїєґІЇЄҐ]"),"zh":re.compile(r"[\u4E00-\u9FFF]"),"ar":re.compile(r"[\u0600-\u06FF]"),"ka":re.compile(r"[\u10A0-\u10FF]"),"el":re.compile(r"[\u0370-\u03FF]"),"hi":re.compile(r"[\u0900-\u097F]")}
latin_locales={"de","fr","es","it","nb","pl","tr"}
locale_results={}; global_issues=[]; warnings=[]
for locale in locales:
    current=dictionaries[locale]; current_keys=set(current.keys())
    missing=sorted(english_key_set-current_keys); extra=sorted(current_keys-english_key_set)
    empty=[]; non_string=[]; placeholder_issues=[]; protected_issues=[]; mojibake_issues=[]; identical=[]; translated_count=0
    for key in english_keys:
        source_text=english[key]; value=current.get(key)
        if not isinstance(value,str): non_string.append(key); continue
        if not value.strip(): empty.append(key); continue
        if value!=source_text: translated_count+=1
        elif locale!="en": identical.append(key)
        if placeholder_pattern.findall(source_text)!=placeholder_pattern.findall(value): placeholder_issues.append(key)
        for term in protected_terms:
            if term in source_text and term not in value: protected_issues.append({"key":key,"term":term})
        for pat in mojibake_patterns:
            if pat in value: mojibake_issues.append({"key":key,"pattern":pat})
    script_hits=None; script_ratio=None
    if locale in script_checks:
        vals=[current[k] for k in english_keys if isinstance(current.get(k),str) and current[k]!=english[k]]
        script_hits=sum(1 for v in vals if script_checks[locale].search(v)); script_ratio=(script_hits/len(vals) if vals else 0.0)
        if locale not in {"ru","uk"} and script_ratio<0.50: warnings.append(f"{locale}: expected-script ratio is low ({script_ratio:.2%})")
    cyrillic_values=[]
    if locale in latin_locales:
        cyrillic_values=[k for k in english_keys if isinstance(current.get(k),str) and re.search(r"[\u0400-\u04FF]",current[k])]
        if cyrillic_values: warnings.append(f"{locale}: Cyrillic found in {len(cyrillic_values)} values")
    unchanged_ratio=(len(identical)/len(english_keys) if locale!="en" and english_keys else 0.0)
    if locale!="en" and unchanged_ratio>0.35: warnings.append(f"{locale}: high unchanged-English ratio ({unchanged_ratio:.2%})")
    hard=sum(map(len,[missing,extra,empty,non_string,placeholder_issues,protected_issues,mojibake_issues]))
    if hard: global_issues.append(f"{locale}: {hard} hard validation issues")
    locale_results[locale]={"entries":len(current),"missingKeys":missing,"extraKeys":extra,"emptyKeys":empty,"nonStringKeys":non_string,"placeholderIssues":placeholder_issues,"protectedTermIssues":protected_issues,"mojibakeIssues":mojibake_issues,"identicalToEnglishCount":len(identical),"identicalToEnglishSample":identical[:40],"translatedCount":translated_count,"unchangedRatio":round(unchanged_ratio,6),"scriptHits":script_hits,"scriptRatio":round(script_ratio,6) if script_ratio is not None else None,"cyrillicKeys":cyrillic_values[:100],"hardIssueCount":hard}
classification="LANDING_LOCALE_VALIDATION_PASSED" if not global_issues else "LANDING_LOCALE_VALIDATION_BLOCKED"
ok=not global_issues
result={"ok":ok,"classification":classification,"inspectionOnly":True,"productionMutation":False,"vpsTouched":False,"sourceDirectory":str(source_dir),"localesChecked":len(locales),"englishEntries":len(english_keys),"hardIssues":global_issues,"warnings":warnings,"localeResults":locale_results,"nextAction":"CONNECT_VALIDATED_LANDING_LOCALES" if ok else "REGENERATE_OR_REPAIR_FLAGGED_LOCALE_ENTRIES"}
raw=audit/f"S10_9Q_LANDING_LOCALE_VALIDATION_raw_{stamp}.json"; report=audit/f"S10_9Q_LANDING_LOCALE_VALIDATION_report_{stamp}.txt"; milestone=milestones/f"S10_9Q_LANDING_LOCALE_VALIDATION_{stamp}.md"
raw.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
lines=["S10.9Q LANDING LOCALE VALIDATION",f"Generated={stamp}",f"OK={ok}",f"CLASSIFICATION={classification}","INSPECTION_ONLY=True","PRODUCTION_MUTATION=False","VPS_TOUCHED=False",f"LOCALES_CHECKED={len(locales)}",f"ENGLISH_ENTRIES={len(english_keys)}",f"HARD_ISSUES={len(global_issues)}",f"WARNINGS={len(warnings)}","","=== LOCALE SUMMARY ==="]
for locale in locales:
    row=locale_results[locale]; lines.append(f"{locale}: entries={row['entries']} translated={row['translatedCount']} unchanged={row['identicalToEnglishCount']} hardIssues={row['hardIssueCount']} scriptRatio={row['scriptRatio']}")
lines += ["","=== HARD ISSUES ===",*global_issues,"","=== WARNINGS ===",*warnings,"",f"RAW_JSON={raw}",f"NEXT_ACTION={result['nextAction']}"]
report.write_text("\n".join(lines)+"\n",encoding="utf-8")
milestone.write_text("\n".join(["# S10.9Q Landing Locale Validation","",f"- OK: {ok}",f"- Classification: {classification}",f"- Locales checked: {len(locales)}",f"- English entries: {len(english_keys)}",f"- Hard issues: {len(global_issues)}",f"- Warnings: {len(warnings)}","- Inspection only: True","- Production mutation: False","- VPS touched: False",f"- Next: {result['nextAction']}"])+"\n",encoding="utf-8")
print("\n=== S10.9Q COMPLETE ==="); print(f"OK: {ok}"); print(f"Classification: {classification}"); print(f"Locales checked: {len(locales)}"); print(f"English entries: {len(english_keys)}"); print(f"Hard issues: {len(global_issues)}"); print(f"Warnings: {len(warnings)}")
for locale in locales:
    row=locale_results[locale]; print(f"{locale}: entries={row['entries']}, translated={row['translatedCount']}, unchanged={row['identicalToEnglishCount']}, hardIssues={row['hardIssueCount']}")
print("Inspection only: True"); print("Production mutation: False"); print("VPS touched: False"); print(f"Report: {report}"); print(f"Raw: {raw}"); print(f"Milestone: {milestone}"); print(f"Next action: {result['nextAction']}")
if not ok: raise SystemExit(2)
'@

[IO.File]::WriteAllText($runner,$python,[Text.UTF8Encoding]::new($false))

$pythonMode=$null
$pythonPath=$null
try{ & py -3 --version *> $null; if($LASTEXITCODE -eq 0){ $pythonMode="py" } }catch{}
if(-not $pythonMode){
  foreach($candidate in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
  )){
    if(Test-Path -LiteralPath $candidate){ $pythonMode="exe"; $pythonPath=$candidate; break }
  }
}
if(-not $pythonMode){ throw "Usable Python not found" }
if($pythonMode -eq "py"){ & py -3 $runner $ProjectRoot }else{ & $pythonPath $runner $ProjectRoot }
$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue
if($exitCode-ne 0){ throw "S10.9Q Landing locale validation blocked" }
