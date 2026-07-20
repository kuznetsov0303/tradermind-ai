param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9d_core_frontend_patch_$stamp.py"

$python=@'
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

project = Path(sys.argv[1]).resolve()
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

dashboard = project / "app" / "dashboard" / "page.tsx"
cockpit = project / "components" / "dashboard" / "SignalCockpitTab.tsx"

required = [dashboard, cockpit, project / "package.json"]
for path in required:
    if not path.is_file():
        raise SystemExit(f"Required file missing: {path}")

state = project / "PROJECT_STATE"
audit = project / "audit_exports"
milestones = state / "milestones"
backup_root = state / f"S10_9D_core_frontend_patch_backup_{stamp}"
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
        rel = source.relative_to(project)
        backup = backup_root / rel
        if backup.is_file():
            shutil.copy2(backup, source)

def weirdness(value: str) -> int:
    markers = (
        "Р", "С", "вЂ", "в„", "Рџ", "РЎ", "Рђ", "Р—",
        "Рћ", "Рќ", "СЃ", "С‚", "СЏ", "С–", "С—",
    )
    return sum(value.count(marker) for marker in markers)

quoted_string = re.compile(r'(["\'`])((?:\\.|(?!\1).)*?)\1')

def repair_fragment(value: str) -> str:
    if weirdness(value) < 2:
        return value

    best = value
    best_score = weirdness(value)

    for encoding in ("cp1251", "latin1"):
        try:
            candidate = value.encode(encoding).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue

        score = weirdness(candidate)
        if score < best_score:
            best = candidate
            best_score = score

    return best

def repair_quoted_strings(text: str) -> tuple[str, int]:
    count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        quote = match.group(1)
        body = match.group(2)
        fixed = repair_fragment(body)
        if fixed != body:
            count += 1
        return quote + fixed + quote

    return quoted_string.sub(replace, text), count

dashboard_text = dashboard.read_text(encoding="utf-8-sig")
cockpit_text = cockpit.read_text(encoding="utf-8-sig")

dashboard_text, repaired_strings = repair_quoted_strings(dashboard_text)
cockpit_text, cockpit_repaired_strings = repair_quoted_strings(cockpit_text)

saved_language_anchor = '''if (
  savedLanguage === "en" ||
  savedLanguage === "ru" ||
  savedLanguage === "ua"
) {
  setLanguage(savedLanguage);
}'''

saved_language_replacement = '''if (
  savedLanguage === "en" ||
  savedLanguage === "ru" ||
  savedLanguage === "ua" ||
  savedLanguage === "uk"
) {
  const normalizedLanguage: Language =
    savedLanguage === "uk" ? "ua" : savedLanguage;
  setLanguage(normalizedLanguage);
  document.documentElement.lang =
    normalizedLanguage === "ua" ? "uk" : normalizedLanguage;
}'''

if saved_language_anchor not in dashboard_text:
    restore()
    raise SystemExit("Saved language anchor not found")

dashboard_text = dashboard_text.replace(
    saved_language_anchor,
    saved_language_replacement,
    1,
)

state_anchor = '''  const [language, setLanguage] = useState<Language>("en");
  const t = dashboardDict[language];'''

state_replacement = '''  const [language, setLanguage] = useState<Language>("en");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const t = dashboardDict[language];

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);

    const canonicalLocale = nextLanguage === "ua" ? "uk" : nextLanguage;
    localStorage.setItem("skilledge_language", canonicalLocale);
    document.cookie = `skilledge_language=${canonicalLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = canonicalLocale;
    document.documentElement.dir = "ltr";
  };'''

if state_anchor not in dashboard_text:
    restore()
    raise SystemExit("Dashboard language state anchor not found")

dashboard_text = dashboard_text.replace(state_anchor, state_replacement, 1)

actions_anchor = '''    <div className="flex flex-wrap gap-3">
      <a
        href="/?page=pricing"'''

actions_replacement = '''    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setLanguageMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={languageMenuOpen}
          className="se-dashboard-button-secondary inline-flex min-w-[118px] items-center justify-between gap-3 rounded-full px-4 py-3 text-sm font-black transition hover:-translate-y-0.5"
        >
          <span>
            {language === "en"
              ? "English"
              : language === "ua"
                ? "Українська"
                : "Русский"}
          </span>
          <span aria-hidden="true" className="text-white/45">v</span>
        </button>

        {languageMenuOpen ? (
          <>
            <button
              type="button"
              aria-label="Close language menu"
              onClick={() => setLanguageMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-white/12 bg-[#101a28]/98 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              {([
                ["en", "English"],
                ["ru", "Русский"],
                ["ua", "Українська"],
              ] as const).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={language === code}
                  onClick={() => changeLanguage(code)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                    language === code
                      ? "bg-cyan-300/12 text-cyan-100"
                      : "text-white/72 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <span>{label}</span>
                  {language === code ? <span className="text-cyan-200">OK</span> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <a
        href="/"
        className="se-dashboard-button-secondary rounded-full px-5 py-3 text-sm font-black transition hover:-translate-y-0.5"
      >
        {language === "en"
          ? "Back to site"
          : language === "ua"
            ? "На сайт"
            : "На сайт"}
      </a>

      <a
        href="/?page=pricing"'''

if actions_anchor not in dashboard_text:
    restore()
    raise SystemExit("Dashboard header actions anchor not found")

dashboard_text = dashboard_text.replace(actions_anchor, actions_replacement, 1)
dashboard_text = dashboard_text.replace('    holly: "cockpit",\n', "", 1)
dashboard_text = dashboard_text.replace('"SkillEdge Holly AI"', '"SkillEdge AI"')

cockpit_header_anchor = '''        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-sm font-black text-emerald-200">
            SE
          </div>
          <div className="text-sm font-black tracking-[-0.02em] text-white">
            SkillEdge AI Desk
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.10] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/82">
            Holly-like cockpit
          </span>
        </div>'''

cockpit_header_replacement = '''        <a
          href="/dashboard"
          aria-label={
            language === "en"
              ? "Back to dashboard"
              : language === "ua"
                ? "Повернутися до кабінету"
                : "Вернуться в кабинет"
          }
          className="group flex items-center gap-3 rounded-xl px-1 py-1 transition hover:bg-white/[0.05]"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-sm font-black text-emerald-200 transition group-hover:bg-emerald-400/22">
            SE
          </div>
          <div className="text-sm font-black tracking-[-0.02em] text-white">
            SkillEdge AI Desk
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.10] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/82">
            Live signal cockpit
          </span>
        </a>'''

if cockpit_header_anchor not in cockpit_text:
    restore()
    raise SystemExit("Signal cockpit header anchor not found")

cockpit_text = cockpit_text.replace(
    cockpit_header_anchor,
    cockpit_header_replacement,
    1,
)

for path, text in ((dashboard, dashboard_text), (cockpit, cockpit_text)):
    if re.search(r"holly", text, re.I):
        restore()
        raise SystemExit(
            f"Holly reference remains in patched active file: {path.relative_to(project)}"
        )

dashboard.write_text(dashboard_text, encoding="utf-8")
cockpit.write_text(cockpit_text, encoding="utf-8")

build_result = subprocess.run(
    ["npm.cmd" if sys.platform.startswith("win") else "npm", "run", "build"],
    cwd=project,
    text=True,
    capture_output=True,
)

build_log = audit / f"S10_9D_CORE_FRONTEND_PATCH_build_{stamp}.txt"
build_log.write_text(
    (build_result.stdout or "") + "\n--- STDERR ---\n" + (build_result.stderr or ""),
    encoding="utf-8",
)

if build_result.returncode != 0:
    restore()
    raise SystemExit(
        f"Build failed; original files restored. See: {build_log}"
    )

result = {
    "ok": True,
    "classification": "CORE_FRONTEND_I18N_NAVIGATION_PATCH_PASSED",
    "productionMutation": False,
    "vpsTouched": False,
    "filesChanged": [
        str(dashboard.relative_to(project)),
        str(cockpit.relative_to(project)),
    ],
    "backupRoot": str(backup_root),
    "dashboardMojibakeStringsRepaired": repaired_strings,
    "cockpitMojibakeStringsRepaired": cockpit_repaired_strings,
    "languageDropdownAdded": True,
    "supportedLanguagesExposed": ["en", "ru", "ua"],
    "languagePersistenceAdded": True,
    "dashboardBackToSiteAdded": True,
    "signalsBackToDashboardAdded": True,
    "visibleHollyReferencesRemoved": True,
    "buildPassed": True,
    "buildLog": str(build_log),
    "nextAction": "LOCAL_VISUAL_SMOKE_TEST_CORE_FRONTEND_PATCH",
}

raw = audit / f"S10_9D_CORE_FRONTEND_PATCH_raw_{stamp}.json"
report = audit / f"S10_9D_CORE_FRONTEND_PATCH_report_{stamp}.txt"
milestone = milestones / f"S10_9D_CORE_FRONTEND_PATCH_{stamp}.md"

raw.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

report.write_text(
    "\n".join([
        "S10.9D CORE FRONTEND / I18N / NAVIGATION PATCH",
        f"Generated={stamp}",
        "OK=True",
        "CLASSIFICATION=CORE_FRONTEND_I18N_NAVIGATION_PATCH_PASSED",
        f"DASHBOARD_MOJIBAKE_STRINGS_REPAIRED={repaired_strings}",
        f"COCKPIT_MOJIBAKE_STRINGS_REPAIRED={cockpit_repaired_strings}",
        "LANGUAGE_DROPDOWN_ADDED=True",
        "SUPPORTED_LANGUAGES_EXPOSED=en,ru,ua",
        "LANGUAGE_PERSISTENCE_ADDED=True",
        "DASHBOARD_BACK_TO_SITE_ADDED=True",
        "SIGNALS_BACK_TO_DASHBOARD_ADDED=True",
        "VISIBLE_HOLLY_REFERENCES_REMOVED=True",
        "BUILD_PASSED=True",
        "PRODUCTION_MUTATION=False",
        "VPS_TOUCHED=False",
        f"BACKUP_ROOT={backup_root}",
        f"BUILD_LOG={build_log}",
        f"RAW_JSON={raw}",
        "NEXT_ACTION=LOCAL_VISUAL_SMOKE_TEST_CORE_FRONTEND_PATCH",
    ]) + "\n",
    encoding="utf-8",
)

milestone.write_text(
    "\n".join([
        "# S10.9D Core Frontend Patch",
        "",
        "- OK: True",
        "- Classification: CORE_FRONTEND_I18N_NAVIGATION_PATCH_PASSED",
        f"- Dashboard mojibake strings repaired: {repaired_strings}",
        f"- Cockpit mojibake strings repaired: {cockpit_repaired_strings}",
        "- Language dropdown: EN/RU/UA",
        "- Back to site: added",
        "- Signals back to dashboard: added",
        "- Visible Holly references: removed",
        "- Build: passed",
        "- Production mutation: False",
        "- VPS touched: False",
        f"- Backup: {backup_root}",
    ]) + "\n",
    encoding="utf-8",
)

print()
print("=== S10.9D COMPLETE ===")
print("OK: True")
print("Classification: CORE_FRONTEND_I18N_NAVIGATION_PATCH_PASSED")
print(f"Dashboard mojibake strings repaired: {repaired_strings}")
print(f"Cockpit mojibake strings repaired: {cockpit_repaired_strings}")
print("Language dropdown added: True")
print("Supported languages exposed: en, ru, ua")
print("Language persistence added: True")
print("Dashboard back to site added: True")
print("Signals back to dashboard added: True")
print("Visible Holly references removed: True")
print("Build passed: True")
print("Production mutation: False")
print("VPS touched: False")
print(f"Backup root: {backup_root}")
print(f"Build log: {build_log}")
print(f"Report: {report}")
print(f"Raw: {raw}")
print(f"Milestone: {milestone}")
print("Next action: LOCAL_VISUAL_SMOKE_TEST_CORE_FRONTEND_PATCH")
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
  if($LASTEXITCODE -eq 0){
    $pythonMode="py"
  }
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

if(-not $pythonMode){
  throw "Usable Python not found"
}

if($pythonMode -eq "py"){
  & py -3 $runner $ProjectRoot
}else{
  & $pythonPath $runner $ProjectRoot
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.9D core frontend patch blocked"
}
