param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9k_i18n_foundation_$stamp.py"

$python=@'
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

config = project / "lib" / "i18n" / "config.ts"
index_file = project / "lib" / "i18n" / "index.ts"
package_json = project / "package.json"

for path in (config, index_file, package_json):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9K_i18n_foundation_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

targets = [
    index_file,
    project / "lib" / "i18n" / "runtime.ts",
    project / "lib" / "i18n" / "glossary.ts",
    project / "scripts" / "i18n" / "validate-locales.mjs",
]

for source in targets:
    if source.is_file():
        backup = backup_root / source.relative_to(project)
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, backup)

def restore() -> None:
    for source in targets:
        backup = backup_root / source.relative_to(project)
        if backup.is_file():
            source.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup, source)
        elif source.exists():
            source.unlink()

runtime = project / "lib" / "i18n" / "runtime.ts"
glossary = project / "lib" / "i18n" / "glossary.ts"
validator = project / "scripts" / "i18n" / "validate-locales.mjs"

runtime.parent.mkdir(parents=True, exist_ok=True)
validator.parent.mkdir(parents=True, exist_ok=True)

runtime.write_text(
'''import {
  DEFAULT_LOCALE,
  LOCALE_META,
  getLocaleDirection,
  normalizeLocale,
  type Locale,
} from "./config";

export const SKILLEDGE_LANGUAGE_STORAGE_KEY = "skilledge_language";
export const SKILLEDGE_LANGUAGE_CHANGED_EVENT =
  "skilledge:language-changed";

export function getSavedLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(
    window.localStorage.getItem(SKILLEDGE_LANGUAGE_STORAGE_KEY)
  );
}

export function applyDocumentLocale(localeInput: string | null | undefined): Locale {
  const locale = normalizeLocale(localeInput);

  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
  }

  return locale;
}

export function saveLocale(localeInput: string | null | undefined): Locale {
  const locale = normalizeLocale(localeInput);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      SKILLEDGE_LANGUAGE_STORAGE_KEY,
      locale
    );

    window.dispatchEvent(
      new CustomEvent(SKILLEDGE_LANGUAGE_CHANGED_EVENT, {
        detail: { locale },
      })
    );
  }

  applyDocumentLocale(locale);
  return locale;
}

export function subscribeToLocaleChanges(
  callback: (locale: Locale) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{
      locale?: string;
      language?: string;
    }>;

    callback(
      normalizeLocale(
        customEvent.detail?.locale ??
          customEvent.detail?.language ??
          getSavedLocale()
      )
    );
  };

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === SKILLEDGE_LANGUAGE_STORAGE_KEY &&
      event.newValue
    ) {
      callback(normalizeLocale(event.newValue));
    }
  };

  window.addEventListener(
    SKILLEDGE_LANGUAGE_CHANGED_EVENT,
    onCustomEvent
  );
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(
      SKILLEDGE_LANGUAGE_CHANGED_EVENT,
      onCustomEvent
    );
    window.removeEventListener("storage", onStorage);
  };
}

export function getLocaleLabel(localeInput: string | null | undefined): string {
  const locale = normalizeLocale(localeInput);
  return LOCALE_META[locale]?.nativeLabel || locale.toUpperCase();
}
''',
encoding="utf-8",
)

glossary.write_text(
'''export const SKILLEDGE_PROTECTED_TERMS = [
  "SkillEdge AI",
  "SkillEdge",
  "Personal Edge",
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
  "R",
  "Long",
  "Short",
] as const;

export const SKILLEDGE_TERM_TRANSLATIONS = {
  signals: {
    en: "Signals",
    ru: "Сигналы",
    uk: "Сповіщення",
  },
  trade: {
    en: "Trade",
    ru: "Сделка",
    uk: "Угода",
  },
  watchlist: {
    en: "Watchlist",
    ru: "Список наблюдения",
    uk: "Список спостереження",
  },
} as const;
''',
encoding="utf-8",
)

validator.write_text(
'''import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const localeDir = path.join(root, "locales");
const requiredLocales = [
  "en",
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
];

const mojibakePatterns = [
  "РІ",
  "РЎ",
  "Рµ",
  "вЂ",
  "вњ",
  "Ð",
  "Ñ",
];

function flatten(value, prefix = "", output = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      flatten(child, nextKey, output);
    } else {
      output[nextKey] = child;
    }
  }

  return output;
}

if (!fs.existsSync(localeDir)) {
  console.log("I18N_LOCALE_DIRECTORY_NOT_CREATED_YET");
  process.exit(0);
}

const missingFiles = requiredLocales.filter(
  (locale) => !fs.existsSync(path.join(localeDir, `${locale}.json`))
);

if (missingFiles.length) {
  throw new Error(
    `Missing locale files: ${missingFiles.join(", ")}`
  );
}

const dictionaries = Object.fromEntries(
  requiredLocales.map((locale) => {
    const file = path.join(localeDir, `${locale}.json`);
    const raw = fs.readFileSync(file, "utf8");

    for (const pattern of mojibakePatterns) {
      if (raw.includes(pattern)) {
        throw new Error(
          `Mojibake pattern ${pattern} found in ${locale}.json`
        );
      }
    }

    return [locale, flatten(JSON.parse(raw))];
  })
);

const englishKeys = Object.keys(dictionaries.en).sort();

for (const locale of requiredLocales) {
  const keys = Object.keys(dictionaries[locale]).sort();
  const missing = englishKeys.filter((key) => !(key in dictionaries[locale]));
  const extra = keys.filter((key) => !(key in dictionaries.en));
  const empty = keys.filter(
    (key) =>
      typeof dictionaries[locale][key] !== "string" ||
      dictionaries[locale][key].trim() === ""
  );

  if (missing.length || extra.length || empty.length) {
    throw new Error(
      JSON.stringify(
        { locale, missing, extra, empty },
        null,
        2
      )
    );
  }
}

console.log("I18N_LOCALE_VALIDATION_PASSED");
console.log(`Locales: ${requiredLocales.length}`);
console.log(`English keys: ${englishKeys.length}`);
''',
encoding="utf-8",
)

index_text = index_file.read_text(encoding="utf-8-sig")

exports_to_add = [
    'export * from "./runtime";',
    'export * from "./glossary";',
]

for export_line in exports_to_add:
    if export_line not in index_text:
        if index_text and not index_text.endswith("\n"):
            index_text += "\n"
        index_text += export_line + "\n"

index_file.write_text(index_text, encoding="utf-8")

required_tokens = [
    'SKILLEDGE_LANGUAGE_STORAGE_KEY = "skilledge_language"',
    'SKILLEDGE_LANGUAGE_CHANGED_EVENT',
    'applyDocumentLocale',
    'subscribeToLocaleChanges',
    'SKILLEDGE_PROTECTED_TERMS',
    'I18N_LOCALE_VALIDATION_PASSED',
]

combined = (
    runtime.read_text(encoding="utf-8")
    + glossary.read_text(encoding="utf-8")
    + validator.read_text(encoding="utf-8")
)

for token in required_tokens:
    if token not in combined:
        restore()
        raise SystemExit(f"i18n foundation token missing: {token}")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9K_I18N_FOUNDATION_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "")
    + "\n--- STDERR ---\n"
    + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(
        f"Build failed; i18n foundation restored. See: {build_log}"
    )

result = {
    "ok": True,
    "classification": "UNIFIED_I18N_FOUNDATION_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "filesChanged": [
        "lib/i18n/index.ts",
        "lib/i18n/runtime.ts",
        "lib/i18n/glossary.ts",
        "scripts/i18n/validate-locales.mjs",
    ],
    "storageKey": "skilledge_language",
    "eventName": "skilledge:language-changed",
    "defaultLocale": "en",
    "aliases": {
        "ua": "uk",
        "no": "nb",
    },
    "rtlLocale": "ar",
    "runtimeAiTranslation": False,
    "localeValidationScriptReady": True,
    "buildPassed": True,
    "backupRoot": str(backup_root),
    "buildLog": str(build_log),
    "nextAction": "MIGRATE_LANDING_LANGUAGE_SELECTOR_TO_UNIFIED_RUNTIME",
}

raw = audit / f"S10_9K_I18N_FOUNDATION_raw_{stamp}.json"
report = audit / f"S10_9K_I18N_FOUNDATION_report_{stamp}.txt"
milestone = milestones / f"S10_9K_I18N_FOUNDATION_{stamp}.md"

raw.write_text(
    json.dumps(result, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

report.write_text(
    "\n".join([
        "S10.9K UNIFIED I18N FOUNDATION",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=UNIFIED_I18N_FOUNDATION_PATCH_PASSED",
        "STORAGE_KEY=skilledge_language",
        "EVENT=skilledge:language-changed",
        "DEFAULT_LOCALE=en",
        "ALIASES=ua->uk,no->nb",
        "RTL_LOCALE=ar",
        "RUNTIME_AI_TRANSLATION=False",
        "LOCALE_VALIDATION_SCRIPT_READY=True",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=MIGRATE_LANDING_LANGUAGE_SELECTOR_TO_UNIFIED_RUNTIME",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9K Unified i18n Foundation",
        "",
        "- OK: True",
        "- Storage key: skilledge_language",
        "- Event: skilledge:language-changed",
        "- Default locale: English",
        "- Aliases: ua→uk, no→nb",
        "- RTL: Arabic",
        "- Runtime AI translation: False",
        "- Locale validator: ready",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9K COMPLETE ===")
print("OK: True")
print("Classification: UNIFIED_I18N_FOUNDATION_PATCH_PASSED")
print("Storage key: skilledge_language")
print("Event: skilledge:language-changed")
print("Default locale: en")
print("Aliases: ua->uk, no->nb")
print("RTL locale: ar")
print("Runtime AI translation: False")
print("Locale validation script ready: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: MIGRATE_LANDING_LANGUAGE_SELECTOR_TO_UNIFIED_RUNTIME")
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
  throw "S10.9K unified i18n foundation patch blocked"
}
