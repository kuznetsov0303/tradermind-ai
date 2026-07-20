export type SignalTextLanguage = "en" | "ru" | "ua" | string;

function pick(language: SignalTextLanguage, ru: string, ua: string, en: string) {
  if (language === "en") return en;
  if (language === "ua") return ua;

  return ru;
}

export function translateSignalText(
  input: unknown,
  language: SignalTextLanguage,
): string {
  if (input === null || input === undefined) return "—";

  const original = String(input);

  if (!original.trim()) return "—";
  if (language === "en") return original;

  let value = original;

  const rules: Array<{
    pattern: RegExp;
    ru: string;
    ua: string;
    en: string;
  }> = [
    {
      pattern: /Approved: Grade ([A-D])\. Delivery eligible\. Validator score (\d+)\. Signal passed strict gates\./gi,
      ru: "Одобрено: Grade $1. Готов к отправке. Оценка валидатора $2. Сигнал прошёл строгие гейты.",
      ua: "Схвалено: Grade $1. Готовий до відправки. Оцінка валідатора $2. Сигнал пройшов строгі гейти.",
      en: "$&",
    },
    {
      pattern: /Signal passed strict gates\./gi,
      ru: "Сигнал прошёл строгие гейты.",
      ua: "Сигнал пройшов строгі гейти.",
      en: "$&",
    },
    {
      pattern: /Strict playbook gates, risk review and delivery readiness for this signal\./gi,
      ru: "Строгие playbook-гейты, риск-ревью и готовность сигнала к отправке.",
      ua: "Строгі playbook-гейти, ризик-рев’ю та готовність сигналу до відправки.",
      en: "$&",
    },

    {
      pattern: /Review the setup, wait for confirmation, and trade only if risk\/reward is valid\./gi,
      ru: "Проверь сетап, дождись подтверждения и торгуй только если риск/потенциал остаётся валидным.",
      ua: "Перевір сетап, дочекайся підтвердження і торгуй тільки якщо ризик/потенціал залишається валідним.",
      en: "$&",
    },
    {
      pattern: /Core signal quality based on market activity, setup quality, catalyst\/social context and risk structure\./gi,
      ru: "Базовое качество сигнала основано на активности рынка, качестве сетапа, catalyst/social context и структуре риска.",
      ua: "Базова якість сигналу базується на активності ринку, якості сетапу, catalyst/social context і структурі ризику.",
      en: "$&",
    },
    {
      pattern: /The alert should still be traded only if the trigger\/confirmation condition is respected\./gi,
      ru: "Сигнал можно рассматривать только если условие trigger/confirmation всё ещё соблюдается.",
      ua: "Сигнал можна розглядати тільки якщо умова trigger/confirmation все ще дотримується.",
      en: "$&",
    },
    {
      pattern: /SkillEdge detected market activity, setup context and R:R conditions that made this ticker worth reviewing\./gi,
      ru: "SkillEdge обнаружил рыночную активность, контекст сетапа и R:R условия, из-за которых тикер стоит разобрать.",
      ua: "SkillEdge виявив ринкову активність, контекст сетапу та R:R умови, через які тікер варто розібрати.",
      en: "$&",
    },

    {
      pattern: /Candidate must match a known SkillEdge setup playbook\./gi,
      ru: "Кандидат должен соответствовать известному сетапу SkillEdge.",
      ua: "Кандидат має відповідати відомому сетапу SkillEdge.",
      en: "$&",
    },
    {
      pattern: /WATCH candidates are observations, not premium actionable alerts\./gi,
      ru: "WATCH-кандидаты — это наблюдения, а не premium actionable alerts.",
      ua: "WATCH-кандидати — це спостереження, а не premium actionable alerts.",
      en: "$&",
    },
    {
      pattern: /No approval without entry or trigger area\./gi,
      ru: "Нельзя одобрять сигнал без зоны входа или триггера.",
      ua: "Не можна схвалювати сигнал без зони входу або тригера.",
      en: "$&",
    },
    {
      pattern: /No approval without invalidation\./gi,
      ru: "Нельзя одобрять сигнал без invalidation/стопа.",
      ua: "Не можна схвалювати сигнал без invalidation/стопу.",
      en: "$&",
    },
    {
      pattern: /No approval without reward side\./gi,
      ru: "Нельзя одобрять сигнал без целей.",
      ua: "Не можна схвалювати сигнал без цілей.",
      en: "$&",
    },
    {
      pattern: /Premium signals require at least 2R structure\./gi,
      ru: "Premium-сигнал требует структуру минимум 2R.",
      ua: "Premium-сигнал потребує структуру мінімум 2R.",
      en: "$&",
    },
    {
      pattern: /Critical data fields must be present before approval\./gi,
      ru: "Перед одобрением должны быть ключевые данные.",
      ua: "Перед схваленням мають бути ключові дані.",
      en: "$&",
    },
    {
      pattern: /Setup must fit playbook logic\./gi,
      ru: "Сетап должен соответствовать логике playbook.",
      ua: "Сетап має відповідати логіці playbook.",
      en: "$&",
    },
    {
      pattern: /Low completeness means validator should downgrade\./gi,
      ru: "Низкая полнота данных должна понижать оценку.",
      ua: "Низька повнота даних має знижувати оцінку.",
      en: "$&",
    },
    {
      pattern: /Risk profile must be acceptable\./gi,
      ru: "Риск-профиль должен быть приемлемым.",
      ua: "Ризик-профіль має бути прийнятним.",
      en: "$&",
    },
    {
      pattern: /Low source confidence should prevent premium delivery\./gi,
      ru: "Низкая уверенность источника блокирует premium delivery.",
      ua: "Низька впевненість джерела блокує premium delivery.",
      en: "$&",
    },

    {
      pattern: /Entry\/trigger present:/gi,
      ru: "Вход/триггер есть:",
      ua: "Вхід/тригер є:",
      en: "$&",
    },
    {
      pattern: /Validate only if price is not extended and confirmation is current\./gi,
      ru: "Валидно только если цена не растянута и подтверждение актуально.",
      ua: "Валідно тільки якщо ціна не розтягнута і підтвердження актуальне.",
      en: "$&",
    },
    {
      pattern: /Stop\/invalidation present:/gi,
      ru: "Стоп/invalidation есть:",
      ua: "Стоп/invalidation є:",
      en: "$&",
    },
    {
      pattern: /Signal must be invalidated if this level breaks\./gi,
      ru: "Сигнал отменяется при пробое этого уровня.",
      ua: "Сигнал скасовується при пробої цього рівня.",
      en: "$&",
    },
    {
      pattern: /Targets present:/gi,
      ru: "Цели есть:",
      ua: "Цілі є:",
      en: "$&",
    },
    {
      pattern: /RR detected:/gi,
      ru: "R:R:",
      ua: "R:R:",
      en: "$&",
    },
    {
      pattern: /Meets minimum 2R structure\./gi,
      ru: "Минимум 2R соблюдён.",
      ua: "Мінімум 2R дотримано.",
      en: "$&",
    },

    {
      pattern: /Treat as ACTIVE only if entry\/stop\/targets are still valid and RR has not compressed\./gi,
      ru: "Считать ACTIVE только если вход/стоп/цели всё ещё валидны и R:R не сжался.",
      ua: "Вважати ACTIVE тільки якщо вхід/стоп/цілі ще валідні і R:R не стиснувся.",
      en: "$&",
    },
    {
      pattern: /Maintain 2R\+ structure\. If entry worsens and RR drops below 2R, downgrade\./gi,
      ru: "Сохранять структуру 2R+. Если вход ухудшился и R:R упал ниже 2R — понизить сигнал.",
      ua: "Зберігати структуру 2R+. Якщо вхід погіршився і R:R впав нижче 2R — знизити сигнал.",
      en: "$&",
    },
    {
      pattern: /If invalidation triggers, the idea is dead; do not average down or reframe the setup\./gi,
      ru: "Если сработал invalidation — идея отменена. Не усредняться и не переобъяснять сетап.",
      ua: "Якщо спрацював invalidation — ідею скасовано. Не усереднюватися і не переосмислювати сетап.",
      en: "$&",
    },

    {
      pattern: /Take partial profit at TP1, reduce risk if price stalls, and keep the runner only if selling pressure continues\. Do not chase if entry is far below the planned zone\./gi,
      ru: "Часть прибыли фиксировать на TP1, снижать риск если цена стопорится, runner держать только если давление продавцов продолжается. Не догонять, если вход уже далеко ниже плановой зоны.",
      ua: "Частину прибутку фіксувати на TP1, знижувати ризик якщо ціна стопориться, runner тримати тільки якщо тиск продавців триває. Не наздоганяти, якщо вхід уже далеко нижче планової зони.",
      en: "$&",
    },
    {
      pattern: /Enter only while price remains near the trigger zone\. Cover partial at TP1, then trail above lower highs\. Do not chase after TP1 is almost reached\./gi,
      ru: "Входить только пока цена рядом с trigger zone. Частично крыть на TP1, затем трейлить выше lower highs. Не догонять, если TP1 почти достигнут.",
      ua: "Входити тільки поки ціна поруч із trigger zone. Частково крити на TP1, потім трейлити вище lower highs. Не наздоганяти, якщо TP1 майже досягнуто.",
      en: "$&",
    },

    {
      pattern: /Risk warnings:/gi,
      ru: "Риски:",
      ua: "Ризики:",
      en: "$&",
    },
    {
      pattern: /Failed short if price reclaims sweep high\./gi,
      ru: "Short ломается, если цена вернёт sweep high.",
      ua: "Short ламається, якщо ціна поверне sweep high.",
      en: "$&",
    },
    {
      pattern: /Avoid strong BTC\/ETH squeeze\./gi,
      ru: "Избегать при сильном squeeze BTC/ETH.",
      ua: "Уникати при сильному squeeze BTC/ETH.",
      en: "$&",
    },
    {
      pattern: /Do not chase far from rejection\./gi,
      ru: "Не догонять далеко от rejection-зоны.",
      ua: "Не наздоганяти далеко від rejection-зони.",
      en: "$&",
    },
    {
      pattern: /Avoid conditions:/gi,
      ru: "Не торговать, если:",
      ua: "Не торгувати, якщо:",
      en: "$&",
    },
    {
      pattern: /No rejection\./gi,
      ru: "Нет rejection.",
      ua: "Немає rejection.",
      en: "$&",
    },
    {
      pattern: /No 5m confirmation\./gi,
      ru: "Нет 5m confirmation.",
      ua: "Немає 5m confirmation.",
      en: "$&",
    },
    {
      pattern: /BTC\/ETH strongly against idea\./gi,
      ru: "BTC/ETH сильно против идеи.",
      ua: "BTC/ETH сильно проти ідеї.",
      en: "$&",
    },
    {
      pattern: /TP1 below 2R\./gi,
      ru: "TP1 ниже 2R.",
      ua: "TP1 нижче 2R.",
      en: "$&",
    },
    {
      pattern: /Move is already heavily extended; late entries need stricter confirmation\./gi,
      ru: "Движение уже сильно растянуто; поздние входы требуют более строгого подтверждения.",
      ua: "Рух уже сильно розтягнутий; пізні входи потребують суворішого підтвердження.",
      en: "$&",
    },

    {
      pattern: /A trendline touch without 5m structure confirmation is not enough\./gi,
      ru: "Касания trendline недостаточно без подтверждения структуры на 5m.",
      ua: "Дотику trendline недостатньо без підтвердження структури на 5m.",
      en: "$&",
    },
    {
      pattern: /Duplicate blocked by 60m watch cooldown\./gi,
      ru: "Дубликат заблокирован 60m watch cooldown.",
      ua: "Дублікат заблоковано 60m watch cooldown.",
      en: "$&",
    },
    {
      pattern: /Short trigger: failed level\/rejection confirms and price breaks lower/gi,
      ru: "Short-триггер: failed level/rejection подтверждается, и цена пробивает ниже.",
      ua: "Short-тригер: failed level/rejection підтверджується, і ціна пробиває нижче.",
      en: "$&",
    },
    {
      pattern: /Volume gate: volume ([\d,.$\sA-Z]+) >= ([\d,.$\sA-Z]+)/gi,
      ru: "Volume gate: объём $1 >= $2",
      ua: "Volume gate: обсяг $1 >= $2",
      en: "$&",
    },
    {
      pattern: /Execution trigger: wait for 3m\/5m execution confirmation before entry/gi,
      ru: "Execution trigger: дождаться 3m/5m подтверждения перед входом.",
      ua: "Execution trigger: дочекатися 3m/5m підтвердження перед входом.",
      en: "$&",
    },
    {
      pattern: /Entry window: Price is ([\d.]+)% away from entry zone; wait for a cleaner pullback\/retest\./gi,
      ru: "Окно входа: цена на $1% от зоны входа. Ждать более чистый pullback/retest.",
      ua: "Вікно входу: ціна на $1% від зони входу. Чекати чистіший pullback/retest.",
      en: "$&",
    },
    {
      pattern: /Entry window is still valid\./gi,
      ru: "Окно входа всё ещё валидно.",
      ua: "Вікно входу все ще валідне.",
      en: "$&",
    },
    {
      pattern: /In-play market confirmed\./gi,
      ru: "In-play рынок подтверждён.",
      ua: "In-play ринок підтверджено.",
      en: "$&",
    },
    {
      pattern: /1H\/4H trend\/context checked\./gi,
      ru: "1H/4H trend/context проверен.",
      ua: "1H/4H trend/context перевірено.",
      en: "$&",
    },
    {
      pattern: /Impulse identified\./gi,
      ru: "Импульс найден.",
      ua: "Імпульс знайдено.",
      en: "$&",
    },
    {
      pattern: /Pullback into trendline\/structure confirmed\./gi,
      ru: "Pullback в trendline/структуру подтверждён.",
      ua: "Pullback у trendline/структуру підтверджено.",
      en: "$&",
    },

    {
      pattern: /No clean first impulse\./gi,
      ru: "Нет чистого первого импульса.",
      ua: "Немає чистого першого імпульсу.",
      en: "$&",
    },
    {
      pattern: /No controlled pullback\./gi,
      ru: "Нет контролируемого pullback.",
      ua: "Немає контрольованого pullback.",
      en: "$&",
    },
    {
      pattern: /No 5m structure confirmation\./gi,
      ru: "Нет подтверждения структуры на 5m.",
      ua: "Немає підтвердження структури на 5m.",
      en: "$&",
    },
    {
      pattern: /No clear stop behind structure\./gi,
      ru: "Нет понятного стопа за структурой.",
      ua: "Немає зрозумілого стопа за структурою.",
      en: "$&",
    },
    {
      pattern: /No structural target with at least 2R\./gi,
      ru: "Нет структурной цели минимум на 2R.",
      ua: "Немає структурної цілі мінімум на 2R.",
      en: "$&",
    },

    {
      pattern: /Trendline Pullback Structure Continuation is not a blind trendline touch\. The edge comes from impulse, controlled pullback, 5m structure confirmation and enough HTF room for at least 2R\./gi,
      ru: "Trendline Pullback Structure Continuation — это не слепое касание trendline. Edge появляется из импульса, контролируемого pullback, подтверждения структуры на 5m и достаточного HTF-пространства минимум на 2R.",
      ua: "Trendline Pullback Structure Continuation — це не сліпий дотик trendline. Edge з’являється з імпульсу, контрольованого pullback, підтвердження структури на 5m і достатнього HTF-простору мінімум на 2R.",
      en: "$&",
    },
    {
      pattern: /Trend continuation setup after the first impulse, a controlled pullback into trendline\/structure, and a fresh 5m structure confirmation in the trend direction\./gi,
      ru: "Trend continuation сетап после первого импульса, контролируемого pullback в trendline/структуру и свежего 5m подтверждения по направлению тренда.",
      ua: "Trend continuation сетап після першого імпульсу, контрольованого pullback у trendline/структуру і свіжого 5m підтвердження за напрямом тренду.",
      en: "$&",
    },

    {
      pattern: /Price movement is large enough to attract active traders\./gi,
      ru: "Движение достаточно сильное, чтобы привлечь активных трейдеров.",
      ua: "Рух достатньо сильний, щоб привернути активних трейдерів.",
      en: "$&",
    },
    {
      pattern: /News or catalyst context supports attention\./gi,
      ru: "News/catalyst context поддерживает внимание к тикеру.",
      ua: "News/catalyst context підтримує увагу до тікера.",
      en: "$&",
    },
    {
      pattern: /Liquidity quality supports tradable execution\./gi,
      ru: "Качество ликвидности поддерживает исполнимый трейд.",
      ua: "Якість ліквідності підтримує виконуваний трейд.",
      en: "$&",
    },
    {
      pattern: /Recent candle pattern supports the trigger\./gi,
      ru: "Последний candle pattern поддерживает trigger.",
      ua: "Останній candle pattern підтримує trigger.",
      en: "$&",
    },
    {
      pattern: /Target room is acceptable\./gi,
      ru: "Пространство до цели приемлемое.",
      ua: "Простір до цілі прийнятний.",
      en: "$&",
    },
    {
      pattern: /Risk\/reward at least 2:1\./gi,
      ru: "Risk/reward минимум 2:1.",
      ua: "Risk/reward мінімум 2:1.",
      en: "$&",
    },
    {
      pattern: /Risk\/reward is strong\./gi,
      ru: "Risk/reward сильный.",
      ua: "Risk/reward сильний.",
      en: "$&",
    },
  ];

  for (const rule of rules) {
    value = value.replace(
      rule.pattern,
      pick(language, rule.ru, rule.ua, rule.en),
    );
  }

  const wordRules: Array<{
    pattern: RegExp;
    ru: string;
    ua: string;
    en: string;
  }> = [
    { pattern: /\bSignal review\b/gi, ru: "Разбор сигнала", ua: "Розбір сигналу", en: "$&" },
    { pattern: /\bReview\b/gi, ru: "Разбор", ua: "Розбір", en: "$&" },
    { pattern: /\bBase confidence\b/gi, ru: "Базовая уверенность", ua: "Базова впевненість", en: "$&" },
    { pattern: /\bRisk filter\b/gi, ru: "Фильтр риска", ua: "Фільтр ризику", en: "$&" },
    { pattern: /\bTrigger logic\b/gi, ru: "Логика триггера", ua: "Логіка тригера", en: "$&" },
    { pattern: /\bManagement plan\b/gi, ru: "План ведения", ua: "План ведення", en: "$&" },
    { pattern: /\bEntry\b/gi, ru: "Вход", ua: "Вхід", en: "$&" },
    { pattern: /\bStop\b/gi, ru: "Стоп", ua: "Стоп", en: "$&" },
    { pattern: /\bTargets\b/gi, ru: "Цели", ua: "Цілі", en: "$&" },
    { pattern: /\bTarget\b/gi, ru: "Цель", ua: "Ціль", en: "$&" },
    { pattern: /\bDirection\b/gi, ru: "Направление", ua: "Напрям", en: "$&" },
    { pattern: /\bdownside\b/gi, ru: "short/downside", ua: "short/downside", en: "$&" },
    { pattern: /\bupside\b/gi, ru: "long/upside", ua: "long/upside", en: "$&" },
    { pattern: /\bWait trigger\b/gi, ru: "Ждать триггер", ua: "Чекати тригер", en: "$&" },
    { pattern: /\bsetup\b/gi, ru: "сетап", ua: "сетап", en: "$&" },
    { pattern: /\bconfirmation\b/gi, ru: "подтверждение", ua: "підтвердження", en: "$&" },
    { pattern: /\bconfirmed\b/gi, ru: "подтверждено", ua: "підтверджено", en: "$&" },
    { pattern: /\bbefore entry\b/gi, ru: "перед входом", ua: "перед входом", en: "$&" },
    { pattern: /\bwait for\b/gi, ru: "ждать", ua: "чекати", en: "$&" },
    { pattern: /\bcontext\b/gi, ru: "контекст", ua: "контекст", en: "$&" },
    { pattern: /\btrigger\b/gi, ru: "триггер", ua: "тригер", en: "$&" },
    { pattern: /\bdelivery\b/gi, ru: "отправке", ua: "відправці", en: "$&" },
  ];

  for (const rule of wordRules) {
    value = value.replace(
      rule.pattern,
      pick(language, rule.ru, rule.ua, rule.en),
    );
  }

  return value;
}

export function translateSignalRows(
  rows: unknown[],
  language: SignalTextLanguage,
): string[] {
  return rows.map((row) => translateSignalText(row, language));
}