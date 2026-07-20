param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9n_build_clean_english_master_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

exports = project / "PROJECT_STATE" / "i18n_exports"
audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
exports.mkdir(parents=True, exist_ok=True)

candidate_files = sorted(
    exports.glob("english_master_candidates_*.json"),
    key=lambda p: p.stat().st_mtime,
    reverse=True,
)
dictionary_files = sorted(
    exports.glob("english_dictionary_candidates_*.json"),
    key=lambda p: p.stat().st_mtime,
    reverse=True,
)

if not candidate_files:
    raise SystemExit("No english_master_candidates_*.json found")

if not dictionary_files:
    raise SystemExit("No english_dictionary_candidates_*.json found")

candidate_source = candidate_files[0]
dictionary_source = dictionary_files[0]

records = json.loads(candidate_source.read_text(encoding="utf-8"))
dictionary_records = json.loads(dictionary_source.read_text(encoding="utf-8"))

allowed_files = (
    "components/Landing.tsx",
    "app/dashboard/page.tsx",
    "components/dashboard/",
    "components/GlobalAlertsWidget.tsx",
    "components/SupportWidget.tsx",
    "components/marketing/SiteFooter.tsx",
    "app/referral/page.tsx",
    "app/dashboard-guide/page.tsx",
    "app/ai-guide/page.tsx",
    "app/journal-guide/page.tsx",
    "lib/i18n/dictionaries.ts",
    "lib/trading/signal-text-i18n.ts",
)

excluded_files = (
    "/admin/",
    "components/admin/",
    "/api/",
    "lib/ai/",
    "lib/trading/setup-playbook.ts",
    "lib/trading/market-alert-generator.ts",
    "lib/trading/signal-ai-validator.ts",
    "lib/trading/skill-edge-alert-engine.ts",
    "lib/trading/signal-confidence.ts",
    "lib/trading/price-action-patterns.ts",
)

tailwind_tokens = {
    "flex", "grid", "block", "relative", "absolute", "fixed", "sticky",
    "hidden", "inline", "items", "justify", "gap", "rounded", "border",
    "bg", "text", "font", "tracking", "leading", "shadow", "backdrop",
    "hover", "focus", "transition", "duration", "overflow", "w", "h",
    "px", "py", "p", "m", "mt", "mb", "ml", "mr", "mx", "my",
    "top", "left", "right", "bottom", "inset", "z", "opacity",
    "sm", "md", "lg", "xl",
}

technical_patterns = [
    re.compile(r"^use client$"),
    re.compile(r"^[A-Za-z0-9_., ]+\bid\b.*\bstatus\b", re.I),
    re.compile(r"^[A-Za-z0-9_]+(?:,\s*[A-Za-z0-9_]+)+$"),
    re.compile(r"^[.#/@]"),
    re.compile(r"^https?://"),
    re.compile(r"^/api/"),
    re.compile(r"^\w+Id is required\.$"),
    re.compile(r"^[A-Z0-9_]{3,}$"),
    re.compile(r"^\s*[,:;{}()\[\]=>]+\s*$"),
    re.compile(r"\b(className|option value|language ===|reaction ===)\b"),
    re.compile(r"^\s*>\s*$"),
]

protected_terms = {
    "SkillEdge AI",
    "SkillEdge",
    "SkillEdge Core",
    "SkillEdge Edge",
    "SkillEdge Elite",
    "Personal Edge",
    "Strategy OS",
    "AI Trading Desk",
    "Market Intelligence",
    "Desk Coach",
    "AI Coach",
    "AI Alerts",
    "AI Market Brief",
    "VWAP Reclaim Long",
    "VWAP Rejection Short",
    "Premarket Pump Short",
    "Gap and Crap Short",
    "Failed Breakout / Stuff",
    "Pullback Continuation Long",
    "Opening Range Breakout",
    "Opening Range Breakdown",
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

def is_allowed_file(file: str) -> bool:
    if any(token in file for token in excluded_files):
        return False

    return (
        file in allowed_files
        or any(
            prefix.endswith("/") and file.startswith(prefix)
            for prefix in allowed_files
        )
    )

def looks_like_tailwind(value: str) -> bool:
    if len(value) < 8:
        return False

    parts = re.split(r"\s+", value.strip())

    if len(parts) < 2:
        return False

    class_like = 0

    for part in parts:
        base = re.split(r"[-:/\[\]]", part)[0]

        if (
            base in tailwind_tokens
            or part.startswith((
                "text-", "bg-", "border-", "rounded-", "shadow-",
                "hover:", "focus:", "md:", "sm:", "lg:", "xl:",
                "grid-", "flex-", "items-", "justify-", "gap-",
                "px-", "py-", "p-", "m-", "mt-", "mb-", "w-", "h-",
                "absolute", "relative", "overflow-", "tracking-",
                "leading-", "backdrop-", "transition", "duration-",
            ))
        ):
            class_like += 1

    return class_like / max(len(parts), 1) >= 0.55

def is_user_facing(value: str) -> bool:
    value = value.strip()

    if not value:
        return False

    if len(value) > 420:
        return False

    if looks_like_tailwind(value):
        return False

    if any(pattern.search(value) for pattern in technical_patterns):
        return False

    if value.count("{") + value.count("}") >= 3:
        return False

    if value.count("\n") > 1:
        return False

    if re.search(r"\b(select|insert|update|delete)\b", value, re.I):
        return False

    if re.fullmatch(r"[A-Za-z0-9_-]+", value) and len(value) < 12:
        return False

    has_words = re.search(r"[A-Za-z]{2,}", value) is not None
    has_ui_signal = (
        " " in value
        or any(ch in value for ch in "!?.,:/—–")
        or value in protected_terms
    )

    return has_words and has_ui_signal

filtered = []
seen = set()
rejected = defaultdict(int)

for row in records:
    file = str(row.get("file") or "")
    value = str(row.get("text") or "").strip()

    if not is_allowed_file(file):
        rejected["file_not_client_ui"] += 1
        continue

    if not is_user_facing(value):
        rejected["not_user_facing"] += 1
        continue

    normalized = re.sub(r"\s+", " ", value).strip()

    if normalized in seen:
        rejected["duplicate"] += 1
        continue

    seen.add(normalized)

    filtered.append({
        "sourceFile": file,
        "sourceLine": row.get("line"),
        "text": normalized,
        "protected": normalized in protected_terms,
    })

dictionary_filtered = []
dictionary_seen = set()

for row in dictionary_records:
    file = str(row.get("file") or "")
    key = str(row.get("key") or "").strip()
    value = str(row.get("value") or "").strip()

    if not is_allowed_file(file):
        continue

    if not key or not is_user_facing(value):
        continue

    pair = (key, value)

    if pair in dictionary_seen:
        continue

    dictionary_seen.add(pair)

    dictionary_filtered.append({
        "sourceFile": file,
        "sourceKey": key,
        "text": value,
        "protected": value in protected_terms,
    })

# Build deterministic provisional keys. These are review keys, not yet wired
# into production components.
namespaces = {
    "components/Landing.tsx": "landing",
    "app/dashboard/page.tsx": "dashboard",
    "components/dashboard/": "dashboard",
    "components/GlobalAlertsWidget.tsx": "alerts",
    "components/SupportWidget.tsx": "support",
    "components/marketing/SiteFooter.tsx": "footer",
    "app/referral/page.tsx": "referral",
    "app/dashboard-guide/page.tsx": "dashboardGuide",
    "app/ai-guide/page.tsx": "aiGuide",
    "app/journal-guide/page.tsx": "journalGuide",
    "lib/i18n/dictionaries.ts": "shared",
    "lib/trading/signal-text-i18n.ts": "signals",
}

def namespace_for(file: str) -> str:
    for prefix, namespace in namespaces.items():
        if file == prefix or (
            prefix.endswith("/") and file.startswith(prefix)
        ):
            return namespace

    return "shared"

def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\{[^}]+\}", " value ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    words = [word for word in value.split() if word][:8]

    if not words:
        return "text"

    return ".".join(words)

master = {}
collision_counts = defaultdict(int)

for row in filtered:
    namespace = namespace_for(row["sourceFile"])
    base = f"{namespace}.{slugify(row['text'])}"
    collision_counts[base] += 1
    key = (
        base
        if collision_counts[base] == 1
        else f"{base}.{collision_counts[base]}"
    )
    master[key] = row["text"]
    row["provisionalKey"] = key

# Dictionary candidates are preserved separately to avoid blindly creating
# conflicting duplicate keys.
summary = {
    "ok": True,
    "classification": "CLEAN_ENGLISH_MASTER_CANDIDATE_BUILT",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "sourceCandidateFile": str(candidate_source),
    "sourceDictionaryFile": str(dictionary_source),
    "rawCandidatesRead": len(records),
    "dictionaryCandidatesRead": len(dictionary_records),
    "cleanUiCandidates": len(filtered),
    "cleanDictionaryCandidates": len(dictionary_filtered),
    "protectedTermsFound": sum(
        1 for row in filtered if row["protected"]
    ),
    "rejected": dict(rejected),
    "namespaces": sorted(set(
        namespace_for(row["sourceFile"]) for row in filtered
    )),
    "nextAction": "REVIEW_CLEAN_MASTER_THEN_GENERATE_LOCALE_FILES",
}

clean_master = exports / f"canonical_en_master_candidate_{stamp}.json"
clean_records = exports / f"canonical_en_master_review_{stamp}.json"
clean_dictionary = exports / f"canonical_dictionary_review_{stamp}.json"
raw = audit / f"S10_9N_CLEAN_ENGLISH_MASTER_raw_{stamp}.json"
report = audit / f"S10_9N_CLEAN_ENGLISH_MASTER_report_{stamp}.txt"
milestone = milestones / f"S10_9N_CLEAN_ENGLISH_MASTER_{stamp}.md"

clean_master.write_text(
    json.dumps(master, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
clean_records.write_text(
    json.dumps(filtered, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
clean_dictionary.write_text(
    json.dumps(dictionary_filtered, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
raw.write_text(
    json.dumps(summary, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9N CLEAN ENGLISH MASTER",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=CLEAN_ENGLISH_MASTER_CANDIDATE_BUILT",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    f"RAW_CANDIDATES_READ={len(records)}",
    f"DICTIONARY_CANDIDATES_READ={len(dictionary_records)}",
    f"CLEAN_UI_CANDIDATES={len(filtered)}",
    f"CLEAN_DICTIONARY_CANDIDATES={len(dictionary_filtered)}",
    f"PROTECTED_TERMS_FOUND={summary['protectedTermsFound']}",
    "",
    "=== REJECTED ===",
]

for reason, count in sorted(rejected.items()):
    report_lines.append(f"{reason}={count}")

report_lines += [
    "",
    "=== NAMESPACES ===",
    *summary["namespaces"],
    "",
    f"CANONICAL_MASTER_CANDIDATE={clean_master}",
    f"REVIEW_FILE={clean_records}",
    f"DICTIONARY_REVIEW_FILE={clean_dictionary}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=REVIEW_CLEAN_MASTER_THEN_GENERATE_LOCALE_FILES",
]

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9N Clean English Master",
        "",
        "- OK: True",
        "- Inspection only: True",
        f"- Raw candidates read: {len(records)}",
        f"- Clean UI candidates: {len(filtered)}",
        f"- Clean dictionary candidates: {len(dictionary_filtered)}",
        f"- Protected terms found: {summary['protectedTermsFound']}",
        "- Production mutation: False",
        "- VPS touched: False",
        "- Next: review and locale generation",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9N COMPLETE ===")
print("OK: True")
print("Classification: CLEAN_ENGLISH_MASTER_CANDIDATE_BUILT")
print(f"Raw candidates read: {len(records)}")
print(f"Clean UI candidates: {len(filtered)}")
print(f"Clean dictionary candidates: {len(dictionary_filtered)}")
print(f"Protected terms found: {summary['protectedTermsFound']}")
print("Inspection only: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Canonical master candidate: {clean_master}")
print(f"Review file: {clean_records}")
print(f"Dictionary review file: {clean_dictionary}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: REVIEW_CLEAN_MASTER_THEN_GENERATE_LOCALE_FILES")
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
  throw "S10.9N clean English master build blocked"
}
