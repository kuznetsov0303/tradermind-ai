param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9e3_signals_completion_$stamp.py"

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

cockpit = project / "components" / "dashboard" / "SignalCockpitTab.tsx"

for path in (cockpit, project / "package.json"):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

audit = project / "audit_exports"
milestones = project / "PROJECT_STATE" / "milestones"
backup_root = project / "PROJECT_STATE" / f"S10_9E3_signals_localization_completion_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

backup = backup_root / cockpit.relative_to(project)
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(cockpit, backup)

def restore() -> None:
    shutil.copy2(backup, cockpit)

text = cockpit.read_text(encoding="utf-8-sig")

replacements = [
    (
        '                      "Выбери тикер справа"}',
        '                      ui("Select a ticker on the right", "Выбери тикер справа", "Обери тикер праворуч")}',
        "selected_ticker_subtitle",
    ),
    (
        '                  <SmallMetric label="Цена" value={formatPrice(currentPrice)} />',
        '                  <SmallMetric label={ui("Price", "Цена", "Ціна")} value={formatPrice(currentPrice)} />',
        "price_metric",
    ),
    (
        '                    label="Score"',
        '                    label={ui("Score", "Оценка", "Оцінка")}',
        "score_metric",
    ),
    (
        '                    label="Volume"',
        '                    label={ui("Volume", "Объём", "Обсяг")}',
        "volume_metric",
    ),
    (
        '                  3D 5M история + live',
        '                  {ui("3D 5M history + live", "3D 5M история + live", "3D 5M історія + live")}',
        "history_badge",
    ),
    (
        '''                    ? "Грузим 3 дня 5m свечей: premarket + regular + postmarket"
                    : `${historyMeta?.count || 0} свечей / ${historyMeta?.tradingDates?.length || 0} дн. · PRE ${sessionCount(historyMeta?.sessionStats, "premarket")} · REG ${sessionCount(historyMeta?.sessionStats, "regular")} · POST ${sessionCount(historyMeta?.sessionStats, "postmarket")} · ${historyProviderLabel(historyMeta)}`}''',
        '''                    ? ui(
                        "Loading 3 days of 5m candles: premarket + regular + postmarket",
                        "Грузим 3 дня 5m свечей: premarket + regular + postmarket",
                        "Завантажуємо 3 дні 5m свічок: premarket + regular + postmarket",
                      )
                    : `${historyMeta?.count || 0} ${ui("candles", "свечей", "свічок")} / ${historyMeta?.tradingDates?.length || 0} ${ui("days", "дн.", "дн.")} · PRE ${sessionCount(historyMeta?.sessionStats, "premarket")} · REG ${sessionCount(historyMeta?.sessionStats, "regular")} · POST ${sessionCount(historyMeta?.sessionStats, "postmarket")} · ${historyProviderLabel(historyMeta)}`}''',
        "history_summary",
    ),
    (
        '''                    ? "Загружаем график..."
                    : "Выбери тикер справа."}''',
        '''                    ? ui("Loading chart...", "Загружаем график...", "Завантажуємо графік...")
                    : ui("Select a ticker on the right.", "Выбери тикер справа.", "Обери тикер праворуч.")}''',
        "chart_empty_state",
    ),
    (
        '                    AI Watchlist',
        '                    {ui("AI Watchlist", "Список наблюдения AI", "Список спостереження AI")}',
        "watchlist_title",
    ),
    (
        '                    {filteredDeskItems.length}/{deskItems.length} тикеров',
        '                    {filteredDeskItems.length}/{deskItems.length} {ui("tickers", "тикеров", "тикерів")}',
        "watchlist_count",
    ),
    (
        '                    Live {activeCount}',
        '                    {ui("Live", "Активно", "Активно")} {activeCount}',
        "active_counter",
    ),
    (
        '                    Closed {closedCount}',
        '                    {ui("Closed", "Закрыто", "Закрито")} {closedCount}',
        "closed_counter",
    ),
    (
        '                placeholder="Поиск тикера..."',
        '                placeholder={ui("Search ticker...", "Поиск тикера...", "Пошук тикера...")}',
        "ticker_search",
    ),
    (
        '''                  ["all", "Все"],
                  ["watch", "Watch"],
                  ["armed", "Armed"],
                  ["active", "Active"],
                  ["closed", "Closed"],''',
        '''                  ["all", ui("All", "Все", "Усі")],
                  ["watch", ui("Watch", "Наблюдение", "Спостереження")],
                  ["armed", ui("Armed", "Готовится", "Готується")],
                  ["active", ui("Active", "Активные", "Активні")],
                  ["closed", ui("Closed", "Закрытые", "Закриті")],''',
        "filter_labels",
    ),
    (
        '                            late',
        '                            {ui("late", "поздно", "пізно")}',
        "late_badge",
    ),
    (
        '                            closed',
        '                            {ui("closed", "закрыто", "закрито")}',
        "closed_badge",
    ),
    (
        '                          : "monitor only"',
        '                          : ui("monitor only", "только наблюдение", "лише спостереження")',
        "monitor_only_card",
    ),
    (
        '                          : "candidate"',
        '                          : ui("candidate", "кандидат", "кандидат")',
        "candidate_card",
    ),
    (
        '                           : "watch";',
        '                           : ui("watch", "наблюдение", "спостереження");',
        "watch_card",
    ),
    (
        '{priceFreshness}',
        '{priceFreshness === "UNKNOWN" ? ui("UNKNOWN", "НЕИЗВЕСТНО", "НЕВІДОМО") : priceFreshness}',
        "selected_freshness",
    ),
    (
        '{itemFreshness}',
        '{itemFreshness === "UNKNOWN" ? ui("UNKNOWN", "НЕИЗВЕСТНО", "НЕВІДОМО") : itemFreshness}',
        "item_freshness",
    ),
    (
        '                        Lifecycle',
        '                        {ui("Lifecycle", "Жизненный цикл", "Життєвий цикл")}',
        "lifecycle_label",
    ),
]

results = []
for old, new, name in replacements:
    hits = text.count(old)
    results.append({"name": name, "hits": hits})
    if hits:
        text = text.replace(old, new)

required_names = {
    "selected_ticker_subtitle",
    "price_metric",
    "score_metric",
    "volume_metric",
    "history_badge",
    "history_summary",
    "chart_empty_state",
    "watchlist_title",
    "watchlist_count",
    "active_counter",
    "closed_counter",
    "ticker_search",
    "filter_labels",
}

missing_required = [
    row["name"]
    for row in results
    if row["name"] in required_names and row["hits"] == 0
]

if missing_required:
    restore()
    raise SystemExit(
        "Required Signals localization anchors missing: "
        + ", ".join(missing_required)
    )

for required_internal in (
    '["all", ui(',
    '["watch", ui(',
    '["armed", ui(',
    '["active", ui(',
    '["closed", ui(',
):
    if required_internal not in text:
        restore()
        raise SystemExit(f"Internal filter key missing: {required_internal}")

if 'placeholder="Поиск тикера..."' in text:
    restore()
    raise SystemExit("Old hardcoded Russian ticker placeholder remains")

if "Список спостереження AI" not in text:
    restore()
    raise SystemExit("Ukrainian watchlist label missing")

cockpit.write_text(text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9E3_SIGNALS_LOCALIZATION_COMPLETION_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; original cockpit restored. See: {build_log}")

result = {
    "ok": True,
    "classification": "SIGNALS_LOCALIZATION_COMPLETION_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "fileChanged": "components/dashboard/SignalCockpitTab.tsx",
    "backupRoot": str(backup_root),
    "replacementResults": results,
    "internalFilterKeysPreserved": True,
    "siteLanguagePropUsed": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_SIGNALS_UA_RU_EN",
}

raw = audit / f"S10_9E3_SIGNALS_LOCALIZATION_COMPLETION_raw_{stamp}.json"
report = audit / f"S10_9E3_SIGNALS_LOCALIZATION_COMPLETION_report_{stamp}.txt"
milestone = milestones / f"S10_9E3_SIGNALS_LOCALIZATION_COMPLETION_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report_lines = [
    "S10.9E3 SIGNALS LOCALIZATION COMPLETION",
    f"Generated={stamp}",
    "OK=True",
    "CLASSIFICATION=SIGNALS_LOCALIZATION_COMPLETION_PATCH_PASSED",
    "INTERNAL_FILTER_KEYS_PRESERVED=True",
    "SITE_LANGUAGE_PROP_USED=True",
    "BUILD_PASSED=True",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
]

for row in results:
    report_lines.append(f"REPLACEMENT_{row['name'].upper()}={row['hits']}")

report_lines.extend([
    f"BACKUP_ROOT={backup_root}",
    f"BUILD_LOG={build_log}",
    f"RAW_JSON={raw}",
    "NEXT_ACTION=LOCAL_VISUAL_VERIFY_SIGNALS_UA_RU_EN",
])

report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

milestone.write_text(
    "\n".join([
        "# S10.9E3 Signals Localization Completion",
        "",
        "- OK: True",
        "- Classification: SIGNALS_LOCALIZATION_COMPLETION_PATCH_PASSED",
        "- Internal filter keys preserved: True",
        "- Site language used: True",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9E3 COMPLETE ===")
print("OK: True")
print("Classification: SIGNALS_LOCALIZATION_COMPLETION_PATCH_PASSED")
for row in results:
    print(f"{row['name']}: {row['hits']}")
print("Internal filter keys preserved: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_SIGNALS_UA_RU_EN")
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
  throw "S10.9E3 Signals localization completion blocked"
}
