"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupportLanguage = "ru" | "en" | "ua";

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
    title: "SkillEdge Support",
    subtitle: "Задайте свой вопрос",
    intro: "Добрый день. С каким вопросом вы пришли сегодня?",
    placeholder: "Напишите вопрос...",
    send: "Отправить",
    operator: "Связаться с оператором",
    operatorLoading: "Отправляю запрос...",
    operatorSuccess: "Запрос оператору отправлен.",
    operatorError:
      "Не удалось отправить запрос оператору. Проверьте настройки Telegram или попробуйте позже.",
    defaultAnswer:
      "Я помогу с тарифами, оплатой, журналом сделок, скриншотами, AI-анализом, отчётами, обучением и доступами. Напишите ваш вопрос — и я подскажу.",
    floatingLabel: "Поддержка",
  },
  en: {
    title: "SkillEdge Support",
    subtitle: "Ask your question",
    intro: "Good afternoon. What question did you come with today?",
    placeholder: "Ask a question...",
    send: "Send",
    operator: "Contact operator",
    operatorLoading: "Sending request...",
    operatorSuccess: "Operator request sent.",
    operatorError:
      "Failed to send operator request. Check Telegram settings or try again later.",
    defaultAnswer:
      "I can help with plans, payments, trade journal, screenshots, AI analysis, reports, learning, and access. Ask your question and I’ll help.",
    floatingLabel: "Live chat",
  },
  ua: {
    title: "SkillEdge Support",
    subtitle: "Поставте своє запитання",
    intro: "Добрий день. З яким питанням ви прийшли сьогодні?",
    placeholder: "Напишіть питання...",
    send: "Надіслати",
    operator: "Звʼязатися з оператором",
    operatorLoading: "Надсилаю запит...",
    operatorSuccess: "Запит оператору надіслано.",
    operatorError:
      "Не вдалося надіслати запит оператору. Перевір налаштування Telegram або спробуй пізніше.",
    defaultAnswer:
      "Я допоможу з тарифами, оплатою, журналом угод, скриншотами, AI-аналізом, звітами, навчанням і доступами. Напишіть ваше запитання — і я підкажу.",
    floatingLabel: "Підтримка",
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

function detectLanguage(): SupportLanguage {
  if (typeof window === "undefined") {
    return "ru";
  }

  const path = window.location.pathname.toLowerCase();
  const pageText = document.body.innerText.toLowerCase();

  const storedLanguage =
    window.localStorage.getItem("language")?.toLowerCase() ||
    window.localStorage.getItem("locale")?.toLowerCase() ||
    window.localStorage.getItem("selectedLanguage")?.toLowerCase() ||
    window.localStorage.getItem("app_language")?.toLowerCase() ||
    window.localStorage.getItem("dashboard_language")?.toLowerCase() ||
    window.localStorage.getItem("site_language")?.toLowerCase() ||
    window.localStorage.getItem("landingLanguage")?.toLowerCase() ||
    window.localStorage.getItem("landing_language")?.toLowerCase() ||
    "";

  const htmlLanguage =
    document.documentElement.lang?.toLowerCase() ||
    document.documentElement.getAttribute("data-language")?.toLowerCase() ||
    "";

  // 1) Сначала определяем по URL.
  if (path.includes("/ua") || path.includes("/uk")) {
    return "ua";
  }

  if (path.includes("/en")) {
    return "en";
  }

  // 2) Потом по реальному тексту на странице.
  // Это важнее localStorage, потому что кнопка языка на сайте уже могла поменять UI.
  if (
    pageText.includes("запросить демо") ||
    pageText.includes("кабинет") ||
    pageText.includes("выйти") ||
    pageText.includes("главная") ||
    pageText.includes("продукт") ||
    pageText.includes("тарифы") ||
    pageText.includes("команда")
  ) {
    return "ru";
  }

  if (
    pageText.includes("запросити демо") ||
    pageText.includes("кабінет") ||
    pageText.includes("вийти") ||
    pageText.includes("головна") ||
    pageText.includes("продукт") ||
    pageText.includes("тарифи") ||
    pageText.includes("команда") ||
    pageText.includes("знайди свою перевагу")
  ) {
    return "ua";
  }

  if (
    pageText.includes("request demo") ||
    pageText.includes("dashboard") ||
    pageText.includes("logout") ||
    pageText.includes("home") ||
    pageText.includes("product") ||
    pageText.includes("pricing") ||
    pageText.includes("team") ||
    pageText.includes("find your edge")
  ) {
    return "en";
  }

  // 3) Только если по странице не поняли — смотрим localStorage / html lang.
  if (storedLanguage === "ua" || storedLanguage === "uk") {
    return "ua";
  }

  if (storedLanguage === "en") {
    return "en";
  }

  if (htmlLanguage === "ua" || htmlLanguage === "uk") {
    return "ua";
  }

  if (htmlLanguage === "en") {
    return "en";
  }

  return "ru";
}

function getAnonymousId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existingId = window.localStorage.getItem("support_anonymous_id");

  if (existingId) {
    return existingId;
  }

  const newId = crypto.randomUUID();

  window.localStorage.setItem("support_anonymous_id", newId);

  return newId;
}

function getFaqAnswer(question: string, language: SupportLanguage) {
  const q = question.toLowerCase();

  if (
    q.includes("оплат") ||
    q.includes("payment") ||
    q.includes("pay") ||
    q.includes("оплатити") ||
    q.includes("nowpayments") ||
    q.includes("crypto")
  ) {
    if (language === "en") {
      return "To pay for a plan, open Billing, choose Core, Edge, or Elite, and click Choose plan. The platform creates a crypto checkout through NOWPayments. After successful payment, your subscription is activated automatically.";
    }

    if (language === "ua") {
      return "Щоб оплатити тариф, відкрийте Billing, оберіть Core, Edge або Elite і натисніть «Обрати тариф». Платформа створить crypto checkout через NOWPayments. Після успішної оплати підписка активується автоматично.";
    }

    return "Чтобы оплатить тариф, откройте Billing, выберите Core, Edge или Elite и нажмите «Выбрать тариф». Платформа создаст crypto checkout через NOWPayments. После успешной оплаты подписка активируется автоматически.";
  }

  if (
    q.includes("core") ||
    q.includes("edge") ||
    q.includes("elite") ||
    q.includes("тариф") ||
    q.includes("plan") ||
    q.includes("подпис")
  ) {
    if (language === "en") {
      return "Core is the entry plan for journaling and basic AI tools. Edge adds higher AI limits, AI reports, social market tools, and premium chart analysis. Elite gives the highest limits, AI scanner access, and the full premium feature stack.";
    }

    if (language === "ua") {
      return "Core — базовий тариф для журналу та базових AI-інструментів. Edge додає більші AI-ліміти, AI-звіти, social market tools і premium chart analysis. Elite дає максимальні ліміти, AI scanner і повний premium stack.";
    }

    return "Core — базовый тариф для журнала и базовых AI-инструментов. Edge добавляет более высокие AI-лимиты, AI-отчёты, social market tools и premium chart analysis. Elite даёт максимальные лимиты, AI scanner и полный premium stack.";
  }

  if (
    q.includes("сделк") ||
    q.includes("trade") ||
    q.includes("journal") ||
    q.includes("журнал") ||
    q.includes("угод")
  ) {
    if (language === "en") {
      return "To add a trade, open Journal and click Add trade. Fill in ticker, direction, market, entry, exit, PnL, setup, mistake, notes, and attach screenshots if needed.";
    }

    if (language === "ua") {
      return "Щоб додати угоду, відкрийте Journal і натисніть Add trade. Заповніть ticker, direction, market, entry, exit, PnL, setup, mistake, notes і за потреби додайте скриншоти.";
    }

    return "Чтобы добавить сделку, откройте Journal и нажмите Add trade. Заполните ticker, direction, market, entry, exit, PnL, setup, mistake, notes и при необходимости добавьте скриншоты.";
  }

  if (
    q.includes("скрин") ||
    q.includes("screenshot") ||
    q.includes("screen") ||
    q.includes("image")
  ) {
    if (language === "en") {
      return "Screenshots are attached inside Add/Edit Trade. You can upload multiple screenshots depending on your plan. In Full Journal, use the screenshot button to reopen previously uploaded images.";
    }

    if (language === "ua") {
      return "Скриншоти додаються всередині Add/Edit Trade. Можна завантажити кілька скриншотів залежно від тарифу. У Full Journal є кнопка для відкриття раніше завантажених скринів.";
    }

    return "Скриншоты добавляются внутри Add/Edit Trade. Можно загрузить несколько скриншотов в зависимости от тарифа. В Full Journal есть кнопка, чтобы открыть ранее загруженные скрины.";
  }

  if (
    q.includes("ai") ||
    q.includes("анализ") ||
    q.includes("analysis") ||
    q.includes("аналіз") ||
    q.includes("отчет") ||
    q.includes("отчёт") ||
    q.includes("report")
  ) {
    if (language === "en") {
      return "SkillEdge AI can analyze trades, screenshots, current charts, journal performance, and AI reports. Some AI functions depend on your plan limits and access level.";
    }

    if (language === "ua") {
      return "SkillEdge AI може аналізувати угоди, скриншоти, поточні графіки, журнал і AI-звіти. Частина AI-функцій залежить від тарифу, лімітів і рівня доступу.";
    }

    return "SkillEdge AI может анализировать сделки, скриншоты, текущие графики, журнал и AI-отчёты. Часть AI-функций зависит от тарифа, лимитов и уровня доступа.";
  }

  if (
    q.includes("закрыт") ||
    q.includes("locked") ||
    q.includes("доступ") ||
    q.includes("access") ||
    q.includes("закрит") ||
    q.includes("не работает")
  ) {
    if (language === "en") {
      return "If a feature is locked, your current plan may not include it, your subscription may be inactive, or the plan limit may be reached. Open Billing to check your current plan, limits, and available features.";
    }

    if (language === "ua") {
      return "Якщо функція закрита, вона може не входити у ваш тариф, підписка може бути неактивною або ліміт уже вичерпано. Відкрийте Billing, щоб перевірити тариф, ліміти й доступи.";
    }

    return "Если функция закрыта, она может не входить в ваш тариф, подписка может быть неактивной или лимит уже исчерпан. Откройте Billing, чтобы проверить тариф, лимиты и доступы.";
  }

  return supportDict[language].defaultAnswer;
}

function translateStoredMessageText(text: string, language: SupportLanguage) {
  if (
    text === "Operator request sent." ||
    text === "Запрос оператору отправлен." ||
    text === "Запит оператору надіслано."
  ) {
    if (language === "en") return "Operator request sent.";
    if (language === "ua") return "Запит оператору надіслано.";
    return "Запрос оператору отправлен.";
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
  const mappedMessages = storedMessages
    .map((message) => mapStoredMessage(message, language))
    .filter((message) => !isIntroMessage(message.text));

  return [
    createMessage("assistant", supportDict[language].intro),
    ...mappedMessages,
  ];
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

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
  const [input, setInput] = useState("");
  const [operatorLoading, setOperatorLoading] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const t = supportDict[language];

  useEffect(() => {
    const syncLanguage = () => {
      const nextLanguage = detectLanguage();

      setLanguage((current) =>
        current === nextLanguage ? current : nextLanguage
      );
    };

    syncLanguage();

    const interval = window.setInterval(syncLanguage, 1000);

    window.addEventListener("focus", syncLanguage);
    window.addEventListener("storage", syncLanguage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncLanguage);
      window.removeEventListener("storage", syncLanguage);
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
      setMessages([
        createMessage("assistant", supportDict[detectedLanguage].intro),
      ]);

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
      setMessages([
        createMessage("assistant", supportDict[detectedLanguage].intro),
      ]);
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
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!sessionId || !anonymousId) {
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

          setMessages(
            normalizeMessagesForDisplay(data.messages, currentLanguage)
          );
        }
      } catch {
        // Ignore temporary dev-server, refresh, or network interruptions.
      }
    };

    const interval = window.setInterval(loadLatestMessages, 3500);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [sessionId, anonymousId]);

  const saveMessages = async (messagesToSave: SupportMessage[]) => {
    if (!sessionId || !anonymousId) {
      return;
    }

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
        sessionId,
        anonymousId,
        messages: messagesToSave.map((message) => ({
          role: message.role,
          text: message.text,
        })),
      }),
    });
  };

  const handleSendMessage = async (question?: string) => {
    const text = (question || input).trim();

    if (!text) {
      return;
    }

    const currentLanguage = detectLanguage();
    const userMessage = createMessage("user", text);
    const assistantMessage = createMessage(
      "assistant",
      getFaqAnswer(text, currentLanguage)
    );

    setLanguage(currentLanguage);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");

    await saveMessages([userMessage, assistantMessage]);
  };

  const handleOperatorRequest = async () => {
    try {
      setOperatorLoading(true);

      let activeSessionId = sessionId;
      let activeAnonymousId = anonymousId;

      if (!activeSessionId || !activeAnonymousId) {
        const loadedSupportSession = await createOrLoadSession();

        if (!loadedSupportSession.sessionId) {
          throw new Error("Support session was not created");
        }

        activeSessionId = loadedSupportSession.sessionId;
        activeAnonymousId = loadedSupportSession.anonymousId;
      }

      const lastUserMessage =
        [...messages].reverse().find((message) => message.role === "user")
          ?.text ||
        input ||
        "Operator request";

      const currentLanguage = detectLanguage();

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
          sessionId: activeSessionId,
          anonymousId: activeAnonymousId,
          pageUrl: window.location.href,
          language: currentLanguage,
          message: lastUserMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Operator request failed");
      }

      const systemMessage = createMessage(
        "system",
        supportDict[currentLanguage].operatorSuccess
      );

      setLanguage(currentLanguage);
      setMessages((current) => [...current, systemMessage]);
    } catch {
      const currentLanguage = detectLanguage();
      const systemMessage = createMessage(
        "system",
        supportDict[currentLanguage].operatorError
      );

      setLanguage(currentLanguage);
      setMessages((current) => [...current, systemMessage]);
    } finally {
      setOperatorLoading(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[99999] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div className="pointer-events-auto w-[calc(100vw-2.5rem)] max-w-[410px] overflow-hidden rounded-[1.75rem] border border-cyan-300/15 bg-[#06111f]/95 shadow-2xl shadow-cyan-950/50 backdrop-blur-2xl">
          <div className="border-b border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/50">
                  {t.title}
                </div>
                <div className="mt-1 text-sm text-white/65">{t.subtitle}</div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                —
              </button>
            </div>
          </div>

          <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${
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
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSendMessage();
                  }
                }}
                placeholder={t.placeholder}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                {t.send}
              </button>
            </div>

            <button
              type="button"
              onClick={handleOperatorRequest}
              disabled={operatorLoading}
              className="mt-3 w-full rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-50/85 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {operatorLoading ? t.operatorLoading : t.operator}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
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