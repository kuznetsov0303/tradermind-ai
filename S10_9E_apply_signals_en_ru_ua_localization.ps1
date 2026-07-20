param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9e_signals_localization_$stamp.py"

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

dashboard = project / "app" / "dashboard" / "page.tsx"
cockpit = project / "components" / "dashboard" / "SignalCockpitTab.tsx"

for path in (dashboard, cockpit, project / "package.json"):
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

state = project / "PROJECT_STATE"
audit = project / "audit_exports"
milestones = state / "milestones"
backup_root = state / f"S10_9E_signals_localization_backup_{stamp}"

audit.mkdir(parents=True, exist_ok=True)
milestones.mkdir(parents=True, exist_ok=True)
backup_root.mkdir(parents=True, exist_ok=True)

targets = [dashboard, cockpit]

for source in targets:
    rel = source.relative_to(project)
    target = backup_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

def restore() -> None:
    for source in targets:
        backup = backup_root / source.relative_to(project)
        if backup.is_file():
            shutil.copy2(backup, source)

dashboard_text = dashboard.read_text(encoding="utf-8-sig")
cockpit_text = cockpit.read_text(encoding="utf-8-sig")

# Ukrainian product terminology requested by the product owner.
dashboard_replacements = {
    '"Сигнали"': '"Сповіщення"',
    "'Сигнали'": "'Сповіщення'",
}

dashboard_hits = {}
for old, new in dashboard_replacements.items():
    hits = dashboard_text.count(old)
    dashboard_hits[old] = hits
    if hits:
        dashboard_text = dashboard_text.replace(old, new)

component_anchor = '''export default function SignalCockpitTab({ language }: { language: Language }) {'''

component_replacement = '''export default function SignalCockpitTab({ language }: { language: Language }) {
  const ui = (en: string, ru: string, ua: string) =>
    language === "en" ? en : language === "ua" ? ua : ru;'''

if component_anchor not in cockpit_text:
    restore()
    raise SystemExit("SignalCockpit component anchor not found")

cockpit_text = cockpit_text.replace(component_anchor, component_replacement, 1)

# Exact visible UI replacements. Trading terms such as VWAP, EMA20, WATCH,
# ARMED and ACTIVE remain professional terms where appropriate.
replacements = [
    (
        '            Live signal cockpit',
        '            {ui("Live signal cockpit", "Панель сигналов", "Панель сповіщень")}',
    ),
    (
        '{loading ? "Обновляем..." : "Обновить"}',
        '{loading ? ui("Refreshing...", "Обновляем...", "Оновлюємо...") : ui("Refresh", "Обновить", "Оновити")}',
    ),
    (
        '                  AI сопровождение',
        '                  {ui("AI guidance", "AI-сопровождение", "AI-супровід")}',
    ),
    (
        ': "Выбери тикер из watchlist. AI покажет план, риск и условия входа."}',
        ': ui("Select a ticker from the watchlist. AI will show the plan, risk and entry conditions.", "Выбери тикер из списка наблюдения. AI покажет план, риск и условия входа.", "Обери тикер зі списку спостереження. AI покаже план, ризик та умови входу.")}',
    ),
    (
        '<Card title="Trade management" className="mt-3">',
        '<Card title={ui("Trade management", "Управление сделкой", "Керування угодою")} className="mt-3">',
    ),
    (
        '                    Live action',
        '                    {ui("Live action", "Текущее действие", "Поточна дія")}',
    ),
    (
        '? "candidate still valid"\n      : "monitor only";',
        '? ui("candidate still valid", "идея ещё актуальна", "ідея ще актуальна")\n      : ui("monitor only", "только наблюдение", "лише спостереження");',
    ),
    (
        '                  label="Current R"',
        '                  label={ui("Current R", "Текущий R", "Поточний R")}',
    ),
    (
        '                  label="Freshness"',
        '                  label={ui("Freshness", "Актуальность", "Актуальність")}',
    ),
    (
        '                  label="Price age"',
        '                  label={ui("Price age", "Возраст цены", "Вік ціни")}',
    ),
    (
        '                  label="Actionable"',
        '                  label={ui("Actionable", "Можно действовать", "Можна діяти")}',
    ),
    (
        '? "YES"\n                      : selectedIsActionable === false\n                        ? "NO"',
        '? ui("YES", "ДА", "ТАК")\n                      : selectedIsActionable === false\n                        ? ui("NO", "НЕТ", "НІ")',
    ),
    (
        '                    strict blocked',
        '                    {ui("strict blocked", "строгий блок", "суворий блок")}',
    ),
    (
        '                    late session',
        '                    {ui("late session", "поздняя сессия", "пізня сесія")}',
    ),
    (
        '                    market closed',
        '                    {ui("market closed", "рынок закрыт", "ринок закрито")}',
    ),
    (
        '                    No live blockers from the trade-management guard.',
        '                    {ui("No live blockers from the trade-management guard.", "Нет активных блокировок управления сделкой.", "Немає активних блокувань керування угодою.")}',
    ),
    (
        '<Card title="Что делать дальше" className="mt-3">',
        '<Card title={ui("What to do next", "Что делать дальше", "Що робити далі")} className="mt-3">',
    ),
    (
        '"Ждать подтверждение. Не входить без setup + risk/reward + invalidation.",',
        'ui("Wait for confirmation. Do not enter without setup + risk/reward + invalidation.", "Ждать подтверждение. Не входить без setup + risk/reward + invalidation.", "Чекати підтвердження. Не входити без setup + risk/reward + invalidation."),',
    ),
    (
        '<Card title="План сделки" className="mt-3">',
        '<Card title={ui("Trade plan", "План сделки", "План угоди")} className="mt-3">',
    ),
    ('                label="Вход"', '                label={ui("Entry", "Вход", "Вхід")}'),
    ('                label="Стоп"', '                label={ui("Stop", "Стоп", "Стоп")}'),
    ('                label="R сейчас"', '                label={ui("Current R", "R сейчас", "Поточний R")}'),
    (
        '                  Confirmations появятся после загрузки candle context.',
        '                  {ui("Confirmations will appear after candle context loads.", "Подтверждения появятся после загрузки контекста свечей.", "Підтвердження з’являться після завантаження контексту свічок.")}',
    ),
    (
        '                  AI WATCHLIST',
        '                  {ui("AI WATCHLIST", "СПИСОК НАБЛЮДЕНИЯ AI", "СПИСОК СПОСТЕРЕЖЕННЯ AI")}',
    ),
    (
        '                  Поиск тикера...',
        '                  {ui("Search ticker...", "Поиск тикера...", "Пошук тикера...")}',
    ),
    (
        '                  Нет тикеров под выбранный фильтр.',
        '                  {ui("No tickers match the selected filter.", "Нет тикеров под выбранный фильтр.", "Немає тикерів за вибраним фільтром.")}',
    ),
    (
        '                  Выбери тикер справа.',
        '                  {ui("Select a ticker on the right.", "Выбери тикер справа.", "Обери тикер праворуч.")}',
    ),
    ('                    ЦЕНА', '                    {ui("PRICE", "ЦЕНА", "ЦІНА")}'),
    ('                    SCORE', '                    {ui("SCORE", "ОЦЕНКА", "ОЦІНКА")}'),
    ('                    VOLUME', '                    {ui("VOLUME", "ОБЪЁМ", "ОБСЯГ")}'),
    (
        '                  Updated: {formatDateTime(lastUpdated)}',
        '                  {ui("Updated", "Обновлено", "Оновлено")}: {formatDateTime(lastUpdated)}',
    ),
]

replacement_results = []
for old, new in replacements:
    hits = cockpit_text.count(old)
    replacement_results.append({"anchor": old[:80], "hits": hits})
    if hits:
        cockpit_text = cockpit_text.replace(old, new)

# Translate the status labels according to the selected site language.
status_call_replacements = {
    "labelStatus(selectedStatus)": "labelStatus(selectedStatus, language)",
    "labelStatus(selected?.status || selectedStatus)": "labelStatus(selected?.status || selectedStatus, language)",
    "labelStatus(event.type)": "labelStatus(event.type, language)",
    "labelStatus(status)": "labelStatus(status, language)",
    "labelStatus(type)": "labelStatus(type, language)",
}

for old, new in status_call_replacements.items():
    cockpit_text = cockpit_text.replace(old, new)

old_status_function = '''function labelStatus(value?: string | null) {
  const status = normalizeStatus(value);
  return STATUS_RU[status] || status.replaceAll("_", " ").toLowerCase();
}'''

new_status_function = '''function labelStatus(value?: string | null, language: Language = "en") {
  const status = normalizeStatus(value);

  const statusUa: Record<string, string> = {
    WATCH: "Спостереження",
    ARMED: "Готується",
    ACTIVE: "Активна ідея",
    ENTRY_STILL_VALID: "Вхід актуальний",
    STILL_VALID: "Ідея актуальна",
    WAIT_FOR_REENTRY: "Чекати re-entry",
    ENTRY_MISSED: "Вхід пропущено",
    TP1_HIT: "TP1 досягнуто",
    TP2_HIT: "TP2 досягнуто",
    STOP_HIT: "Стоп",
    INVALIDATED: "Скасовано",
    SESSION_CLOSE: "Сесію закрито",
    WAITING_CONFIRMATION: "Очікуємо підтвердження",
    CLOSED_BY_SESSION: "Закрито сесією",
    REJECT: "Відхилено",
    PASSED: "Пройдено",
  };

  if (language === "ua") {
    return statusUa[status] || status.replaceAll("_", " ").toLowerCase();
  }

  if (language === "ru") {
    return STATUS_RU[status] || status.replaceAll("_", " ").toLowerCase();
  }

  return status.replaceAll("_", " ");
}'''

if old_status_function not in cockpit_text:
    restore()
    raise SystemExit("Status localization function anchor not found")

cockpit_text = cockpit_text.replace(old_status_function, new_status_function, 1)

# Ukrainian tab terminology must be present and the old label absent.
if '"Сигнали"' in dashboard_text or "'Сигнали'" in dashboard_text:
    restore()
    raise SystemExit("Old Ukrainian Signals label remains in dashboard")

if "Панель сповіщень" not in cockpit_text:
    restore()
    raise SystemExit("Ukrainian Signals cockpit label was not added")

dashboard.write_text(dashboard_text, encoding="utf-8")
cockpit.write_text(cockpit_text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9E_SIGNALS_LOCALIZATION_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(f"Build failed; original files restored. See: {build_log}")

result = {
    "ok": True,
    "classification": "SIGNALS_EN_RU_UA_LOCALIZATION_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "filesChanged": [
        "app/dashboard/page.tsx",
        "components/dashboard/SignalCockpitTab.tsx",
    ],
    "backupRoot": str(backup_root),
    "ukrainianTabLabel": "Сповіщення",
    "siteLanguagePropUsed": True,
    "statusLocalizationAdded": True,
    "visibleCockpitLocalizationAnchors": replacement_results,
    "dashboardReplacementHits": dashboard_hits,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_VERIFY_SIGNALS_EN_RU_UA",
}

raw = audit / f"S10_9E_SIGNALS_LOCALIZATION_raw_{stamp}.json"
report = audit / f"S10_9E_SIGNALS_LOCALIZATION_report_{stamp}.txt"
milestone = milestones / f"S10_9E_SIGNALS_LOCALIZATION_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9E SIGNALS EN/RU/UA LOCALIZATION",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=SIGNALS_EN_RU_UA_LOCALIZATION_PATCH_PASSED",
        "UKRAINIAN_TAB_LABEL=Сповіщення",
        "SITE_LANGUAGE_PROP_USED=True",
        "STATUS_LOCALIZATION_ADDED=True",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=LOCAL_VISUAL_VERIFY_SIGNALS_EN_RU_UA",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9E Signals EN/RU/UA Localization",
        "",
        "- OK: True",
        "- Ukrainian tab label: Сповіщення",
        "- Signals cockpit localized from site language: True",
        "- Status localization: True",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9E COMPLETE ===")
print("OK: True")
print("Classification: SIGNALS_EN_RU_UA_LOCALIZATION_PATCH_PASSED")
print("Ukrainian tab label: Сповіщення")
print("Signals uses site language: True")
print("Status localization added: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_VERIFY_SIGNALS_EN_RU_UA")
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
  throw "S10.9E Signals localization patch blocked"
}
