param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9o_landing_english_master_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

exports = project / "PROJECT_STATE" / "i18n_exports"
audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"

exports.mkdir(parents=True, exist_ok=True)
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

review_files = sorted(
    exports.glob("canonical_dictionary_review_*.json"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)

if not review_files:
    raise SystemExit(
        "No canonical_dictionary_review_*.json found in PROJECT_STATE/i18n_exports"
    )

source = review_files[0]
records = json.loads(source.read_text(encoding="utf-8"))

if not isinstance(records, list):
    raise SystemExit("Dictionary review must be a JSON array")

protected_terms = {
    "SkillEdge AI",
    "SkillEdge Core",
    "SkillEdge Edge",
    "SkillEdge Elite",
    "Personal Edge",
    "Strategy OS",
    "AI Trading Desk",
    "AI Alerts",
    "AI Coach",
    "AI Scanner",
    "AI Market Brief",
    "Market Intelligence",
    "VWAP",
    "EMA20",
    "RVOL",
    "PnL",
    "TP1",
    "TP2",
    "RR",
    "Long",
    "Short",
}

cyrillic = re.compile(r"[\u0400-\u04FF]")
non_latin_scripts = re.compile(
    r"[\u0370-\u03FF\u0600-\u06FF\u0900-\u097F\u10A0-\u10FF\u4E00-\u9FFF]"
)
mojibake = re.compile(r"(?:РІ|РЎ|Рµ|вЂ|Ð|Ñ)")

landing_records = [
    row
    for row in records
    if str(row.get("sourceFile") or "") == "components/Landing.tsx"
]

english_records = []
excluded = Counter()
occurrences = Counter()
seen_pairs = set()

for row in landing_records:
    source_key = str(row.get("sourceKey") or "").strip()
    text = str(row.get("text") or "").strip()

    if not source_key or not text:
        excluded["empty"] += 1
        continue

    if cyrillic.search(text):
        excluded["cyrillic"] += 1
        continue

    if non_latin_scripts.search(text):
        excluded["non_latin_script"] += 1
        continue

    if mojibake.search(text):
        excluded["mojibake"] += 1
        continue

    pair = (source_key, text)

    if pair in seen_pairs:
        excluded["duplicate_pair"] += 1
        continue

    seen_pairs.add(pair)
    occurrences[source_key] += 1
    occurrence = occurrences[source_key]

    canonical_key = (
        f"landing.{source_key}"
        if occurrence == 1
        else f"landing.{source_key}.{occurrence}"
    )

    english_records.append(
        {
            "canonicalKey": canonical_key,
            "sourceFile": "components/Landing.tsx",
            "sourceKey": source_key,
            "occurrence": occurrence,
            "text": text,
            "protected": (
                bool(row.get("protected"))
                or text in protected_terms
            ),
        }
    )

master = {
    row["canonicalKey"]: row["text"]
    for row in english_records
}

protected_found = [
    row
    for row in english_records
    if row["protected"]
]

duplicate_source_keys = {
    key: count
    for key, count in occurrences.items()
    if count > 1
}

# Translation manifest keeps context and protection metadata.
translation_manifest = {
    "sourceLocale": "en",
    "targetLocales": [
        "ru",
        "uk",
        "zh",
        "de",
        "fr",
        "es",
        "ar",
        "it",
        "nb",
        "ka",
        "pl",
        "tr",
        "el",
        "hi",
    ],
    "rules": {
        "preservePlaceholders": True,
        "preserveProtectedTerms": True,
        "preserveBrandNames": True,
        "fallbackLocale": "en",
        "runtimeAiTranslation": False,
    },
    "entries": english_records,
}

summary = {
    "ok": True,
    "classification": "LANDING_ENGLISH_MASTER_ISOLATED",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "sourceReviewFile": str(source),
    "landingRecordsRead": len(landing_records),
    "englishMasterEntries": len(english_records),
    "protectedEntries": len(protected_found),
    "duplicateSourceKeys": duplicate_source_keys,
    "excluded": dict(excluded),
    "targetLocales": 14,
    "nextAction": "GENERATE_LANDING_LOCALE_FILES",
}

master_file = exports / f"landing_en_master_{stamp}.json"
review_file = exports / f"landing_en_master_review_{stamp}.json"
manifest_file = exports / f"landing_translation_manifest_{stamp}.json"
raw = audit / f"S10_9O_LANDING_ENGLISH_MASTER_raw_{stamp}.json"
report = audit / f"S10_9O_LANDING_ENGLISH_MASTER_report_{stamp}.txt"
milestone = milestones / f"S10_9O_LANDING_ENGLISH_MASTER_{stamp}.md"

master_file.write_text(
    json.dumps(master, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
review_file.write_text(
    json.dumps(english_records, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
manifest_file.write_text(
    json.dumps(translation_manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
raw.write_text(
    json.dumps(summary, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9O LANDING ENGLISH MASTER",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=LANDING_ENGLISH_MASTER_ISOLATED",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"LANDING_RECORDS_READ={len(landing_records)}",
    f"ENGLISH_MASTER_ENTRIES={len(english_records)}",
    f"PROTECTED_ENTRIES={len(protected_found)}",
    f"DUPLICATE_SOURCE_KEYS={len(duplicate_source_keys)}",
    "",
    "=== EXCLUDED ===",
]

for reason, count in sorted(excluded.items()):
    report_lines.append(f"{reason}={count}")

report_lines += [
    "",
    "=== DUPLICATE SOURCE KEYS ===",
]

for key, count in sorted(duplicate_source_keys.items()):
    report_lines.append(f"{key}={count}")

report_lines += [
    "",
    f"MASTER_FILE={master_file}",
    f"REVIEW_FILE={review_file}",
    f"TRANSLATION_MANIFEST={manifest_file}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=GENERATE_LANDING_LOCALE_FILES",
]

report.write_text(
    "\n".join(report_lines) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join(
        [
            "# S10.9O Landing English Master",
            "",
            "- OK: True",
            "- Inspection only: True",
            f"- Landing records read: {len(landing_records)}",
            f"- English master entries: {len(english_records)}",
            f"- Protected entries: {len(protected_found)}",
            f"- Duplicate source keys separated: {len(duplicate_source_keys)}",
            "- Production mutation: False",
            "- VPS touched: False",
            "- Next: generate Landing locale files",
        ]
    )
    + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9O COMPLETE ===")
print("OK: True")
print("Classification: LANDING_ENGLISH_MASTER_ISOLATED")
print(f"Landing records read: {len(landing_records)}")
print(f"English master entries: {len(english_records)}")
print(f"Protected entries: {len(protected_found)}")
print(f"Duplicate source keys separated: {len(duplicate_source_keys)}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Master file: {master_file}")
print(f"Review file: {review_file}")
print(f"Translation manifest: {manifest_file}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: GENERATE_LANDING_LOCALE_FILES")
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
  throw "S10.9O Landing English master isolation blocked"
}
