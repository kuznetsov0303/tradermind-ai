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
    title: "SkillEdge Support",
    subtitle: "Выберите удобный способ связи",
    intro:
      "Добрый день. Напишите вопрос — после отправки он сразу уйдёт оператору.",
    placeholder: "Опишите вопрос для оператора...",
    send: "Отправить",
    sending: "Отправляю...",
    operatorSuccess: "Запрос оператору отправлен. Мы получили ваше сообщение.",
    operatorError:
      "Не удалось отправить запрос оператору. Проверьте Telegram-настройки или попробуйте позже.",
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
    back: "Назад",
    disclaimer:
      "SkillEdge AI не является финансовым консультантом. Поддержка помогает с продуктом, доступом, оплатой и общими вопросами по платформе.",
  },
  en: {
    title: "SkillEdge Support",
    subtitle: "Choose the best contact option",
    intro:
      "Good afternoon. Write your question — once you send it, it will go directly to an operator.",
    placeholder: "Describe your question for the operator...",
    send: "Send",
    sending: "Sending...",
    operatorSuccess: "Operator request sent. We received your message.",
    operatorError:
      "Failed to send operator request. Check Telegram settings or try again later.",
    floatingLabel: "Support",
    chooseTitle: "How would you like to contact us?",
    chooseSubtitle:
      "Choose the easiest channel. We’ll guide you without pressure.",
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
    back: "Back",
    disclaimer:
      "SkillEdge AI is not a financial advisor. Support helps with product, access, payment and general platform questions.",
  },
  ua: {
    title: "SkillEdge Support",
    subtitle: "Оберіть зручний спосіб зв’язку",
    intro:
      "Добрий день. Напишіть питання — після відправки воно одразу піде оператору.",
    placeholder: "Опишіть питання для оператора...",
    send: "Надіслати",
    sending: "Надсилаю...",
    operatorSuccess: "Запит оператору надіслано. Ми отримали ваше повідомлення.",
    operatorError:
      "Не вдалося надіслати запит оператору. Перевірте Telegram-налаштування або спробуйте пізніше.",
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
    back: "Назад",
    disclaimer:
      "SkillEdge AI не є фінансовим консультантом. Підтримка допомагає з продуктом, доступом, оплатою і загальними питаннями платформи.",
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
  if (typeof window === "undefined") return "ru";

  const path = window.location.pathname.toLowerCase();
  const pageText = document.body.innerText.toLowerCase();

  const storedLanguage =
    window.localStorage.getItem("language")?.toLowerCase() ||
    window.localStorage.getItem("locale")?.toLowerCase() ||
    window.localStorage.getItem("selectedLanguage")?.toLowerCase() ||
    window.localStorage.getItem("app_language")?.toLowerCase() ||
    window.localStorage.getItem("dashboard_language")?.toLowerCase() ||
    window.localStorage.getItem("site_language")?.toLowerCase() ||
    "";

  if (path.includes("/ua") || path.includes("/uk")) return "ua";
  if (path.includes("/en")) return "en";

  if (
    pageText.includes("запросити демо") ||
    pageText.includes("кабінет") ||
    pageText.includes("вийти") ||
    pageText.includes("тарифи")
  ) {
    return "ua";
  }

  if (
    pageText.includes("request demo") ||
    pageText.includes("dashboard") ||
    pageText.includes("logout") ||
    pageText.includes("pricing")
  ) {
    return "en";
  }

  if (storedLanguage === "ua" || storedLanguage === "uk") return "ua";
  if (storedLanguage === "en") return "en";

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
  return storedMessages.map((message) => mapStoredMessage(message, language));
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

        setMessages(normalizeMessagesForDisplay(data.messages, currentLanguage));
      }
    } catch {
      // Temporary network/dev errors are ignored.
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

      setLanguage(currentLanguage);
      setInput("");
      setMessages((current) => [...current, userMessage]);

      await saveMessages([userMessage], activeSessionId, activeAnonymousId);

      await sendOperatorRequest({
        targetSessionId: activeSessionId,
        targetAnonymousId: activeAnonymousId,
        message: text,
        currentLanguage,
      });

      const systemMessage = createMessage(
        "system",
        supportDict[currentLanguage].operatorSuccess
      );

      setMessages((current) => [...current, systemMessage]);
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
                Заявка будет сохранена в support-системе и отправлена команде
                SkillEdge AI.
              </div>
            </div>
          )}

          {supportMode === "chat" && (
            <>
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
                  После отправки сообщение сразу уйдёт оператору. Отвечать вам
                  смогут прямо из support-панели.
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