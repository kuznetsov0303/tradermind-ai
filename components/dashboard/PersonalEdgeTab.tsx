type Language = string;
type EdgeAny = Record<string, any>;



type PersonalEdgeTabProps = {
  language: Language;
  summary: any | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpenJournal: () => void;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return String(
      item.label ||
        item.feature ||
        item.mistake ||
        item.title ||
        item.value ||
        item.condition ||
        ""
    );
  }

  return String(value);
}

function formatScore(value: number | null | undefined) {
  return `${Math.round(Number(value || 0))}%`;
}

function widthStyle(value: number | null | undefined) {
  return { width: `${Math.max(4, Math.min(100, Number(value || 0)))}%` };
}

export default function PersonalEdgeTab({
  language,
  summary,
  loading,
  error,
  onRefresh,
  onOpenJournal,
}: PersonalEdgeTabProps) {
  const isRu = language === "ru";
  const isUa = language === "ua";

  const copy = isRu
    ? {
        badge: "Personal Edge Engine",
        title: "Твой персональный trading desk, построенный вокруг твоего edge.",
        text:
          "SkillEdge AI соединяет журнал, скриншоты, разборы сделок и будущие сигналы в одну систему: Trading DNA, Setup Fingerprints, Playbook, Anti-Setup Guard и Execution Score.",
        refresh: "Обновить",
        loading: "Обновляем...",
        reviewTrade: "Разобрать сделку",
        noDataTitle: "Профиль ещё прогревается",
        noDataText:
          "Добавь сделку со скрином и запусти AI-разбор. После этого здесь появятся твой Trading DNA, Setup Fingerprints, Personal Playbook и Anti-Setup Guard.",
        dna: "Trading DNA",
        profileStrength: "Сила профиля",
        dataQuality: "Качество данных",
        execution: "Исполнение",
        discipline: "Дисциплина",
        reviewedTrades: "Разобранные сделки",
        screenshots: "Скрины",
        alertLinked: "Связано с signals",
        bestSetup: "Сильный сетап",
        bestDirection: "Лучшее направление",
        bestAsset: "Лучший рынок",
        mainRisk: "Главный риск",
        strongestCondition: "Сильное условие",
        fingerprints: "Setup Fingerprints",
        playbook: "Personal Playbook",
        guard: "Anti-Setup Guard",
        rules: "Personal Rules",
        recentReviews: "Последние AI-разборы",
        confidence: "Confidence",
        winRate: "Win rate",
        trades: "Trades",
        tier: "Tier",
        direction: "Direction",
        asset: "Asset",
        confirmation: "Confirmation",
        avoid: "Avoid",
        nextFocus: "Следующий фокус",
        missing: "Что усилит профиль",
        emptyFingerprints: "Система ещё собирает первые fingerprints. Добавь больше review со скринами.",
        emptyPlaybook: "Playbook появится после нескольких качественных разборов сделок.",
        emptyRules: "Personal rules появятся автоматически из повторяющихся ошибок и risk patterns.",
        emptyReviews: "Последние разборы появятся после AI review сделки.",
      }
    : isUa
      ? {
          badge: "Personal Edge Engine",
          title: "Твій персональний trading desk, побудований навколо твого edge.",
          text:
            "SkillEdge AI зʼєднує журнал, скриншоти, розбори угод і майбутні сигнали в одну систему: Trading DNA, Setup Fingerprints, Playbook, Anti-Setup Guard і Execution Score.",
          refresh: "Оновити",
          loading: "Оновлюємо...",
          reviewTrade: "Розібрати угоду",
          noDataTitle: "Профіль ще прогрівається",
          noDataText:
            "Додай угоду зі скрином і запусти AI-розбір. Після цього тут зʼявляться твій Trading DNA, Setup Fingerprints, Personal Playbook і Anti-Setup Guard.",
          dna: "Trading DNA",
          profileStrength: "Сила профілю",
          dataQuality: "Якість даних",
          execution: "Виконання",
          discipline: "Дисципліна",
          reviewedTrades: "Розібрані угоди",
          screenshots: "Скрини",
          alertLinked: "Повʼязано із signals",
          bestSetup: "Сильний сетап",
          bestDirection: "Найкращий напрям",
          bestAsset: "Найкращий ринок",
          mainRisk: "Головний ризик",
          strongestCondition: "Сильна умова",
          fingerprints: "Setup Fingerprints",
          playbook: "Personal Playbook",
          guard: "Anti-Setup Guard",
          rules: "Personal Rules",
          recentReviews: "Останні AI-розбори",
          confidence: "Confidence",
          winRate: "Win rate",
          trades: "Trades",
          tier: "Tier",
          direction: "Direction",
          asset: "Asset",
          confirmation: "Confirmation",
          avoid: "Avoid",
          nextFocus: "Наступний фокус",
          missing: "Що посилить профіль",
          emptyFingerprints: "Система ще збирає перші fingerprints. Додай більше review зі скринами.",
          emptyPlaybook: "Playbook зʼявиться після кількох якісних розборів угод.",
          emptyRules: "Personal rules зʼявляться автоматично з повторюваних помилок і risk patterns.",
          emptyReviews: "Останні розбори зʼявляться після AI review угоди.",
        }
      : {
          badge: "Personal Edge Engine",
          title: "Your personal trading desk, built around your edge.",
          text:
            "SkillEdge AI connects your journal, screenshots, trade reviews and future signals into one system: Trading DNA, Setup Fingerprints, Playbook, Anti-Setup Guard and Execution Score.",
          refresh: "Refresh",
          loading: "Refreshing...",
          reviewTrade: "Review a trade",
          noDataTitle: "Profile is warming up",
          noDataText:
            "Add a trade with a screenshot and run AI review. Your Trading DNA, Setup Fingerprints, Personal Playbook and Anti-Setup Guard will appear here.",
          dna: "Trading DNA",
          profileStrength: "Profile strength",
          dataQuality: "Data quality",
          execution: "Execution",
          discipline: "Discipline",
          reviewedTrades: "Reviewed trades",
          screenshots: "Screenshots",
          alertLinked: "Alert-linked",
          bestSetup: "Strong setup",
          bestDirection: "Best direction",
          bestAsset: "Best market",
          mainRisk: "Main risk",
          strongestCondition: "Strong condition",
          fingerprints: "Setup Fingerprints",
          playbook: "Personal Playbook",
          guard: "Anti-Setup Guard",
          rules: "Personal Rules",
          recentReviews: "Recent AI Reviews",
          confidence: "Confidence",
          winRate: "Win rate",
          trades: "Trades",
          tier: "Tier",
          direction: "Direction",
          asset: "Asset",
          confirmation: "Confirmation",
          avoid: "Avoid",
          nextFocus: "Next focus",
          missing: "What will strengthen it",
          emptyFingerprints: "The system is still building first fingerprints. Add more reviewed screenshots.",
          emptyPlaybook: "Playbook appears after several high-quality trade reviews.",
          emptyRules: "Personal rules appear automatically from repeated mistakes and risk patterns.",
          emptyReviews: "Recent reviews will appear after AI trade review.",
        };

  const translate = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return isRu ? "Недостаточно данных" : isUa ? "Недостатньо даних" : "Not enough data yet";

    const normalized = raw.toLowerCase();

    if (!isRu && !isUa) return raw;

    const ru: Record<string, string> = {
      "not enough data yet": "Недостаточно данных",
      "weak reward-to-risk profile": "Слабый risk/reward профиль",
      "vwap context": "VWAP контекст",
      "volume context": "Контекст объёма",
      "gap context": "Gap контекст",
      "premarket context": "Премаркет контекст",
      "manual journal + screenshot review": "Journal + screenshot review",
      "no clear stop / invalidation saved": "Нет чёткого стопа / invalidation",
      "failed breakout / trap": "Ложный пробой / trap",
      "lower high": "Lower High",
      "reclaim / failed reclaim": "Reclaim / failed reclaim",
      "key level reaction": "Реакция от ключевого уровня",
      "stock": "Акции",
      "crypto": "Крипто",
      "long": "Long",
      "short": "Short",
      "unknown": "Не определено",
      "more reviewed trades": "Больше разобранных сделок",
      "higher data quality: screenshots, stop, setup notes": "Лучше данные: скрины, стоп, сетап и заметки",
      "setup fingerprints": "Setup fingerprints",
      "personal playbook items": "Personal playbook",
    };

    const ua: Record<string, string> = {
      "not enough data yet": "Недостатньо даних",
      "weak reward-to-risk profile": "Слабкий risk/reward профіль",
      "vwap context": "VWAP контекст",
      "volume context": "Контекст обʼєму",
      "gap context": "Gap контекст",
      "premarket context": "Премаркет контекст",
      "manual journal + screenshot review": "Journal + screenshot review",
      "no clear stop / invalidation saved": "Немає чіткого стопа / invalidation",
      "failed breakout / trap": "Хибний пробій / trap",
      "lower high": "Lower High",
      "reclaim / failed reclaim": "Reclaim / failed reclaim",
      "key level reaction": "Реакція від ключового рівня",
      "stock": "Акції",
      "crypto": "Крипто",
      "long": "Long",
      "short": "Short",
      "unknown": "Не визначено",
      "more reviewed trades": "Більше розібраних угод",
      "higher data quality: screenshots, stop, setup notes": "Кращі дані: скрини, стоп, сетап і нотатки",
      "setup fingerprints": "Setup fingerprints",
      "personal playbook items": "Personal playbook",
    };

    return (isRu ? ru : ua)[normalized] || raw;
  };

  const stageDescription = () => {
    if (!summary) return copy.noDataText;

    const stage = summary.profile.stage.stage;

    if (isRu) {
      if (stage === "empty") return "Пока данных мало. Разбери первую сделку со скрином, чтобы AI начал строить личный профиль.";
      if (stage === "warming_up") return "AI уже начал читать твоё исполнение. Добавь больше review, чтобы повысить точность Personal Match.";
      if (stage === "building_edge") return "Система видит первые повторяемые сетапы и формирует твой playbook.";
      if (stage === "strong_profile") return "Профиль достаточно сильный для более точной персонализации сигналов и risk warnings.";
      return "Профиль готов к работе на уровне персонального trading desk.";
    }

    if (isUa) {
      if (stage === "empty") return "Даних поки мало. Розбери першу угоду зі скрином, щоб AI почав будувати особистий профіль.";
      if (stage === "warming_up") return "AI уже почав читати твоє виконання. Додай більше review, щоб підвищити точність Personal Match.";
      if (stage === "building_edge") return "Система бачить перші повторювані сетапи й формує твій playbook.";
      if (stage === "strong_profile") return "Профіль достатньо сильний для точнішої персоналізації сигналів і risk warnings.";
      return "Профіль готовий до роботи на рівні персонального trading desk.";
    }

    return summary.profile.stage.description;
  };

  const riskDescription = () => {
    const riskMode = summary?.profile.riskMode || "normal";

    if (isRu) {
      if (riskMode === "defensive") return "Система видит слабые места в исполнении. Сейчас приоритет — только A+ сетапы и жёсткий риск.";
      if (riskMode === "cooldown") return "Risk Guard предлагает снизить активность. Сначала восстанови дисциплину.";
      if (riskMode === "kill_switch") return "Режим защиты: торговлю лучше остановить, пока правила и риск не вернутся в норму.";
      if (riskMode === "aggressive_allowed") return "Профиль и исполнение позволяют активнее работать только с подтверждёнными сетапами.";
      return "Критичных рисков не найдено. Продолжай работать по personal playbook и правилам риска.";
    }

    if (isUa) {
      if (riskMode === "defensive") return "Система бачить слабкі місця у виконанні. Зараз пріоритет — тільки A+ сетапи й жорсткий ризик.";
      if (riskMode === "cooldown") return "Risk Guard пропонує знизити активність. Спочатку віднови дисципліну.";
      if (riskMode === "kill_switch") return "Режим захисту: торгівлю краще зупинити, поки правила й ризик не повернуться в норму.";
      if (riskMode === "aggressive_allowed") return "Профіль і виконання дозволяють активніше працювати тільки з підтвердженими сетапами.";
      return "Критичних ризиків не знайдено. Продовжуй працювати за personal playbook і правилами ризику.";
    }

    return summary?.profile.riskModeCopy.description || "";
  };

  const scoreCards = [
    { label: copy.profileStrength, value: summary?.profile.profileStrength || 0, gradient: "from-[#00C076] to-[#00D084]" },
    { label: copy.execution, value: summary?.profile.executionScore || 0, gradient: "from-[#C8A96B] to-[#F5D58A]" },
    { label: copy.dataQuality, value: summary?.profile.dataQualityScore || 0, gradient: "from-[#38BDF8] to-[#00C076]" },
    { label: copy.discipline, value: summary?.profile.disciplineScore || 0, gradient: "from-[#FF5A5F] to-[#F59E0B]" },
  ];

  const topFingerprints: EdgeAny[] = Array.isArray(summary?.fingerprints)
  ? summary.fingerprints
  : [];

const playbook: EdgeAny[] = Array.isArray(summary?.playbook)
  ? summary.playbook
  : [];

const rules: EdgeAny[] = Array.isArray(summary?.rules)
  ? summary.rules
  : [];

const reviews: EdgeAny[] = Array.isArray(summary?.recentReviews)
  ? summary.recentReviews
  : [];

  const missingData: string[] = Array.isArray(summary?.readiness?.missingData)
  ? summary.readiness.missingData
  : [];

  return (
    <div className="space-y-6">
      <section className="se-dashboard-panel relative overflow-hidden rounded-[2.35rem] border border-white/[0.08] p-6 shadow-[0_34px_130px_rgba(0,0,0,0.38)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(0,192,118,0.18),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(200,169,107,0.15),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.045),transparent_46%)]" />
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#00C076]/10 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-[#C8A96B]/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#C8A96B]/25 bg-[#C8A96B]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#F4E8C8]/85">
                {copy.badge}
              </span>
              <span className="rounded-full border border-[#00C076]/22 bg-[#00C076]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#DFFFEF]/82">
                {summary?.profile.stage.label || copy.noDataTitle}
              </span>
            </div>

            <h2 className="mt-5 max-w-4xl text-3xl font-black tracking-[-0.055em] text-[#E6EDF7] md:text-5xl">
              {copy.title}
            </h2>

            <p className="mt-4 max-w-4xl text-sm font-semibold leading-7 text-[#94A3B8] md:text-base">
              {summary ? stageDescription() : copy.text}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white/62">
                {summary?.profile.totalReviewedTrades || 0} {copy.reviewedTrades}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white/62">
                {summary?.profile.totalScreenshotReviews || 0} {copy.screenshots}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white/62">
                {summary?.profile.totalAlertLinkedTrades || 0} {copy.alertLinked}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={onOpenJournal}
              className="rounded-full border border-[#00D084]/38 bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#03140D] shadow-[0_18px_60px_rgba(0,192,118,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_80px_rgba(0,192,118,0.32)]"
            >
              {copy.reviewTrade}
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-full border border-[#C8A96B]/25 bg-[#C8A96B]/10 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#F4E8C8] transition hover:bg-[#C8A96B]/16 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? copy.loading : copy.refresh}
            </button>
          </div>
        </div>

        {error ? (
          <div className="relative mt-5 rounded-2xl border border-[#FF5A5F]/20 bg-[#FF5A5F]/10 px-4 py-3 text-xs font-bold leading-5 text-rose-100">
            {error}
          </div>
        ) : null}

        {!summary ? (
          <div className="relative mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-black text-white">{copy.noDataTitle}</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/54">{copy.noDataText}</p>
          </div>
        ) : (
          <div className="relative mt-6 grid gap-3 md:grid-cols-4">
            {scoreCards.map((card) => (
              <div key={card.label} className="rounded-[1.35rem] border border-white/10 bg-[#07111F]/46 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">{card.label}</span>
                  <span className="text-sm font-black text-[#E6EDF7]">{formatScore(card.value)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full bg-gradient-to-r ${card.gradient}`} style={widthStyle(card.value)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {summary ? (
        <>
          <section className="grid gap-4 xl:grid-cols-5">
            {([
  [copy.bestSetup, translate(summary.highlights.bestSetup), "border-[#00C076]/18 bg-[#00C076]/[0.07]"],
  [copy.bestDirection, translate(summary.highlights.bestDirection), "border-white/10 bg-white/[0.045]"],
  [copy.bestAsset, translate(summary.highlights.bestAssetType), "border-white/10 bg-white/[0.045]"],
  [copy.mainRisk, translate(summary.highlights.mainRiskPattern), "border-[#FF5A5F]/18 bg-[#FF5A5F]/[0.07]"],
  [copy.strongestCondition, translate(summary.highlights.strongestCondition), "border-[#C8A96B]/20 bg-[#C8A96B]/[0.08]"],
] as Array<[string, string, string]>).map(([label, value, className]) => (
              <div key={label} className={`rounded-[1.5rem] border p-5 ${className}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">{label}</div>
                <div className="mt-3 text-lg font-black text-[#E6EDF7]">{value}</div>
              </div>
            ))}
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="se-dashboard-card rounded-[2rem] border border-white/[0.08] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00D084]/75">{copy.fingerprints}</div>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                    {topFingerprints.length} {copy.fingerprints}
                  </h3>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {topFingerprints.length ? (
                  topFingerprints.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-[1.4rem] border border-white/10 bg-[#07111F]/42 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-black text-white">{translate(item.setupName)}</div>
                          <div className="mt-1 text-xs font-bold text-white/42">
                            {copy.asset}: {translate(item.assetType)} · {copy.direction}: {translate(item.direction)} · {copy.tier}: {item.tier}
                          </div>
                        </div>

                        <div className="rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/10 px-3 py-1 text-[11px] font-black text-[#F4E8C8]">
                          {copy.confidence}: {formatScore(item.confidenceScore)}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <MetricPill label={copy.winRate} value={formatScore(item.winRate)} />
                        <MetricPill label={copy.trades} value={String(item.totalTrades)} />
                        <MetricPill label={copy.execution} value={formatScore(item.avgExecutionScore)} />
                      </div>

                      {item.confirmationRules.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{copy.confirmation}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.confirmationRules.slice(0, 4).map((rule: unknown, index: number) => (
                              <span key={`${item.id}-rule-${index}`} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[11px] font-bold text-white/58">
                                {translate(asText(rule))}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyEdgeState text={copy.emptyFingerprints} />
                )}
              </div>
            </div>

            <div className="se-dashboard-card rounded-[2rem] border border-white/[0.08] p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FFB4B7]/75">{copy.guard}</div>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                {translate(summary.highlights.mainRiskPattern)}
              </h3>
              <p className="mt-3 text-sm font-semibold leading-7 text-white/55">{riskDescription()}</p>

              <div className="mt-5 space-y-2">
                {rules.length ? (
                  rules.slice(0, 5).map((rule: EdgeAny) => (
                    <div key={rule.id} className="rounded-[1.2rem] border border-white/10 bg-[#07111F]/42 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-white">{translate(rule.title)}</div>
                          {rule.description ? (
                            <p className="mt-1 text-xs font-semibold leading-5 text-white/48">{translate(rule.description)}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-[#FF5A5F]/18 bg-[#FF5A5F]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#FFB4B7]">
                          {rule.action}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyEdgeState text={copy.emptyRules} />
                )}
              </div>
            </div>
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-2">
            <div className="se-dashboard-card rounded-[2rem] border border-white/[0.08] p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#C8A96B]/80">{copy.playbook}</div>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                {playbook.length} {copy.playbook}
              </h3>

              <div className="mt-5 grid gap-3">
                {playbook.length ? (
                  playbook.slice(0, 5).map((item: EdgeAny) => (
                    <div key={item.id} className="rounded-[1.35rem] border border-white/10 bg-[#07111F]/42 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-base font-black text-white">{translate(item.title)}</div>
                        <div className="rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/10 px-3 py-1 text-[11px] font-black text-[#F4E8C8]">
                          {formatScore(item.confidenceScore)}
                        </div>
                      </div>
                      {item.description ? (
                        <p className="mt-2 text-xs font-semibold leading-5 text-white/48">{translate(item.description)}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyEdgeState text={copy.emptyPlaybook} />
                )}
              </div>
            </div>

            <div className="se-dashboard-card rounded-[2rem] border border-white/[0.08] p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00D084]/75">{copy.recentReviews}</div>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                {reviews.length} {copy.recentReviews}
              </h3>

              <div className="mt-5 grid gap-3">
                {reviews.length ? (
                  reviews.slice(0, 5).map((review: EdgeAny, index: number) => (
                    <div key={review.id || index} className="rounded-[1.35rem] border border-white/10 bg-[#07111F]/42 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-black text-white">
                            {review.symbol || "TRADE"} · {translate(review.setupName)}
                          </div>
                          <div className="mt-1 text-xs font-bold text-white/42">
                            {copy.execution}: {formatScore(review.executionScore)} · Risk: {formatScore(review.riskScore)} · RR: {formatScore(review.rrScore)}
                          </div>
                        </div>

                        <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                          review.aPlusCandidate
                            ? "border-[#00C076]/25 bg-[#00C076]/10 text-[#DFFFEF]"
                            : review.avoidPattern
                              ? "border-[#FF5A5F]/22 bg-[#FF5A5F]/10 text-[#FFB4B7]"
                              : "border-white/10 bg-white/[0.05] text-white/50"
                        }`}>
                          {review.aPlusCandidate ? "A+" : review.avoidPattern ? "Guard" : "Review"}
                        </div>
                      </div>

                      {review.publicSummary ? (
                        <p className="mt-2 text-xs font-semibold leading-5 text-white/48">{translate(review.publicSummary)}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyEdgeState text={copy.emptyReviews} />
                )}
              </div>
            </div>
          </section>

          <section className="se-dashboard-card rounded-[2rem] border border-white/[0.08] p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">{copy.nextFocus}</div>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
              {translate(summary.profile.nextFocus)}
            </h3>

            {missingData.length > 0 ? (
              <>
                <div className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/35">{copy.missing}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {missingData.map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-bold text-white/58">
                      {translate(item)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/32">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function EmptyEdgeState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-white/12 bg-white/[0.025] p-5 text-sm font-semibold leading-6 text-white/45">
      {text}
    </div>
  );
}
