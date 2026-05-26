"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupportLanguage = "ru" | "en" | "ua";
type SupportMode = "menu" | "email" | "chat";

type SupportMessage = {
  id: string;
  role: "assistant" | "user" | "operator" | "system";
  text: string;
  createdAt?: string;
};

type StoredSupportMessage = {
  id: string;
  sender_type: "assistant" | "user" | "operator" | "system";
  message_text: string;
  created_at: string;
};

type LoadedSupportSession = {
  sessionId: string;
  anonymousId: string;
};

const supportDict = {
  ru: {
    title: "SKILLEDGE SUPPORT",
    subtitle: "Product desk на связи",
    intro:
      "Привет. Я помогу быстро сориентироваться по SkillEdge: тарифы, оплата, кабинет, журнал, AI Coach, Reports, Market Scanner и AI Alerts. Напиши вопрос — я дам короткий ответ и параллельно передам обращение оператору.",
    placeholder: "Спросите про оплату, тариф, журнал, AI Alerts...",
    send: "Отправить",
    sending: "Отправляю...",
    operatorSuccess: "Запрос оператору отправлен. Мы получили ваше сообщение.",
    operatorError:
      "Не удалось отправить запрос оператору. Проверьте Telegram-настройки или попробуйте позже.",
    floatingLabel: "Поддержка",
    chooseTitle: "Чем помочь?",
    chooseSubtitle:
      "SkillEdge Support помогает по продукту, оплате, доступу и работе кабинета. Без воды — быстро разберём вопрос.",
    emailTitle: "Email-заявка",
    emailText:
      "Для вопросов по доступу, оплате или аккаунту. Оставьте email и детали — команда вернётся с ответом.",
    chatTitle: "Быстрый чат",
    chatText:
      "Напишите вопрос. Вы получите быстрый product-desk ответ, а оператор увидит обращение в support-панели.",
    emailHeading: "Отправьте запрос в поддержку",
    emailDescription:
      "Укажите email и контекст: тариф, оплата, ошибка, страница или действие. Чем точнее описание — тем быстрее решение.",
    emailPlaceholder: "your@email.com",
    questionPlaceholder: "Опишите вопрос: тариф, оплата, журнал, сигналы, доступ...",
    sendEmail: "Отправить запрос",
    sendingEmail: "Отправляю...",
    emailSuccess:
      "Запрос отправлен. Команда SkillEdge проверит детали и ответит на указанный email.",
    emailError:
      "Не удалось отправить запрос. Проверьте email и попробуйте ещё раз.",
    back: "Назад",
    emailSavedNotice:
      "Заявка сохранится в системе поддержки и уйдёт команде SkillEdge AI.",
    chatOperatorNotice:
      "Каждое сообщение уходит оператору. Быстрый ответ в чате помогает сразу понять направление, но сложные вопросы проверяет команда.",
    disclaimer:
      "SkillEdge AI не является финансовым консультантом. Поддержка помогает с продуктом, доступом, оплатой, кабинетом и общими вопросами платформы.",
    shortcutsTitle: "Быстрые вопросы",
    quickQuestions: [
      "Тарифы и доступ",
      "Оплата криптой",
      "AI Alerts",
      "Журнал сделок",
      "Позвать оператора",
    ],
  },

  en: {
    title: "SKILLEDGE SUPPORT",
    subtitle: "Product desk online",
    intro:
      "Hi. I can quickly guide you through SkillEdge: plans, payments, dashboard, journal, AI Coach, Reports, Market Scanner and AI Alerts. Send your question — I’ll give a short product-desk answer and route it to an operator.",
    placeholder: "Ask about payment, plans, journal, AI Alerts...",
    send: "Send",
    sending: "Sending...",
    operatorSuccess: "Operator request sent. We received your message.",
    operatorError:
      "Failed to send operator request. Check Telegram settings or try again later.",
    floatingLabel: "Support",
    chooseTitle: "How can we help?",
    chooseSubtitle:
      "SkillEdge Support helps with product, payment, access and dashboard workflows. No noise — just a clear answer.",
    emailTitle: "Email request",
    emailText:
      "Best for access, billing or account questions. Leave your email and details — the team will reply.",
    chatTitle: "Fast chat",
    chatText:
      "Write your question. You’ll get a quick product-desk answer and the operator will see the request in the support panel.",
    emailHeading: "Send a support request",
    emailDescription:
      "Add your email and context: plan, payment, error, page or action. More detail means faster resolution.",
    emailPlaceholder: "your@email.com",
    questionPlaceholder: "Describe the issue: plan, payment, journal, alerts, access...",
    sendEmail: "Send request",
    sendingEmail: "Sending...",
    emailSuccess:
      "Request sent. The SkillEdge team will review it and reply to the email you provided.",
    emailError:
      "Could not send the request. Please check your email and try again.",
    back: "Back",
    emailSavedNotice:
      "The request will be saved in the support system and sent to the SkillEdge AI team.",
    chatOperatorNotice:
      "Every message is routed to an operator. The quick chat answer gives immediate direction; complex issues are checked by the team.",
    disclaimer:
      "SkillEdge AI is not a financial advisor. Support helps with product, access, payment, dashboard and general platform questions.",
    shortcutsTitle: "Fast questions",
    quickQuestions: [
      "Plans and access",
      "Crypto payment",
      "AI Alerts",
      "Trade journal",
      "Contact operator",
    ],
  },

  ua: {
    title: "SKILLEDGE SUPPORT",
    subtitle: "Product desk на зв’язку",
    intro:
      "Привіт. Я швидко зорієнтую по SkillEdge: тарифи, оплата, кабінет, журнал, AI Coach, Reports, Market Scanner та AI Alerts. Напишіть питання — я дам коротку відповідь і передам звернення оператору.",
    placeholder: "Запитайте про оплату, тариф, журнал, AI Alerts...",
    send: "Надіслати",
    sending: "Надсилаю...",
    operatorSuccess: "Запит оператору надіслано. Ми отримали ваше повідомлення.",
    operatorError:
      "Не вдалося надіслати запит оператору. Перевірте Telegram-налаштування або спробуйте пізніше.",
    floatingLabel: "Підтримка",
    chooseTitle: "Чим допомогти?",
    chooseSubtitle:
      "SkillEdge Support допомагає з продуктом, оплатою, доступом і роботою кабінету. Без зайвого шуму — швидко по суті.",
    emailTitle: "Email-заявка",
    emailText:
      "Для питань по доступу, оплаті або акаунту. Залиште email і деталі — команда відповість.",
    chatTitle: "Швидкий чат",
    chatText:
      "Напишіть питання. Ви отримаєте швидку product-desk відповідь, а оператор побачить звернення в support-панелі.",
    emailHeading: "Надішліть запит у підтримку",
    emailDescription:
      "Вкажіть email і контекст: тариф, оплата, помилка, сторінка або дія. Чим точніший опис — тим швидше рішення.",
    emailPlaceholder: "your@email.com",
    questionPlaceholder: "Опишіть питання: тариф, оплата, журнал, сигнали, доступ...",
    sendEmail: "Надіслати запит",
    sendingEmail: "Надсилаю...",
    emailSuccess:
      "Запит надіслано. Команда SkillEdge перевірить деталі й відповість на вказаний email.",
    emailError:
      "Не вдалося надіслати запит. Перевірте email і спробуйте ще раз.",
    back: "Назад",
    emailSavedNotice:
      "Заявку буде збережено в системі підтримки та відправлено команді SkillEdge AI.",
    chatOperatorNotice:
      "Кожне повідомлення йде оператору. Швидка відповідь у чаті дає напрямок одразу, складні питання перевіряє команда.",
    disclaimer:
      "SkillEdge AI не є фінансовим консультантом. Підтримка допомагає з продуктом, доступом, оплатою, кабінетом і загальними питаннями платформи.",
    shortcutsTitle: "Швидкі питання",
    quickQuestions: [
      "Тарифи і доступ",
      "Оплата криптою",
      "AI Alerts",
      "Журнал угод",
      "Покликати оператора",
    ],
  },
};

function createMessage(role: SupportMessage["role"], text: string): SupportMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function getStoredSupportLanguage(): SupportLanguage | null {
  if (typeof window === "undefined") return null;

  const keys = [
    "skilledge_language",
    "skilledge_dashboard_language",
    "language",
    "locale",
    "selectedLanguage",
    "app_language",
    "dashboard_language",
    "site_language",
  ];

  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.toLowerCase();

    if (value === "ru") return "ru";
    if (value === "ua" || value === "uk") return "ua";
    if (value === "en") return "en";
  }

  return null;
}

function detectLanguage(): SupportLanguage {
  if (typeof window === "undefined") return "ru";

  const storedLanguage = getStoredSupportLanguage();

  if (storedLanguage) {
    return storedLanguage;
  }

  const path = window.location.pathname.toLowerCase();
  const pageText = document.body.innerText.toLowerCase();

  if (path.includes("/ua") || path.includes("/uk")) return "ua";
  if (path.includes("/en")) return "en";

  if (
    pageText.includes("запросити демо") ||
    pageText.includes("кабінет") ||
    pageText.includes("вийти") ||
    pageText.includes("тарифи") ||
    pageText.includes("про нас")
  ) {
    return "ua";
  }

  if (
    pageText.includes("запросить демо") ||
    pageText.includes("кабинет") ||
    pageText.includes("выйти") ||
    pageText.includes("тарифы") ||
    pageText.includes("о нас")
  ) {
    return "ru";
  }

  if (
    pageText.includes("request demo") ||
    pageText.includes("dashboard") ||
    pageText.includes("logout") ||
    pageText.includes("pricing") ||
    pageText.includes("about us")
  ) {
    return "en";
  }

  return "ru";
}

function getAnonymousId() {
  if (typeof window === "undefined") return "";

  const existingId = window.localStorage.getItem("support_anonymous_id");

  if (existingId) return existingId;

  const newId = crypto.randomUUID();

  window.localStorage.setItem("support_anonymous_id", newId);

  return newId;
}

function translateStoredMessageText(text: string, language: SupportLanguage) {
  if (
    text === "Operator request sent." ||
    text === "Запрос оператору отправлен." ||
    text === "Запит оператору надіслано."
  ) {
    if (language === "en") return supportDict.en.operatorSuccess;
    if (language === "ua") return supportDict.ua.operatorSuccess;
    return supportDict.ru.operatorSuccess;
  }

  if (
    text === "Email support request sent." ||
    text === "Email request sent."
  ) {
    if (language === "en") return supportDict.en.emailSuccess;
    if (language === "ua") return supportDict.ua.emailSuccess;
    return supportDict.ru.emailSuccess;
  }

  if (
    text === "Chat closed by operator." ||
    text === "Чат закрыт оператором." ||
    text === "Чат закрито оператором."
  ) {
    if (language === "en") return "Chat closed by operator.";
    if (language === "ua") return "Чат закрито оператором.";
    return "Чат закрыт оператором.";
  }

  return text;
}

function isIntroMessage(text: string) {
  return (
    text === supportDict.ru.intro ||
    text === supportDict.en.intro ||
    text === supportDict.ua.intro
  );
}

function normalizeSupportQuestion(text: string) {
  return text.toLowerCase().replace(/ё/g, "е");
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildSupportAssistantReply(
  question: string,
  language: SupportLanguage
) {
  const text = normalizeSupportQuestion(question);

  const isPricing = includesAny(text, [
    "тариф",
    "цена",
    "прайс",
    "plan",
    "pricing",
    "price",
    "core",
    "edge",
    "elite",
    "доступ",
    "access",
    "підпис",
    "підписка",
  ]);

  const isPayment = includesAny(text, [
    "оплат",
    "crypto",
    "крипт",
    "payment",
    "billing",
    "txid",
    "usdt",
    "карта",
    "stripe",
    "invoice",
  ]);

  const isAlerts = includesAny(text, [
    "alert",
    "alerts",
    "сигнал",
    "сигналы",
    "ai alerts",
    "scanner",
    "сканер",
    "market",
    "brief",
    "алерт",
    "сигнали",
  ]);

  const isJournal = includesAny(text, [
    "journal",
    "журнал",
    "trade",
    "trades",
    "сделк",
    "угод",
    "скрин",
    "screenshot",
    "pnl",
    "статист",
  ]);

  const isCoach = includesAny(text, [
    "coach",
    "коуч",
    "чат",
    "ai coach",
    "помощ",
    "аналіз",
    "анализ",
    "review",
  ]);

  const isReports = includesAny(text, [
    "report",
    "reports",
    "отчет",
    "отчёт",
    "звіт",
    "аналитика",
    "analytics",
  ]);

  const isOperator = includesAny(text, [
    "оператор",
    "operator",
    "human",
    "человек",
    "людина",
    "менеджер",
    "support",
    "поддерж",
    "підтрим",
  ]);

  if (language === "en") {
    if (isPricing) {
      return [
        "Desk answer: SkillEdge has three access levels.",
        "Core: journal, screenshots, AI Coach and basic discipline workflow.",
        "Edge: stronger review, reports, Market Intelligence and AI Market Brief.",
        "Elite: full AI Trading Desk — AI Alerts, floating alerts widget, signal-to-journal workflow and advanced review.",
        "Action: tell me which feature you need most, and the operator will help confirm the right plan.",
      ].join("\n");
    }

    if (isPayment) {
      return [
        "Desk answer: current launch flow supports crypto payment.",
        "Process: choose plan → get payment instructions → send TXID/proof → access is activated after confirmation.",
        "Cards/Stripe can be added later, but production access should always be verified through the billing record.",
        "Action: send your plan + TXID/proof if payment was already made.",
      ].join("\n");
    }

    if (isAlerts) {
      return [
        "Desk answer: AI Alerts are not blind calls.",
        "A valid alert needs: in-play ticker, setup, trigger, entry zone, stop/invalidation, targets, RR and risk note.",
        "Edge gets Market Intelligence / AI Market Brief. Elite gets real-time actionable AI Alerts and signal tracking.",
        "Action: if you do not see alerts, check plan access first, then market data / scanner status.",
      ].join("\n");
    }

    if (isJournal) {
      return [
        "Desk answer: the journal is the core of the trader profile.",
        "Trades, screenshots, setups, PnL, mistakes and execution quality build the personal pattern profile.",
        "Later, SkillEdge can compare alerts with real execution and highlight what fits the trader best.",
        "Action: upload trades and screenshots consistently — clean data creates better review.",
      ].join("\n");
    }

    if (isReports) {
      return [
        "Desk answer: Reports turn journal data into a performance review.",
        "Focus: what works, what leaks money, setup quality, execution quality, risk discipline and next fixes.",
        "Action: generate reports after enough trades are logged; 10+ trades gives a better first read.",
      ].join("\n");
    }

    if (isCoach) {
      return [
        "Desk answer: AI Coach is built for process, not hype.",
        "Use it for rules, risk discipline, trade review, preparation and correction of repeated mistakes.",
        "Best prompt: describe the trade, setup, entry, stop, target, emotion and result.",
        "Action: ask a specific execution question for the strongest answer.",
      ].join("\n");
    }

    if (isOperator) {
      return [
        "Operator request routed.",
        "Add the exact page, plan, email/account and what action failed. That gives support enough context to solve it faster.",
      ].join("\n");
    }

    return [
      "Desk answer: I routed this to support.",
      "For a faster fix, include: page, plan, email/account, what you clicked, what happened, and a screenshot if possible.",
      "SkillEdge Support can help with access, plans, payment, journal, screenshots, AI Coach, Reports, Market Intelligence and AI Alerts.",
    ].join("\n");
  }

  if (language === "ua") {
    if (isPricing) {
      return [
        "Desk-відповідь: у SkillEdge три рівні доступу.",
        "Core: журнал, скріншоти, AI Coach і базова дисципліна.",
        "Edge: глибший review, звіти, Market Intelligence та AI Market Brief.",
        "Elite: повний AI Trading Desk — AI Alerts, floating alerts widget, зв’язка сигналів із журналом і просунутий review.",
        "Дія: напишіть, яка функція потрібна найбільше — оператор допоможе підтвердити тариф.",
      ].join("\n");
    }

    if (isPayment) {
      return [
        "Desk-відповідь: на етапі запуску основний flow — оплата криптою.",
        "Процес: вибір тарифу → інструкція оплати → TXID/підтвердження → доступ активується після перевірки.",
        "Карти/Stripe можна додати пізніше, але доступ має підтверджуватися через billing-запис.",
        "Дія: якщо оплату вже зроблено, надішліть тариф + TXID/підтвердження.",
      ].join("\n");
    }

    if (isAlerts) {
      return [
        "Desk-відповідь: AI Alerts — це не сліпі buy/sell сигнали.",
        "Сигнал має містити: in-play тикер, setup, trigger, entry zone, stop/invalidation, targets, RR і risk note.",
        "Edge отримує Market Intelligence / AI Market Brief. Elite отримує real-time actionable AI Alerts і tracking сигналів.",
        "Дія: якщо сигналів не видно — спершу перевірте тариф, потім статус market data / scanner.",
      ].join("\n");
    }

    if (isJournal) {
      return [
        "Desk-відповідь: журнал — основа персонального профілю трейдера.",
        "Угоди, скріншоти, сетапи, PnL, помилки та якість виконання формують pattern profile.",
        "Пізніше SkillEdge порівнює alerts із реальним виконанням і підсвічує те, що краще підходить трейдеру.",
        "Дія: стабільно додавайте угоди й скріншоти — чисті дані дають сильніший review.",
      ].join("\n");
    }

    if (isReports) {
      return [
        "Desk-відповідь: Reports перетворюють журнал на performance review.",
        "Фокус: що працює, що забирає гроші, якість сетапів, виконання, ризик-дисципліна і пріоритетні правки.",
        "Дія: генеруйте звіти після накопичення угод; 10+ угод дають кращий перший зріз.",
      ].join("\n");
    }

    if (isCoach) {
      return [
        "Desk-відповідь: AI Coach створений для процесу, а не для хайпу.",
        "Використовуйте його для правил, ризик-дисципліни, review угод, підготовки й виправлення повторюваних помилок.",
        "Найкращий запит: опишіть угоду, setup, entry, stop, target, емоцію і результат.",
        "Дія: поставте конкретне питання по виконанню — відповідь буде сильнішою.",
      ].join("\n");
    }

    if (isOperator) {
      return [
        "Запит оператору передано.",
        "Додайте сторінку, тариф, email/акаунт і що саме не спрацювало. Так підтримка вирішить питання швидше.",
      ].join("\n");
    }

    return [
      "Desk-відповідь: я передав звернення в підтримку.",
      "Для швидшого рішення додайте: сторінку, тариф, email/акаунт, що натиснули, що сталося, і скріншот за можливості.",
      "SkillEdge Support допомагає з доступом, тарифами, оплатою, журналом, скріншотами, AI Coach, Reports, Market Intelligence та AI Alerts.",
    ].join("\n");
  }

  if (isPricing) {
    return [
      "Desk-ответ: в SkillEdge три уровня доступа.",
      "Core: журнал, скриншоты, AI Coach и базовая дисциплина.",
      "Edge: более сильный review, отчёты, Market Intelligence и AI Market Brief.",
      "Elite: полный AI Trading Desk — AI Alerts, floating alerts widget, связка сигналов с журналом и продвинутый разбор.",
      "Действие: напиши, какая функция нужна больше всего — оператор поможет подтвердить подходящий тариф.",
    ].join("\n");
  }

  if (isPayment) {
    return [
      "Desk-ответ: на этапе запуска основной flow — оплата криптой.",
      "Процесс: выбрать тариф → получить инструкцию оплаты → отправить TXID/подтверждение → доступ активируется после проверки.",
      "Карты/Stripe можно добавить позже, но доступ должен подтверждаться через billing-запись.",
      "Действие: если уже оплатил — отправь тариф + TXID/подтверждение.",
    ].join("\n");
  }

  if (isAlerts) {
    return [
      "Desk-ответ: AI Alerts — это не слепые buy/sell сигналы.",
      "Сигнал должен иметь: in-play тикер, setup, trigger, entry zone, stop/invalidation, targets, RR и risk note.",
      "Edge получает Market Intelligence / AI Market Brief. Elite получает real-time actionable AI Alerts и tracking сигналов.",
      "Действие: если сигналов нет — сначала проверь тариф, потом статус market data / scanner.",
    ].join("\n");
  }

  if (isJournal) {
    return [
      "Desk-ответ: журнал — основа персонального профиля трейдера.",
      "Сделки, скриншоты, сетапы, PnL, ошибки и качество исполнения строят pattern profile.",
      "Позже SkillEdge сравнивает alerts с реальным исполнением и подсвечивает то, что лучше подходит трейдеру.",
      "Действие: стабильно добавляй сделки и скриншоты — чистые данные дают более сильный review.",
    ].join("\n");
  }

  if (isReports) {
    return [
      "Desk-ответ: Reports превращают журнал в performance review.",
      "Фокус: что работает, что забирает деньги, качество сетапов, исполнение, риск-дисциплина и приоритетные правки.",
      "Действие: генерируй отчёты после накопления сделок; 10+ сделок дают лучший первый срез.",
    ].join("\n");
  }

  if (isCoach) {
    return [
      "Desk-ответ: AI Coach создан для процесса, а не для хайпа.",
      "Используй его для правил, риск-дисциплины, review сделок, подготовки и исправления повторяющихся ошибок.",
      "Лучший запрос: опиши сделку, setup, entry, stop, target, эмоцию и результат.",
      "Действие: задай конкретный вопрос по исполнению — ответ будет сильнее.",
    ].join("\n");
  }

  if (isOperator) {
    return [
      "Запрос оператору передан.",
      "Добавь страницу, тариф, email/аккаунт и что именно не сработало. Так поддержка решит вопрос быстрее.",
    ].join("\n");
  }

  return [
    "Desk-ответ: я передал обращение в поддержку.",
    "Для быстрого решения добавь: страницу, тариф, email/аккаунт, что нажал, что произошло, и скриншот если возможно.",
    "SkillEdge Support помогает с доступом, тарифами, оплатой, журналом, скриншотами, AI Coach, Reports, Market Intelligence и AI Alerts.",
  ].join("\n");
}


function mapStoredMessage(
  message: StoredSupportMessage,
  language: SupportLanguage
): SupportMessage {
  return {
    id: message.id,
    role: message.sender_type,
    text: translateStoredMessageText(message.message_text, language),
    createdAt: message.created_at,
  };
}

function normalizeMessagesForDisplay(
  storedMessages: StoredSupportMessage[],
  language: SupportLanguage
): SupportMessage[] {
  return storedMessages
    .map((message) => mapStoredMessage(message, language))
    .filter((message) => message.role !== "system");
}

function areSameMessages(
  previousMessages: SupportMessage[],
  nextMessages: SupportMessage[]
) {
  if (previousMessages.length !== nextMessages.length) {
    return false;
  }

  return previousMessages.every((message, index) => {
    const nextMessage = nextMessages[index];

    return (
      message.id === nextMessage.id &&
      message.role === nextMessage.role &&
      message.text === nextMessage.text
    );
  });
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function SupportWidget() {
  const [language, setLanguage] = useState<SupportLanguage>("ru");
  const [anonymousId, setAnonymousId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [supportMode, setSupportMode] = useState<SupportMode>("menu");
  const [input, setInput] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [emailQuestion, setEmailQuestion] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const t = supportDict[language];

  useEffect(() => {
    const syncLanguage = () => {
      const nextLanguage = detectLanguage();

      setLanguage((current) => (current === nextLanguage ? current : nextLanguage));
    };

    syncLanguage();

    const interval = window.setInterval(syncLanguage, 1000);

    window.addEventListener("focus", syncLanguage);
window.addEventListener("storage", syncLanguage);
window.addEventListener("skilledge:language-changed", syncLanguage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncLanguage);
window.removeEventListener("storage", syncLanguage);
window.removeEventListener("skilledge:language-changed", syncLanguage);
    };
  }, []);

  const createOrLoadSession = async (): Promise<LoadedSupportSession> => {
    const detectedLanguage = detectLanguage();
    const currentAnonymousId = getAnonymousId();

    setLanguage(detectedLanguage);
    setAnonymousId(currentAnonymousId);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/support/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        anonymousId: currentAnonymousId,
        language: detectedLanguage,
        pageUrl: window.location.href,
      }),
    });

    const data = await readJsonResponse(response);

    if (!response.ok || !data?.session?.id) {
      setMessages([createMessage("assistant", supportDict[detectedLanguage].intro)]);

      return {
        sessionId: "",
        anonymousId: currentAnonymousId,
      };
    }

    const loadedSessionId = data.session.id;

    setSessionId(loadedSessionId);

    const messagesResponse = await fetch(
      `/api/support/messages?sessionId=${loadedSessionId}`,
      {
        method: "GET",
        headers: {
          "x-support-anonymous-id": currentAnonymousId,
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
      }
    );

    const messagesData = await readJsonResponse(messagesResponse);

    if (messagesResponse.ok && Array.isArray(messagesData?.messages)) {
      setMessages(
        normalizeMessagesForDisplay(messagesData.messages, detectedLanguage)
      );
    } else {
      setMessages([createMessage("assistant", supportDict[detectedLanguage].intro)]);
    }

    return {
      sessionId: loadedSessionId,
      anonymousId: currentAnonymousId,
    };
  };

  useEffect(() => {
    createOrLoadSession();
  }, []);
    useEffect(() => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (isIntroMessage(message.text)) {
          return {
            ...message,
            text: supportDict[language].intro,
          };
        }

        if (message.role === "system") {
          return {
            ...message,
            text: translateStoredMessageText(message.text, language),
          };
        }

        return message;
      })
    );
  }, [language]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
  if (!isOpen || supportMode !== "chat" || !sessionId || !anonymousId) {
    return;
  }

  let isMounted = true;

  const loadLatestMessages = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(
        `/api/support/messages?sessionId=${sessionId}`,
        {
          method: "GET",
          headers: {
            "x-support-anonymous-id": anonymousId,
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
        }
      );

      const data = await readJsonResponse(response);

      if (!isMounted) {
        return;
      }

      if (response.ok && Array.isArray(data?.messages)) {
        const currentLanguage = detectLanguage();

        setLanguage((previousLanguage) =>
          previousLanguage === currentLanguage
            ? previousLanguage
            : currentLanguage
        );

        const nextMessages = normalizeMessagesForDisplay(
  data.messages,
  currentLanguage
);

setMessages((previousMessages) =>
  areSameMessages(previousMessages, nextMessages)
    ? previousMessages
    : nextMessages
);
      }
    } catch {
      // Network errors are ignored here to keep the support widget stable.
    }
  };

  loadLatestMessages();

  const interval = window.setInterval(loadLatestMessages, 3500);

  return () => {
    isMounted = false;
    window.clearInterval(interval);
  };
}, [sessionId, anonymousId, isOpen, supportMode]);

  const saveMessages = async (
    messagesToSave: SupportMessage[],
    targetSessionId = sessionId,
    targetAnonymousId = anonymousId
  ) => {
    if (!targetSessionId || !targetAnonymousId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    await fetch("/api/support/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        sessionId: targetSessionId,
        anonymousId: targetAnonymousId,
        messages: messagesToSave.map((message) => ({
          role: message.role,
          text: message.text,
        })),
      }),
    });
  };

  const sendOperatorRequest = async ({
    targetSessionId,
    targetAnonymousId,
    message,
    currentLanguage,
  }: {
    targetSessionId: string;
    targetAnonymousId: string;
    message: string;
    currentLanguage: SupportLanguage;
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/support/operator-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        sessionId: targetSessionId,
        anonymousId: targetAnonymousId,
        pageUrl: window.location.href,
        language: currentLanguage,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error("Operator request failed");
    }
  };

  const handleChatSend = async () => {
    const text = input.trim();

    if (!text || chatSending) return;

    try {
      setChatSending(true);

      let activeSessionId = sessionId;
      let activeAnonymousId = anonymousId;

      if (!activeSessionId || !activeAnonymousId) {
        const loadedSupportSession = await createOrLoadSession();

        activeSessionId = loadedSupportSession.sessionId;
        activeAnonymousId = loadedSupportSession.anonymousId;
      }

      if (!activeSessionId || !activeAnonymousId) {
        throw new Error("Support session was not created");
      }

      const currentLanguage = detectLanguage();
      const userMessage = createMessage("user", text);
      const assistantMessage = createMessage(
        "assistant",
        buildSupportAssistantReply(text, currentLanguage)
      );

      setLanguage(currentLanguage);
      setInput("");
      setMessages((current) => [...current, userMessage, assistantMessage]);

      await saveMessages(
        [userMessage, assistantMessage],
        activeSessionId,
        activeAnonymousId
      );

      await sendOperatorRequest({
        targetSessionId: activeSessionId,
        targetAnonymousId: activeAnonymousId,
        message: text,
        currentLanguage,
      });

      
    } catch {
      const currentLanguage = detectLanguage();

      setLanguage(currentLanguage);
      setMessages((current) => [
        ...current,
        createMessage("system", supportDict[currentLanguage].operatorError),
      ]);
    } finally {
      setChatSending(false);
    }
  };

  const handleEmailRequest = async () => {
    const email = emailValue.trim();
    const message = emailQuestion.trim();

    if (!email || !message || emailLoading) return;

    try {
      setEmailLoading(true);

      let activeSessionId = sessionId;
      let activeAnonymousId = anonymousId;

      if (!activeSessionId || !activeAnonymousId) {
        const loadedSupportSession = await createOrLoadSession();

        activeSessionId = loadedSupportSession.sessionId;
        activeAnonymousId = loadedSupportSession.anonymousId;
      }

      const currentLanguage = detectLanguage();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/support/email-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          anonymousId: activeAnonymousId,
          email,
          message,
          language: currentLanguage,
          pageUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        throw new Error("Email request failed");
      }

      setLanguage(currentLanguage);
      setEmailQuestion("");
      setMessages((current) => [
        ...current,
        createMessage("user", `Email: ${email}\n\n${message}`),
        createMessage("system", supportDict[currentLanguage].emailSuccess),
      ]);
    } catch {
      const currentLanguage = detectLanguage();

      setLanguage(currentLanguage);
      setMessages((current) => [
        ...current,
        createMessage("system", supportDict[currentLanguage].emailError),
      ]);
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[99999] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div className="pointer-events-auto w-[calc(100vw-2.5rem)] max-w-[430px] overflow-hidden rounded-[1.75rem] border border-cyan-300/15 bg-[#06111f]/96 shadow-[0_28px_110px_rgba(0,0,0,0.55),0_0_60px_rgba(34,211,238,0.12)] backdrop-blur-2xl">
          <div className="border-b border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/50">
                  {t.title}
                </div>
                <div className="mt-1 text-sm text-white/65">
                  {supportMode === "menu"
                    ? t.chooseSubtitle
                    : supportMode === "email"
                      ? t.emailHeading
                      : t.subtitle}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {supportMode !== "menu" ? (
                  <button
                    type="button"
                    onClick={() => setSupportMode("menu")}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    {t.back}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  —
                </button>
              </div>
            </div>
          </div>

          {supportMode === "menu" && (
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {t.chooseTitle}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  {t.chooseSubtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSupportMode("email")}
                className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.07]"
              >
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl transition group-hover:bg-cyan-400/18" />

                <div className="relative flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 6h16v12H4z" />
                      <path d="m4 7 8 6 8-6" />
                    </svg>
                  </div>

                  <div>
                    <div className="text-base font-semibold text-white">
                      {t.emailTitle}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/58">
                      {t.emailText}
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSupportMode("chat")}
                className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-emerald-300/35 hover:bg-emerald-300/[0.06]"
              >
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl transition group-hover:bg-emerald-400/18" />

                <div className="relative flex gap-4">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.6 8.6 0 0 1-7.7 4.7 8.5 8.5 0 0 1-4-.98L3 20l1.08-5.06A8.4 8.4 0 0 1 3 11.5 8.6 8.6 0 0 1 11.6 3 8.6 8.6 0 0 1 21 11.5Z" />
                      <path d="M8.5 11.5h.01" />
                      <path d="M12 11.5h.01" />
                      <path d="M15.5 11.5h.01" />
                    </svg>

                    <span className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full border border-[#06111f] bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" />
                  </div>

                  <div>
                    <div className="text-base font-semibold text-white">
                      {t.chatTitle}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/58">
                      {t.chatText}
                    </div>
                  </div>
                </div>
              </button>

              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-xs leading-6 text-amber-50/70">
                {t.disclaimer}
              </div>
            </div>
          )}

          {supportMode === "email" && (
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {t.emailHeading}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  {t.emailDescription}
                </p>
              </div>

              <div className="space-y-3">
                <input
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                />

                <textarea
                  value={emailQuestion}
                  onChange={(event) => setEmailQuestion(event.target.value)}
                  placeholder={t.questionPlaceholder}
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                />

                <button
                  type="button"
                  onClick={handleEmailRequest}
                  disabled={
                    emailLoading || !emailValue.trim() || !emailQuestion.trim()
                  }
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {emailLoading ? t.sendingEmail : t.sendEmail}
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs leading-6 text-white/50">
  {t.emailSavedNotice}
</div>
            </div>
          )}

          {supportMode === "chat" && (
            <>
              <div className="border-b border-white/10 px-4 py-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/45">
                  {t.shortcutsTitle}
                </div>

                <div className="flex flex-wrap gap-2">
                  {t.quickQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => setInput(question)}
                      className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.055] px-3 py-1.5 text-xs font-semibold text-cyan-50/80 transition hover:border-cyan-200/45 hover:bg-cyan-300/[0.12] hover:text-white"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/60">
    {t.intro}
  </div>
) : null}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[86%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "bg-cyan-300 text-black"
                          : message.role === "operator"
                            ? "border border-amber-300/20 bg-amber-400/10 text-amber-50/90"
                            : message.role === "system"
                              ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-50/85"
                              : "border border-white/10 bg-white/[0.055] text-white/75"
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-white/10 p-4">
                <div className="flex gap-2">
                  <input
                    value={input}
                    disabled={chatSending}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !chatSending) {
                        handleChatSend();
                      }
                    }}
                    placeholder={t.placeholder}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={handleChatSend}
                    disabled={chatSending || !input.trim()}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {chatSending ? "..." : t.send}
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-3 text-xs leading-6 text-emerald-50/70">
  {t.chatOperatorNotice}
</div>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setSupportMode("menu");
        }}
        className="pointer-events-auto group relative flex items-center rounded-full border border-cyan-200/35 bg-[#071827]/90 p-1.5 pr-5 text-white shadow-[0_0_45px_rgba(34,211,238,0.32)] backdrop-blur-2xl transition duration-300 hover:scale-[1.03] hover:border-cyan-200/70 hover:shadow-[0_0_70px_rgba(34,211,238,0.45)] active:scale-[0.98]"
        aria-label="SkillEdge Support"
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400/20 via-sky-400/10 to-cyan-300/20 opacity-80 blur-xl transition group-hover:opacity-100" />

        <span className="relative mr-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-100/45 bg-gradient-to-br from-cyan-300 via-sky-400 to-cyan-500 text-black shadow-[0_0_34px_rgba(34,211,238,0.55)]">
          {isOpen ? (
            <span className="text-2xl font-light leading-none">×</span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-7 w-7 text-black"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.6 8.6 0 0 1-7.7 4.7 8.5 8.5 0 0 1-4-.98L3 20l1.08-5.06A8.4 8.4 0 0 1 3 11.5 8.6 8.6 0 0 1 11.6 3 8.6 8.6 0 0 1 21 11.5Z" />
              <path d="M8.5 11.5h.01" />
              <path d="M12 11.5h.01" />
              <path d="M15.5 11.5h.01" />
            </svg>
          )}
        </span>

        {!isOpen && (
          <span className="relative hidden items-center gap-3 sm:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />

            <span className="text-sm font-semibold tracking-wide text-cyan-50">
              {t.floatingLabel}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
