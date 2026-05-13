import type { Dictionary } from "./dictionary-types";
import type { Locale } from "./config";
import { DEFAULT_LOCALE, normalizeLocale } from "./config";

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    brand: {
      name: "SkillEdge AI",
      shortName: "SkillEdge",
      tagline: "Premium AI trading workspace",
    },
    actions: {
      getStarted: "Get started",
      requestDemo: "Request demo",
      choosePlan: "Choose plan",
      openDashboard: "Open dashboard",
      contactSupport: "Contact support",
      send: "Send",
      cancel: "Cancel",
      save: "Save",
      close: "Close",
      back: "Back",
      continue: "Continue",
      loading: "Loading...",
      refresh: "Refresh",
      upgrade: "Upgrade",
    },
    navigation: {
      product: "Product",
      pricing: "Pricing",
      dashboard: "Dashboard",
      legal: "Legal",
      support: "Support",
      login: "Log in",
      logout: "Log out",
    },
    dashboard: {
      tabs: {
        overview: "Overview",
        journal: "Trade Journal",
        charts: "Charts",
        market: "Market",
        alerts: "Alerts",
        aiCoach: "AI Coach",
        learning: "Learning",
        reports: "Reports",
        billing: "Billing",
      },
      access: {
        coreRequired: "Core required",
        edgeRequired: "Edge required",
        eliteRequired: "Elite required",
        scannerEdgePlus:
          "AI Scanner / Market Intelligence is available from SkillEdge Edge.",
        alertsEliteOnly:
          "AI Alerts, Floating Alerts Widget and Signal-to-Journal workflow are available only on SkillEdge Elite.",
      },
    },
    support: {
      title: "SkillEdge Support",
      floatingLabel: "Support",
      chooseTitle: "How would you like to contact us?",
      chooseSubtitle: "Choose the easiest channel. We’ll guide you without pressure.",
      emailTitle: "Email",
      emailText:
        "Leave your email and question. We’ll receive your request and answer as soon as possible.",
      chatTitle: "Chat",
      chatText:
        "Write a message in chat. After pressing Send, the request goes directly to an operator.",
      emailHeading: "Send us your question",
      emailDescription:
        "Write your email and describe what you need help with. The more context you add, the faster we can help.",
      emailPlaceholder: "your@email.com",
      questionPlaceholder: "Describe your question...",
      sendEmail: "Send request",
      sendingEmail: "Sending...",
      emailSuccess:
        "Request sent. We’ll review it and reply to the email you provided.",
      emailError:
        "Could not send the request. Please check your email and try again.",
      chatIntro:
        "Good afternoon. Write your question — once you send it, it will go directly to an operator.",
      chatPlaceholder: "Describe your question for the operator...",
      sending: "Sending...",
      operatorSuccess: "Operator request sent. We received your message.",
      operatorError:
        "Failed to send operator request. Please try again later.",
      disclaimer:
        "SkillEdge AI is not a financial advisor. Support helps with product, access, payment and general platform questions.",
    },
    aiCoach: {
      systemLanguageRule:
        "Detect the language of the user's latest message and answer in the same language. If the message is mixed-language, use the dominant language. Keep product names such as SkillEdge AI, AI Coach, AI Scanner, AI Alerts, Market Intelligence and Signal-to-Journal unchanged. Never mention OpenAI, GPT model names or internal model names.",
    },
  },

  ru: {
    brand: {
      name: "SkillEdge AI",
      shortName: "SkillEdge",
      tagline: "Премиальный AI workspace для трейдинга",
    },
    actions: {
      getStarted: "Начать",
      requestDemo: "Запросить демо",
      choosePlan: "Выбрать тариф",
      openDashboard: "Открыть кабинет",
      contactSupport: "Связаться с поддержкой",
      send: "Отправить",
      cancel: "Отмена",
      save: "Сохранить",
      close: "Закрыть",
      back: "Назад",
      continue: "Продолжить",
      loading: "Загрузка...",
      refresh: "Обновить",
      upgrade: "Улучшить тариф",
    },
    navigation: {
      product: "Продукт",
      pricing: "Тарифы",
      dashboard: "Кабинет",
      legal: "Документы",
      support: "Поддержка",
      login: "Войти",
      logout: "Выйти",
    },
    dashboard: {
      tabs: {
        overview: "Обзор",
        journal: "Журнал сделок",
        charts: "Графики",
        market: "Рынок",
        alerts: "Alerts",
        aiCoach: "AI Coach",
        learning: "Обучение",
        reports: "Отчёты",
        billing: "Оплата",
      },
      access: {
        coreRequired: "Нужен Core",
        edgeRequired: "Нужен Edge",
        eliteRequired: "Нужен Elite",
        scannerEdgePlus:
          "AI Scanner / Market Intelligence доступен с SkillEdge Edge.",
        alertsEliteOnly:
          "AI Alerts, Floating Alerts Widget и Signal-to-Journal workflow доступны только на SkillEdge Elite.",
      },
    },
    support: {
      title: "SkillEdge Support",
      floatingLabel: "Поддержка",
      chooseTitle: "Как вам удобнее связаться?",
      chooseSubtitle:
        "Выберите формат связи. Мы поможем спокойно, понятно и без лишнего давления.",
      emailTitle: "Email",
      emailText:
        "Оставьте email и вопрос. Мы получим обращение и ответим как можно быстрее.",
      chatTitle: "Чат",
      chatText:
        "Напишите сообщение в чат. После нажатия “Отправить” запрос сразу уйдёт оператору.",
      emailHeading: "Отправьте нам вопрос",
      emailDescription:
        "Укажите email и коротко опишите ситуацию. Чем больше контекста — тем быстрее мы разберёмся.",
      emailPlaceholder: "your@email.com",
      questionPlaceholder: "Опишите ваш вопрос...",
      sendEmail: "Отправить запрос",
      sendingEmail: "Отправляю...",
      emailSuccess:
        "Запрос отправлен. Мы посмотрим его и ответим на указанный email.",
      emailError:
        "Не удалось отправить запрос. Проверьте email и попробуйте ещё раз.",
      chatIntro:
        "Добрый день. Напишите вопрос — после отправки он сразу уйдёт оператору.",
      chatPlaceholder: "Опишите вопрос для оператора...",
      sending: "Отправляю...",
      operatorSuccess: "Запрос оператору отправлен. Мы получили ваше сообщение.",
      operatorError:
        "Не удалось отправить запрос оператору. Попробуйте позже.",
      disclaimer:
        "SkillEdge AI не является финансовым консультантом. Поддержка помогает с продуктом, доступом, оплатой и общими вопросами по платформе.",
    },
    aiCoach: {
      systemLanguageRule:
        "Определи язык последнего сообщения пользователя и отвечай на том же языке. Если сообщение смешанное, используй доминирующий язык. Не переводи названия продукта SkillEdge AI, AI Coach, AI Scanner, AI Alerts, Market Intelligence и Signal-to-Journal. Никогда не упоминай OpenAI, GPT-модели или внутренние названия моделей.",
    },
  },

  uk: {
    brand: {
      name: "SkillEdge AI",
      shortName: "SkillEdge",
      tagline: "Преміальний AI workspace для трейдингу",
    },
    actions: {
      getStarted: "Почати",
      requestDemo: "Запросити демо",
      choosePlan: "Обрати тариф",
      openDashboard: "Відкрити кабінет",
      contactSupport: "Зв’язатися з підтримкою",
      send: "Надіслати",
      cancel: "Скасувати",
      save: "Зберегти",
      close: "Закрити",
      back: "Назад",
      continue: "Продовжити",
      loading: "Завантаження...",
      refresh: "Оновити",
      upgrade: "Покращити тариф",
    },
    navigation: {
      product: "Продукт",
      pricing: "Тарифи",
      dashboard: "Кабінет",
      legal: "Документи",
      support: "Підтримка",
      login: "Увійти",
      logout: "Вийти",
    },
    dashboard: {
      tabs: {
        overview: "Огляд",
        journal: "Журнал угод",
        charts: "Графіки",
        market: "Ринок",
        alerts: "Alerts",
        aiCoach: "AI Coach",
        learning: "Навчання",
        reports: "Звіти",
        billing: "Оплата",
      },
      access: {
        coreRequired: "Потрібен Core",
        edgeRequired: "Потрібен Edge",
        eliteRequired: "Потрібен Elite",
        scannerEdgePlus:
          "AI Scanner / Market Intelligence доступний з SkillEdge Edge.",
        alertsEliteOnly:
          "AI Alerts, Floating Alerts Widget і Signal-to-Journal workflow доступні тільки на SkillEdge Elite.",
      },
    },
    support: {
      title: "SkillEdge Support",
      floatingLabel: "Підтримка",
      chooseTitle: "Який канал вам зручніший?",
      chooseSubtitle:
        "Оберіть формат зв’язку. Ми допоможемо спокійно і без зайвого тиску.",
      emailTitle: "Email",
      emailText:
        "Залиште email і питання. Ми отримаємо звернення і відповімо якнайшвидше.",
      chatTitle: "Чат",
      chatText:
        "Напишіть повідомлення в чат. Після натискання “Надіслати” запит одразу піде оператору.",
      emailHeading: "Надішліть нам питання",
      emailDescription:
        "Вкажіть email і коротко опишіть ситуацію. Чим більше контексту — тим швидше ми розберемося.",
      emailPlaceholder: "your@email.com",
      questionPlaceholder: "Опишіть ваше питання...",
      sendEmail: "Надіслати запит",
      sendingEmail: "Надсилаю...",
      emailSuccess:
        "Запит надіслано. Ми переглянемо його і відповімо на вказаний email.",
      emailError:
        "Не вдалося надіслати запит. Перевірте email і спробуйте ще раз.",
      chatIntro:
        "Добрий день. Напишіть питання — після відправки воно одразу піде оператору.",
      chatPlaceholder: "Опишіть питання для оператора...",
      sending: "Надсилаю...",
      operatorSuccess: "Запит оператору надіслано. Ми отримали ваше повідомлення.",
      operatorError:
        "Не вдалося надіслати запит оператору. Спробуйте пізніше.",
      disclaimer:
        "SkillEdge AI не є фінансовим консультантом. Підтримка допомагає з продуктом, доступом, оплатою і загальними питаннями платформи.",
    },
    aiCoach: {
      systemLanguageRule:
        "Визнач мову останнього повідомлення користувача і відповідай тією ж мовою. Якщо повідомлення змішане, використовуй домінуючу мову. Не перекладай назви продукту SkillEdge AI, AI Coach, AI Scanner, AI Alerts, Market Intelligence і Signal-to-Journal. Ніколи не згадуй OpenAI, GPT-моделі або внутрішні назви моделей.",
    },
  },

  zh: {} as Dictionary,
  de: {} as Dictionary,
  fr: {} as Dictionary,
  es: {} as Dictionary,
  ar: {} as Dictionary,
  it: {} as Dictionary,
  nb: {} as Dictionary,
  ka: {} as Dictionary,
  pl: {} as Dictionary,
  tr: {} as Dictionary,
  el: {} as Dictionary,
  hi: {} as Dictionary,
};

export function getDictionary(locale: string | null | undefined): Dictionary {
  const normalizedLocale = normalizeLocale(locale);
  const dictionary = dictionaries[normalizedLocale];

  if (dictionary && Object.keys(dictionary).length > 0) {
    return dictionary;
  }

  return dictionaries[DEFAULT_LOCALE];
}