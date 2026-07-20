param(
  [string]$ProjectRoot=(Get-Location).Path,
  [int]$BatchSize=40
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9p_generate_landing_locales_$stamp.py"

$python=@'
from __future__ import annotations

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
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

exports = project / "PROJECT_STATE" / "i18n_exports"
generated_root = project / "PROJECT_STATE" / "i18n_generated" / "landing"
audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"

generated_root.mkdir(parents=True, exist_ok=True)
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

master_files = sorted(
    [
        path
        for path in exports.glob("landing_en_master_*.json")
        if "_review_" not in path.name
        and path.name.startswith("landing_en_master_")
    ],
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)

manifest_files = sorted(
    exports.glob("landing_translation_manifest_*.json"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)

if not master_files:
    raise SystemExit("No landing_en_master_*.json found")

if not manifest_files:
    raise SystemExit("No landing_translation_manifest_*.json found")

master_file = master_files[0]
manifest_file = manifest_files[0]

master = json.loads(master_file.read_text(encoding="utf-8"))
manifest = json.loads(manifest_file.read_text(encoding="utf-8"))

if not isinstance(master, dict) or not master:
    raise SystemExit(
        f"Landing English master is empty or invalid: {master_file.name}"
    )

entries = manifest.get("entries") or []
entry_meta = {
    row.get("canonicalKey"): row
    for row in entries
    if isinstance(row, dict) and row.get("canonicalKey")
}

def load_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}

    if not path.is_file():
        return result

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key:
            result[key] = value

    return result

env_values = {}
env_values.update(load_env_file(project / ".env"))
env_values.update(load_env_file(project / ".env.local"))
env_values.update(os.environ)

api_key = env_values.get("OPENAI_API_KEY", "").strip()
model = (
    env_values.get("OPENAI_TRANSLATION_MODEL", "").strip()
    or env_values.get("OPENAI_MODEL", "").strip()
)

if not api_key:
    raise SystemExit("OPENAI_API_KEY was not found")

if not model:
    raise SystemExit(
        "Set OPENAI_TRANSLATION_MODEL or OPENAI_MODEL in .env.local"
    )

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
    row.get("text")
    for row in entries
    if isinstance(row, dict)
    and row.get("protected")
    and row.get("text")
})

protected_terms.extend([
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
])

protected_terms = sorted(set(protected_terms))

placeholder_pattern = re.compile(r"\{[^{}]+\}")

def extract_output_text(response: dict) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]

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

def parse_json_object(text: str) -> dict:
    text = text.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)

        if not match:
            raise

        value = json.loads(match.group(0))

    if not isinstance(value, dict):
        raise ValueError("Translation response is not a JSON object")

    return value

def call_openai(locale_code: str, locale_name: str, batch: dict) -> dict:
    instructions = (
        "You are the localization engine for SkillEdge AI, a premium trading SaaS. "
        f"Translate every JSON value from English into {locale_name}. "
        "Return only one valid JSON object with exactly the same keys. "
        "Do not add commentary. Preserve placeholders exactly. "
        "Preserve brand names, ticker symbols, trading abbreviations and protected terms. "
        "Keep the tone concise, premium, professional and natural for a trading product. "
        "Do not translate setup names when they are clearly canonical product/setup names. "
        "Do not promise profit and do not soften risk language. "
        f"Protected terms: {json.dumps(protected_terms, ensure_ascii=False)}"
    )

    payload = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(batch, ensure_ascii=False),
        "store": False,
        "temperature": 0.1,
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

            output_text = extract_output_text(body)

            if not output_text:
                raise RuntimeError("OpenAI response did not contain output text")

            return parse_json_object(output_text)

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

            time.sleep(min(3 * attempt, 10))

    raise RuntimeError(
        f"Translation failed for {locale_code}: {last_error}"
    )

def validate_batch(source: dict, translated: dict) -> list[str]:
    issues = []

    source_keys = set(source)
    translated_keys = set(translated)

    if source_keys != translated_keys:
        missing = sorted(source_keys - translated_keys)
        extra = sorted(translated_keys - source_keys)
        issues.append(f"key mismatch missing={missing} extra={extra}")

    for key, source_text in source.items():
        translated_text = translated.get(key)

        if not isinstance(translated_text, str) or not translated_text.strip():
            issues.append(f"{key}: empty/non-string translation")
            continue

        source_placeholders = placeholder_pattern.findall(source_text)
        translated_placeholders = placeholder_pattern.findall(translated_text)

        if source_placeholders != translated_placeholders:
            issues.append(
                f"{key}: placeholder mismatch "
                f"{source_placeholders} != {translated_placeholders}"
            )

        meta = entry_meta.get(key) or {}

        if meta.get("protected") and translated_text != source_text:
            issues.append(
                f"{key}: protected text changed "
                f"{source_text!r} -> {translated_text!r}"
            )

    return issues

english_output = generated_root / "en.json"
english_output.write_text(
    json.dumps(master, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

all_keys = list(master.keys())
generation_report = {
    "model": model,
    "masterFile": str(master_file),
    "manifestFile": str(manifest_file),
    "batchSize": batch_size,
    "englishEntries": len(master),
    "locales": {},
}

for locale_code, locale_name in target_locales.items():
    locale_dir = generated_root / locale_code
    locale_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_file = locale_dir / "checkpoint.json"
    final_file = generated_root / f"{locale_code}.json"

    completed = {}

    if checkpoint_file.is_file():
        try:
            checkpoint = json.loads(
                checkpoint_file.read_text(encoding="utf-8")
            )

            if isinstance(checkpoint, dict):
                completed.update(checkpoint)
        except json.JSONDecodeError:
            pass

    locale_issues = []
    batches_done = 0

    for start in range(0, len(all_keys), batch_size):
        keys = all_keys[start:start + batch_size]

        if all(key in completed for key in keys):
            continue

        batch = {
            key: master[key]
            for key in keys
        }

        translated = call_openai(
            locale_code,
            locale_name,
            batch,
        )

        issues = validate_batch(batch, translated)

        if issues:
            locale_issues.extend(
                [f"batch {start // batch_size + 1}: {issue}" for issue in issues]
            )
            raise SystemExit(
                f"Validation failed for {locale_code}: "
                + " | ".join(issues[:10])
            )

        completed.update(translated)
        checkpoint_file.write_text(
            json.dumps(completed, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        batches_done += 1
        print(
            f"{locale_code}: "
            f"{min(start + batch_size, len(all_keys))}/{len(all_keys)}"
        )

    ordered = {
        key: completed[key]
        for key in all_keys
    }

    final_file.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    generation_report["locales"][locale_code] = {
        "entries": len(ordered),
        "batchesGeneratedThisRun": batches_done,
        "issues": locale_issues,
        "file": str(final_file),
    }

summary = {
    "ok": True,
    "classification": "LANDING_AI_LOCALE_GENERATION_COMPLETE",
    "productionMutation": False,
    "vpsTouched": False,
    "runtimeAiTranslation": False,
    "existingProviderUsed": "OpenAI API",
    "oneTimeApiUsage": True,
    "model": model,
    "englishEntries": len(master),
    "generatedLocales": len(target_locales),
    "generatedFiles": 1 + len(target_locales),
    "outputDirectory": str(generated_root),
    "nextAction": "VALIDATE_AND_CONNECT_LANDING_LOCALE_FILES",
}

raw = audit / f"S10_9P_LANDING_AI_LOCALES_raw_{stamp}.json"
report = audit / f"S10_9P_LANDING_AI_LOCALES_report_{stamp}.txt"
milestone = milestones / f"S10_9P_LANDING_AI_LOCALES_{stamp}.md"
generation_log = (
    audit / f"S10_9P_LANDING_AI_LOCALES_generation_{stamp}.json"
)

raw.write_text(
    json.dumps(summary, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
generation_log.write_text(
    json.dumps(generation_report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report.write_text(
    "\n".join([
        "S10.9P LANDING AI LOCALE GENERATION",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=LANDING_AI_LOCALE_GENERATION_COMPLETE",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        "RUNTIME_AI_TRANSLATION=False",
        "EXISTING_PROVIDER_USED=OpenAI API",
        "ONE_TIME_API_USAGE=True",
        f"MODEL={model}",
        f"ENGLISH_ENTRIES={len(master)}",
        f"GENERATED_LOCALES={len(target_locales)}",
        f"GENERATED_FILES={1 + len(target_locales)}",
        f"OUTPUT_DIRECTORY={generated_root}",
        f"GENERATION_LOG={generation_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=VALIDATE_AND_CONNECT_LANDING_LOCALE_FILES",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9P Landing AI Locale Generation",
        "",
        "- OK: True",
        "- Existing provider: OpenAI API",
        "- One-time development usage: True",
        f"- Model: {model}",
        f"- English entries: {len(master)}",
        f"- Generated locales: {len(target_locales)}",
        "- Runtime AI translation: False",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Output: {generated_root}",
        "- Next: validate and connect Landing locale files",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9P COMPLETE ===")
print("OK: True")
print("Classification: LANDING_AI_LOCALE_GENERATION_COMPLETE")
print(f"Model: {model}")
print(f"English entries: {len(master)}")
print(f"Generated locales: {len(target_locales)}")
print(f"Generated files: {1 + len(target_locales)}")
print("Runtime AI translation: False")
print("Production mutation: False")
print("VPS touched: False")
print(f"Output directory: {generated_root}")
print(f"Generation log: {generation_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: VALIDATE_AND_CONNECT_LANDING_LOCALE_FILES")
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
  & py -3 $runner $ProjectRoot $BatchSize
}else{
  & $pythonPath $runner $ProjectRoot $BatchSize
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9P Landing AI locale generation blocked"
}
