param(
  [string]$ProjectRoot=(Get-Location).Path,
  [int]$BatchSize=35,
  [string]$TranslationModel="gpt-5.6-luna"
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9u_generate_missing_landing_locales_$stamp.py"

$python=@'
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
batch_size = int(sys.argv[2])
model = str(sys.argv[3]).strip()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

audit = project / "audit_exports"
generated = project / "PROJECT_STATE" / "i18n_generated" / "landing_missing"
milestones = project / "PROJECT_STATE" / "milestones"

generated.mkdir(parents=True, exist_ok=True)
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

missing_files = sorted(
    audit.glob("S10_9T_LANDING_DICT_AST_AUDIT_missing_*.json"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
mapping_files = sorted(
    audit.glob("S10_9T_LANDING_DICT_AST_AUDIT_mapping_*.json"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)

if not missing_files:
    raise SystemExit("No S10_9T missing JSON found")
if not mapping_files:
    raise SystemExit("No S10_9T mapping JSON found")

missing_file = missing_files[0]
mapping_file = mapping_files[0]

missing_rows = json.loads(missing_file.read_text(encoding="utf-8-sig"))
mapping_rows = json.loads(mapping_file.read_text(encoding="utf-8-sig"))

if not isinstance(missing_rows, list):
    raise SystemExit("Missing JSON must be an array")
if not isinstance(mapping_rows, list):
    raise SystemExit("Mapping JSON must be an array")

def load_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.is_file():
        return result

    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")

    return result

env = {}
env.update(load_env(project / ".env"))
env.update(load_env(project / ".env.local"))
env.update(os.environ)

api_key = str(env.get("OPENAI_API_KEY") or "").strip()

if not api_key:
    raise SystemExit("OPENAI_API_KEY was not found")
if not model:
    raise SystemExit("Translation model was not provided")

target_locales = {
    "ru": "Russian",
    "uk": "Ukrainian",
    "zh": "Simplified Chinese",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "ar": "Modern Standard Arabic",
    "it": "Italian",
    "nb": "Norwegian Bokmål",
    "ka": "Georgian",
    "pl": "Polish",
    "tr": "Turkish",
    "el": "Greek",
    "hi": "Hindi",
}

protected_terms = sorted({
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
    "Signal-to-Journal",
    "TradingView",
    "VWAP",
    "EMA20",
    "RVOL",
    "PnL",
    "TP1",
    "TP2",
    "RR",
    "CSV",
    "XLSX",
    "USDT",
    "TRC20",
    "Long",
    "Short",
    "Core",
    "Edge",
    "Elite",
})

whole_value_protected = {
    "EN",
    "01",
    "02",
    "03",
    "04",
    "05",
    "Edge+",
    "AI Coach",
    "AI Alerts",
    "AI Scanner",
    "AI Market Brief",
    "Personal Edge",
    "Signal-to-Journal",
    "Strategy OS",
    "TradingView",
    "Market Intelligence",
}

# The AST audit classified slash-prefixed billing periods as routes.
# They are visible UI and must be translated.
period_rows = []
for row in mapping_rows:
    if not isinstance(row, dict):
        continue

    path = str(row.get("path") or "")
    text = str(row.get("text") or "")

    if path in {
        "dict.en.pricingPage.period.monthly",
        "dict.en.pricingPage.period.halfyear",
        "dict.en.pricingPage.period.yearly",
    }:
        period_rows.append({
            "provisionalKey": "",
            "text": text,
            "paths": [path],
            "nearestNamedKeys": ["period"],
            "firstLine": row.get("line"),
        })

all_rows = list(missing_rows) + period_rows

# Deduplicate by exact English value while preserving all AST paths.
by_text: dict[str, dict] = {}

for row in all_rows:
    if not isinstance(row, dict):
        continue

    text = str(row.get("text") or "").strip()
    if not text:
        continue

    if text not in by_text:
        by_text[text] = {
            "text": text,
            "paths": [],
            "nearestNamedKeys": set(),
            "firstLine": row.get("firstLine"),
        }

    current = by_text[text]

    for path in row.get("paths") or []:
        if path not in current["paths"]:
            current["paths"].append(path)

    for key in row.get("nearestNamedKeys") or []:
        current["nearestNamedKeys"].add(str(key))

def stable_key(text: str, paths: list[str]) -> str:
    source = text + "\n" + "\n".join(sorted(paths))
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]
    return f"landing.ast.{digest}"

entries = []

for item in by_text.values():
    key = stable_key(item["text"], item["paths"])
    entries.append({
        "canonicalKey": key,
        "text": item["text"],
        "paths": sorted(item["paths"]),
        "nearestNamedKeys": sorted(item["nearestNamedKeys"]),
        "firstLine": item["firstLine"],
        "wholeValueProtected": item["text"] in whole_value_protected,
    })

entries.sort(key=lambda row: (
    row["firstLine"] if isinstance(row["firstLine"], int) else 10**9,
    row["text"],
))

english = {
    row["canonicalKey"]: row["text"]
    for row in entries
}
path_map = {}

for row in entries:
    for ast_path in row["paths"]:
        path_map[ast_path] = row["canonicalKey"]

placeholder_pattern = re.compile(r"\{[^{}]+\}")

def extract_output_text(response: dict) -> str:
    direct = response.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    chunks = []

    for item in response.get("output") or []:
        if not isinstance(item, dict):
            continue

        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue

            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)

    return "\n".join(chunks).strip()

def parse_json(text: str) -> dict:
    cleaned = text.strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        value = json.loads(match.group(0))

    if not isinstance(value, dict):
        raise ValueError("Translation response is not a JSON object")

    return value

def call_api(locale_code: str, locale_name: str, batch: dict) -> dict:
    instructions = (
        "You translate client-facing UI copy for SkillEdge AI, a premium trading SaaS. "
        f"Translate every JSON value from English into {locale_name}. "
        "Return only a valid JSON object with exactly the same keys. "
        "Keep copy natural, concise, premium and professional. "
        "Preserve all numbers and placeholders exactly. "
        "Preserve product, plan and trading terminology listed below exactly wherever it appears. "
        "Do not promise profit. Do not add explanations. "
        f"Protected terms: {json.dumps(protected_terms, ensure_ascii=False)}"
    )

    payload = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(batch, ensure_ascii=False),
        "store": False,
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    last_error = None

    for attempt in range(1, 5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                body = json.loads(response.read().decode("utf-8"))

            output = parse_json(extract_output_text(body))
            return output

        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            RuntimeError,
            json.JSONDecodeError,
            ValueError,
        ) as error:
            last_error = error

            if attempt >= 4:
                break

            time.sleep(min(attempt * 3, 10))

    raise RuntimeError(
        f"Translation failed for {locale_code}: {last_error}"
    )

def validate(source: dict, translated: dict, protected_keys: set[str]) -> list[str]:
    issues = []
    source_keys = set(source)
    target_keys = set(translated)

    if source_keys != target_keys:
        issues.append(
            f"key mismatch missing={sorted(source_keys-target_keys)} "
            f"extra={sorted(target_keys-source_keys)}"
        )

    for key, source_text in source.items():
        value = translated.get(key)

        if not isinstance(value, str) or not value.strip():
            issues.append(f"{key}: empty or non-string")
            continue

        if placeholder_pattern.findall(source_text) != placeholder_pattern.findall(value):
            issues.append(f"{key}: placeholder mismatch")

        if key in protected_keys and value != source_text:
            issues.append(
                f"{key}: whole protected value changed "
                f"{source_text!r} -> {value!r}"
            )

        for term in protected_terms:
            if term in source_text and term not in value:
                issues.append(f"{key}: protected term missing: {term}")

    return issues

english_file = generated / "en.json"
manifest_file = generated / "manifest.json"
path_map_file = generated / "path-map.json"

english_file.write_text(
    json.dumps(english, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
manifest_file.write_text(
    json.dumps(entries, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
path_map_file.write_text(
    json.dumps(path_map, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

all_keys = list(english.keys())
protected_keys = {
    row["canonicalKey"]
    for row in entries
    if row["wholeValueProtected"]
}

generation_log = {
    "model": model,
    "sourceMissingFile": str(missing_file),
    "sourceMappingFile": str(mapping_file),
    "batchSize": batch_size,
    "uniqueEntries": len(entries),
    "pathAssignments": len(path_map),
    "periodRowsRestored": len(period_rows),
    "locales": {},
}

for locale_code, locale_name in target_locales.items():
    checkpoint = generated / f"{locale_code}.checkpoint.json"
    output_file = generated / f"{locale_code}.json"

    completed = {}

    if checkpoint.is_file():
        try:
            loaded = json.loads(checkpoint.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                completed.update(loaded)
        except json.JSONDecodeError:
            pass

    generated_batches = 0

    for start in range(0, len(all_keys), batch_size):
        keys = all_keys[start:start + batch_size]

        if all(key in completed for key in keys):
            continue

        batch = {key: english[key] for key in keys}
        api_batch = {
            key: value
            for key, value in batch.items()
            if key not in protected_keys
        }

        translated = {
            key: value
            for key, value in batch.items()
            if key in protected_keys
        }

        if api_batch:
            translated.update(
                call_api(locale_code, locale_name, api_batch)
            )

        issues = validate(batch, translated, protected_keys)

        if issues:
            raise SystemExit(
                f"Validation failed for {locale_code}: "
                + " | ".join(issues[:20])
            )

        completed.update(translated)
        checkpoint.write_text(
            json.dumps(completed, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        generated_batches += 1
        print(
            f"{locale_code}: "
            f"{min(start+batch_size, len(all_keys))}/{len(all_keys)}"
        )

    ordered = {key: completed[key] for key in all_keys}

    final_issues = validate(english, ordered, protected_keys)
    if final_issues:
        raise SystemExit(
            f"Final validation failed for {locale_code}: "
            + " | ".join(final_issues[:20])
        )

    output_file.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    generation_log["locales"][locale_code] = {
        "entries": len(ordered),
        "batchesGeneratedThisRun": generated_batches,
        "issues": [],
        "file": str(output_file),
    }

summary = {
    "ok": True,
    "classification": "MISSING_LANDING_TRANSLATIONS_GENERATED",
    "productionMutation": False,
    "vpsTouched": False,
    "runtimeAiTranslation": False,
    "existingProviderUsed": "OpenAI API",
    "oneTimeApiUsage": True,
    "model": model,
    "missingRowsRead": len(missing_rows),
    "periodRowsRestored": len(period_rows),
    "uniqueEntriesGenerated": len(entries),
    "pathAssignments": len(path_map),
    "generatedLocales": len(target_locales),
    "generatedFiles": 1 + len(target_locales),
    "outputDirectory": str(generated),
    "nextAction": "VALIDATE_AND_MERGE_COMPLETE_LANDING_LOCALES",
}

raw = audit / f"S10_9U_MISSING_LANDING_TRANSLATIONS_raw_{stamp}.json"
report = audit / f"S10_9U_MISSING_LANDING_TRANSLATIONS_report_{stamp}.txt"
log_file = audit / f"S10_9U_MISSING_LANDING_TRANSLATIONS_generation_{stamp}.json"
milestone = milestones / f"S10_9U_MISSING_LANDING_TRANSLATIONS_{stamp}.md"

raw.write_text(
    json.dumps(summary, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
log_file.write_text(
    json.dumps(generation_log, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report.write_text(
    "\n".join([
        "S10.9U MISSING LANDING TRANSLATIONS",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=MISSING_LANDING_TRANSLATIONS_GENERATED",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        "RUNTIME_AI_TRANSLATION=False",
        "EXISTING_PROVIDER_USED=OpenAI API",
        "ONE_TIME_API_USAGE=True",
        f"MODEL={model}",
        f"MISSING_ROWS_READ={len(missing_rows)}",
        f"PERIOD_ROWS_RESTORED={len(period_rows)}",
        f"UNIQUE_ENTRIES_GENERATED={len(entries)}",
        f"PATH_ASSIGNMENTS={len(path_map)}",
        f"GENERATED_LOCALES={len(target_locales)}",
        f"OUTPUT_DIRECTORY={generated}",
        f"GENERATION_LOG={log_file}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=VALIDATE_AND_MERGE_COMPLETE_LANDING_LOCALES",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9U Missing Landing Translations",
        "",
        "- OK: True",
        f"- Unique entries generated: {len(entries)}",
        f"- AST path assignments: {len(path_map)}",
        f"- Billing period rows restored: {len(period_rows)}",
        f"- Generated locales: {len(target_locales)}",
        "- Runtime AI translation: False",
        "- Production mutation: False",
        "- VPS touched: False",
        "- Next: validate and merge complete Landing locales",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9U COMPLETE ===")
print("OK: True")
print("Classification: MISSING_LANDING_TRANSLATIONS_GENERATED")
print(f"Model: {model}")
print(f"Missing rows read: {len(missing_rows)}")
print(f"Billing period rows restored: {len(period_rows)}")
print(f"Unique entries generated: {len(entries)}")
print(f"AST path assignments: {len(path_map)}")
print(f"Generated locales: {len(target_locales)}")
print("Runtime AI translation: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"Output directory: {generated}")
print(f"Generation log: {log_file}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: VALIDATE_AND_MERGE_COMPLETE_LANDING_LOCALES")
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
  & py -3 $runner $ProjectRoot $BatchSize $TranslationModel
}else{
  & $pythonPath $runner $ProjectRoot $BatchSize $TranslationModel
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9U missing Landing translation generation blocked"
}
