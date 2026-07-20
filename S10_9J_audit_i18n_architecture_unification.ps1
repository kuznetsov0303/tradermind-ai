param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9j_i18n_architecture_audit_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

required = [
    project / "lib" / "i18n" / "config.ts",
    project / "components" / "Landing.tsx",
    project / "app" / "dashboard" / "page.tsx",
    project / "package.json",
]

for path in required:
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)

excluded_parts = {
    "node_modules",
    ".next",
    ".git",
    "audit_exports",
    "backups",
    "archives",
    "PROJECT_STATE",
}

allowed_suffixes = {".ts", ".tsx", ".js", ".jsx", ".json"}

source_files = []
for path in project.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in allowed_suffixes:
        continue

    rel_parts = set(path.relative_to(project).parts)
    if rel_parts & excluded_parts:
        continue

    source_files.append(path)

source_files.sort()

patterns = {
    "localeTypeDeclarations": re.compile(
        r'type\s+\w*(?:Language|Locale)\w*\s*=\s*[^;]+;',
        re.IGNORECASE | re.DOTALL,
    ),
    "languageStorage": re.compile(
        r'(?:localStorage|sessionStorage)\.(?:getItem|setItem)\([^)]*(?:language|locale)',
        re.IGNORECASE,
    ),
    "languageKey": re.compile(
        r'skilledge_language|language|locale',
        re.IGNORECASE,
    ),
    "dictionaryDeclarations": re.compile(
        r'(?:const|let|var)\s+\w*(?:dictionary|translations|messages|copy|locale)\w*\s*[:=]',
        re.IGNORECASE,
    ),
    "hardcodedLanguageBranches": re.compile(
        r'(?:language|locale)\s*===\s*["\'][a-zA-Z-]+["\']',
        re.IGNORECASE,
    ),
    "i18nImports": re.compile(
        r'from\s+["\'][^"\']*(?:i18n|locale|messages|translations)[^"\']*["\']',
        re.IGNORECASE,
    ),
    "rtlHandling": re.compile(
        r'\b(?:rtl|dir\s*=|direction)\b',
        re.IGNORECASE,
    ),
}

matches = {name: [] for name in patterns}
locale_like_files = []
translation_dirs = set()
json_locale_files = []

for path in source_files:
    rel = str(path.relative_to(project)).replace("\\", "/")
    lowered_rel = rel.lower()

    if any(token in lowered_rel for token in (
        "i18n",
        "locale",
        "translation",
        "messages",
        "dictionary",
    )):
        locale_like_files.append(rel)
        translation_dirs.add(str(Path(rel).parent).replace("\\", "/"))

    if path.suffix.lower() == ".json":
        stem = path.stem.lower()
        if re.fullmatch(r"[a-z]{2}(?:-[a-z]{2})?", stem):
            json_locale_files.append(rel)

    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        continue

    lines = text.splitlines()

    for category, pattern in patterns.items():
        for match in pattern.finditer(text):
            line_number = text.count("\n", 0, match.start()) + 1
            start = max(1, line_number - 3)
            end = min(len(lines), line_number + 5)

            matches[category].append({
                "file": rel,
                "line": line_number,
                "match": match.group(0)[:500],
                "context": [
                    f"{i}: {lines[i-1]}"
                    for i in range(start, end + 1)
                ],
            })

# Focused complete source capture for current i18n configuration and the
# known competing Landing language implementation.
focus_files = [
    project / "lib" / "i18n" / "config.ts",
    project / "components" / "Landing.tsx",
    project / "app" / "dashboard" / "page.tsx",
]

focus = {}
focus_terms = [
    "type Language",
    "type Locale",
    "skilledge_language",
    "localStorage",
    "setLanguage",
    "setLocale",
    "normalizeLocale",
    "SUPPORTED",
    "languages",
    "dictionary",
    "translations",
    "messages",
    "dir=",
    "rtl",
]

for path in focus_files:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    contexts = []
    seen = set()

    for index, line in enumerate(lines):
        matched = [
            term for term in focus_terms
            if term.lower() in line.lower()
        ]
        if not matched:
            continue

        start = max(0, index - 6)
        end = min(len(lines), index + 13)
        key = (start, end)

        if key in seen:
            continue

        seen.add(key)
        contexts.append({
            "line": index + 1,
            "matchedTerms": matched,
            "context": [
                f"{line_no + 1}: {lines[line_no]}"
                for line_no in range(start, end)
            ],
        })

    focus[str(path.relative_to(project)).replace("\\", "/")] = contexts

package_text = (project / "package.json").read_text(encoding="utf-8-sig")
package_json = json.loads(package_text)
dependencies = {
    **package_json.get("dependencies", {}),
    **package_json.get("devDependencies", {}),
}

i18n_dependencies = {
    name: version
    for name, version in dependencies.items()
    if any(token in name.lower() for token in (
        "i18n",
        "intl",
        "translate",
        "locale",
    ))
}

result = {
    "ok": True,
    "classification": "I18N_ARCHITECTURE_UNIFICATION_AUDIT_COMPLETE",
    "inspectionOnly": True,
    "productionMutation": False,
    "vpsTouched": False,
    "realEnvRead": False,
    "secretValuesIncluded": False,
    "sourceFilesScanned": len(source_files),
    "localeLikeFiles": locale_like_files,
    "translationDirectories": sorted(translation_dirs),
    "jsonLocaleFiles": json_locale_files,
    "i18nDependencies": i18n_dependencies,
    "matchCounts": {
        name: len(items)
        for name, items in matches.items()
    },
    "matches": matches,
    "focusContexts": focus,
    "targetArchitecture": {
        "masterLocale": "en",
        "storageKey": "skilledge_language",
        "fallbackLocale": "en",
        "supportedLocales": [
            "en", "ru", "uk", "zh", "de", "fr", "es", "ar",
            "it", "nb", "ka", "pl", "tr", "el", "hi",
        ],
        "aliases": {
            "ua": "uk",
            "no": "nb",
        },
        "runtimeAiTranslation": False,
        "preGeneratedLocaleFiles": True,
    },
    "nextAction": "BUILD_UNIFIED_I18N_FOUNDATION_PATCH",
}

raw = audit / f"S10_9J_I18N_ARCHITECTURE_AUDIT_raw_{stamp}.json"
report = audit / f"S10_9J_I18N_ARCHITECTURE_AUDIT_report_{stamp}.txt"
milestone = milestones / f"S10_9J_I18N_ARCHITECTURE_AUDIT_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report_lines = [
    "S10.9J I18N ARCHITECTURE UNIFICATION AUDIT",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=I18N_ARCHITECTURE_UNIFICATION_AUDIT_COMPLETE",
    "INSPECTION_ONLY=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    "REAL_ENV_READ=False",
    "SECRET_VALUES_INCLUDED=False",
    f"SOURCE_FILES_SCANNED={len(source_files)}",
    f"I18N_DEPENDENCIES={json.dumps(i18n_dependencies, ensure_ascii=False)}",
    f"JSON_LOCALE_FILES={len(json_locale_files)}",
    "",
    "=== LOCALE-LIKE FILES ===",
    *locale_like_files,
    "",
    "=== TRANSLATION DIRECTORIES ===",
    *sorted(translation_dirs),
    "",
    "=== JSON LOCALE FILES ===",
    *json_locale_files,
    "",
    "=== MATCH COUNTS ===",
]

for name, items in matches.items():
    report_lines.append(f"{name}={len(items)}")

for category, items in matches.items():
    report_lines.append("")
    report_lines.append(f"=== {category.upper()} ===")

    for item in items:
        report_lines.append("")
        report_lines.append(
            f"-- {item['file']}:{item['line']} --"
        )
        report_lines.extend(item["context"])

report_lines.append("")
report_lines.append("=== FOCUSED CURRENT IMPLEMENTATION ===")

for rel, contexts in focus.items():
    report_lines.append("")
    report_lines.append(f"## {rel}")

    for item in contexts:
        report_lines.append("")
        report_lines.append(
            f"-- line {item['line']} | terms={','.join(item['matchedTerms'])} --"
        )
        report_lines.extend(item["context"])

report_lines.extend([
    "",
    "=== TARGET ARCHITECTURE ===",
    "MASTER_LOCALE=en",
    "STORAGE_KEY=skilledge_language",
    "FALLBACK_LOCALE=en",
    "ALIASES=ua->uk,no->nb",
    "RUNTIME_AI_TRANSLATION=False",
    "PREGENERATED_LOCALE_FILES=True",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=BUILD_UNIFIED_I18N_FOUNDATION_PATCH",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9J i18n Architecture Audit",
        "",
        "- OK: True",
        "- Inspection only: True",
        "- Master locale: English",
        "- Storage key: skilledge_language",
        "- Fallback locale: English",
        "- Runtime AI translation: False",
        "- Pre-generated locale files: True",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Source files scanned: {len(source_files)}",
        "- Next: unified i18n foundation patch",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9J COMPLETE ===")
print("OK: True")
print("Classification: I18N_ARCHITECTURE_UNIFICATION_AUDIT_COMPLETE")
print(f"Source files scanned: {len(source_files)}")
print(f"Locale-like files: {len(locale_like_files)}")
print(f"JSON locale files: {len(json_locale_files)}")
print(f"I18n dependencies: {len(i18n_dependencies)}")
for name, items in matches.items():
    print(f"{name}: {len(items)}")
print("Inspection only: True")
print("Runtime AI translation: False")
print("Pre-generated locale files: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: BUILD_UNIFIED_I18N_FOUNDATION_PATCH")
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
  throw "S10.9J i18n architecture audit blocked"
}
