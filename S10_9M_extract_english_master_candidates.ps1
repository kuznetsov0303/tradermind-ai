param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9m_extract_english_master_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

project=Path(sys.argv[1]).resolve()
stamp=datetime.now().strftime("%Y%m%d_%H%M%S")

required=[
    project/"components"/"Landing.tsx",
    project/"app"/"dashboard"/"page.tsx",
    project/"lib"/"i18n"/"config.ts",
    project/"lib"/"i18n"/"dictionaries.ts",
]

for p in required:
    if not p.is_file():
        raise SystemExit(f"Required file missing: {p}")

audit=project/"audit_exports"
milestones=project/"PROJECT_STATE"/"milestones"
exports=project/"PROJECT_STATE"/"i18n_exports"
audit.mkdir(parents=True,exist_ok=True)
milestones.mkdir(parents=True,exist_ok=True)
exports.mkdir(parents=True,exist_ok=True)

excluded_parts={
    "node_modules",".next",".git","audit_exports","PROJECT_STATE",
    "backups","archives"
}

source_files=[]
for p in project.rglob("*"):
    if not p.is_file() or p.suffix.lower() not in {".ts",".tsx",".js",".jsx"}:
        continue
    rel_parts=set(p.relative_to(project).parts)
    if rel_parts & excluded_parts:
        continue
    if ".backup-" in p.name.lower():
        continue
    source_files.append(p)

source_files.sort()

# Gather quoted strings that are likely to be visible UI copy. This is an
# extraction candidate report only; it does not mutate production code.
quoted=re.compile(r'(?P<q>["\'`])(?P<text>(?:\\.|(?!\1).)*?)(?P=q)',re.DOTALL)
skip_patterns=[
    re.compile(r"^(?:[A-Za-z0-9_./:@-]+)$"),
    re.compile(r"^(?:https?://|/api/|@/|[.#][A-Za-z0-9_-])"),
    re.compile(r"^(?:GET|POST|PUT|PATCH|DELETE)$"),
    re.compile(r"^[A-Z0-9_]{3,}$"),
]
ui_hint=re.compile(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}|[!?.,:]|[A-Za-z]{6,}")

records=[]
per_file=Counter()
duplicates=Counter()

for p in source_files:
    rel=str(p.relative_to(project)).replace("\\","/")
    try:
        text=p.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        continue

    lines=text.splitlines()

    for m in quoted.finditer(text):
        value=m.group("text")
        if "\\n" in value or "${" in value:
            continue
        value=value.replace('\\"','"').replace("\\'","'").strip()
        if not value or len(value)<2 or len(value)>500:
            continue
        if any(rx.search(value) for rx in skip_patterns):
            continue
        if not ui_hint.search(value):
            continue
        if re.search(r"\b(import|export|const|function|return|className)\b",value):
            continue

        line=text.count("\n",0,m.start())+1
        context="\n".join(
            f"{i+1}: {lines[i]}"
            for i in range(max(0,line-2),min(len(lines),line+1))
        )

        records.append({
            "file":rel,
            "line":line,
            "text":value,
            "context":context,
        })
        per_file[rel]+=1
        duplicates[value]+=1

# Pull explicit English object-like entries from known active dictionaries.
english_key_value=re.compile(
    r'(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*:\s*["\'](?P<value>[^"\']{1,500})["\']'
)

dictionary_candidates=[]
for p in [
    project/"components"/"Landing.tsx",
    project/"lib"/"i18n"/"dictionaries.ts",
]:
    text=p.read_text(encoding="utf-8-sig")
    for m in english_key_value.finditer(text):
        value=m.group("value").strip()
        if not value or any(rx.search(value) for rx in skip_patterns):
            continue
        if not ui_hint.search(value):
            continue
        dictionary_candidates.append({
            "file":str(p.relative_to(project)).replace("\\","/"),
            "key":m.group("key"),
            "value":value,
        })

unique_texts=sorted(set(item["text"] for item in records))
duplicate_texts=[
    {"text":text,"count":count}
    for text,count in duplicates.most_common()
    if count>1
]

result={
    "ok":True,
    "classification":"ENGLISH_MASTER_EXTRACTION_AUDIT_COMPLETE",
    "inspectionOnly":True,
    "productionMutation":False,
    "vpsTouched":False,
    "sourceFilesScanned":len(source_files),
    "uiStringCandidates":len(records),
    "uniqueUiStringCandidates":len(unique_texts),
    "dictionaryCandidates":len(dictionary_candidates),
    "topFiles":[
        {"file":file,"count":count}
        for file,count in per_file.most_common(30)
    ],
    "duplicateTexts":duplicate_texts[:200],
    "nextAction":"REVIEW_AND_BUILD_CANONICAL_ENGLISH_MASTER_JSON",
}

raw=audit/f"S10_9M_ENGLISH_MASTER_EXTRACTION_raw_{stamp}.json"
report=audit/f"S10_9M_ENGLISH_MASTER_EXTRACTION_report_{stamp}.txt"
candidate_json=exports/f"english_master_candidates_{stamp}.json"
dictionary_json=exports/f"english_dictionary_candidates_{stamp}.json"
milestone=milestones/f"S10_9M_ENGLISH_MASTER_EXTRACTION_{stamp}.md"

raw.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
candidate_json.write_text(
    json.dumps(records,ensure_ascii=False,indent=2),
    encoding="utf-8"
)
dictionary_json.write_text(
    json.dumps(dictionary_candidates,ensure_ascii=False,indent=2),
    encoding="utf-8"
)

report_lines=[
    "S10.9M ENGLISH MASTER EXTRACTION AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=ENGLISH_MASTER_EXTRACTION_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"SOURCE_FILES_SCANNED={len(source_files)}",
    f"UI_STRING_CANDIDATES={len(records)}",
    f"UNIQUE_UI_STRING_CANDIDATES={len(unique_texts)}",
    f"DICTIONARY_CANDIDATES={len(dictionary_candidates)}",
    "",
    "=== TOP FILES BY UI STRING CANDIDATES ===",
]
for file,count in per_file.most_common(30):
    report_lines.append(f"{count}\t{file}")

report_lines += [
    "",
    "=== DUPLICATE UI TEXTS ===",
]
for row in duplicate_texts[:200]:
    report_lines.append(f"{row['count']}\t{row['text']}")

report_lines += [
    "",
    f"CANDIDATE_JSON={candidate_json}",
    f"DICTIONARY_JSON={dictionary_json}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=REVIEW_AND_BUILD_CANONICAL_ENGLISH_MASTER_JSON",
]

report.write_text("\n".join(report_lines)+"\n",encoding="utf-8")

milestone.write_text("\n".join([
    "# S10.9M English Master Extraction",
    "",
    "- OK: True",
    "- Inspection only: True",
    f"- Source files scanned: {len(source_files)}",
    f"- UI string candidates: {len(records)}",
    f"- Unique UI candidates: {len(unique_texts)}",
    f"- Dictionary candidates: {len(dictionary_candidates)}",
    "- Production mutation: False",
    "- VPS touched: False",
    "- Next: canonical English master JSON",
])+"\n",encoding="utf-8")

print()
print("=== S10.9M COMPLETE ===")
print("OK: True")
print("Classification: ENGLISH_MASTER_EXTRACTION_AUDIT_COMPLETE")
print(f"Source files scanned: {len(source_files)}")
print(f"UI string candidates: {len(records)}")
print(f"Unique UI string candidates: {len(unique_texts)}")
print(f"Dictionary candidates: {len(dictionary_candidates)}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Candidate JSON: {candidate_json}")
print(f"Dictionary JSON: {dictionary_json}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: REVIEW_AND_BUILD_CANONICAL_ENGLISH_MASTER_JSON")
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
  throw "S10.9M English master extraction blocked"
}
