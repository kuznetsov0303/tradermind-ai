"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CookieSettings = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "skilledge_cookie_consent_v1";

const defaultSettings: CookieSettings = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<CookieSettings>(defaultSettings);

  useEffect(() => {
    const loadSavedSettings = () => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);

        if (!saved) {
          setVisible(true);
          return;
        }

        const parsed = JSON.parse(saved) as CookieSettings;

        setSettings({
          necessary: true,
          analytics: Boolean(parsed.analytics),
          marketing: Boolean(parsed.marketing),
        });
      } catch {
        setVisible(true);
      }
    };

    const openCookieSettings = () => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);

        if (saved) {
          const parsed = JSON.parse(saved) as CookieSettings;

          setSettings({
            necessary: true,
            analytics: Boolean(parsed.analytics),
            marketing: Boolean(parsed.marketing),
          });
        }
      } catch {
        setSettings(defaultSettings);
      }

      setVisible(true);
      setSettingsOpen(true);
    };

    loadSavedSettings();

    window.addEventListener("skilledge:open-cookie-settings", openCookieSettings);

    return () => {
      window.removeEventListener(
        "skilledge:open-cookie-settings",
        openCookieSettings
      );
    };
  }, []);

  const saveSettings = (nextSettings: CookieSettings) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
    setVisible(false);
    setSettingsOpen(false);
  };

  const acceptAll = () => {
    saveSettings({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  };

  const rejectOptional = () => {
    saveSettings({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  };

  const saveCustom = () => {
    saveSettings({
      necessary: true,
      analytics: settings.analytics,
      marketing: settings.marketing,
    });
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] px-3 pb-3 md:px-6 md:pb-5">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-amber-300/35 bg-[#080b13]/95 shadow-[0_24px_90px_rgba(0,0,0,0.7),0_0_42px_rgba(245,158,11,0.14)] backdrop-blur-xl">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
          <div className="pointer-events-none absolute -left-20 -top-20 h-44 w-44 rounded-full bg-amber-400/12 blur-3xl" />

          <div className="grid gap-4 p-4 md:grid-cols-[72px_1fr_auto] md:items-center md:p-5">
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-2xl text-amber-100 shadow-[0_0_28px_rgba(245,158,11,0.12)] md:flex">
              🍪
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-200/75">
                Cookie preferences
              </div>

              <h3 className="mt-2 text-lg font-semibold leading-tight text-white md:text-xl">
                Мы используем cookies для работы и улучшения SkillEdge AI.
              </h3>

              <p className="mt-2 max-w-3xl text-xs leading-6 text-white/55 md:text-sm">
                Необходимые cookies помогают сайту и кабинету работать
                корректно. Аналитические и маркетинговые cookies используются
                только после согласия, если такие инструменты подключены.
              </p>

              <div className="mt-2 text-xs leading-5 text-white/42">
                Подробнее:{" "}
                <Link
                  href="/legal/cookies"
                  className="text-amber-200/85 underline-offset-4 transition hover:text-amber-100 hover:underline"
                >
                  Политика cookies
                </Link>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 md:min-w-[560px]">
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/30 bg-gradient-to-r from-amber-300 to-amber-500 px-5 py-3 text-sm font-semibold text-black shadow-[0_0_28px_rgba(245,158,11,0.25)] transition hover:scale-[1.01] hover:from-amber-200 hover:to-amber-400"
              >
                <span>✓</span>
                Принять все
              </button>

              <button
                type="button"
                onClick={rejectOptional}
                className="rounded-full border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-medium text-white/62 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                Отклонить
              </button>

              <button
                type="button"
                onClick={() => setSettingsOpen((current) => !current)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.055] px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-300/10"
              >
                <span>⚙</span>
                Настроить
              </button>
            </div>
          </div>

          {settingsOpen ? (
            <div className="border-t border-amber-300/15 bg-black/25 p-4 md:p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.045] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">
                      Необходимые
                    </div>

                    <div className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                      Always on
                    </div>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-white/50">
                    Нужны для входа, безопасности, сессии, dashboard и базовой
                    работы сайта.
                  </p>
                </div>

                <label className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-amber-300/20 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">
                      Аналитика
                    </div>

                    <input
                      type="checkbox"
                      checked={settings.analytics}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          analytics: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-amber-300"
                    />
                  </div>

                  <p className="mt-2 text-xs leading-5 text-white/50">
                    Помогает понимать посещаемость, ошибки, скорость и
                    конверсию.
                  </p>
                </label>

                <label className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-amber-300/20 hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">
                      Маркетинг
                    </div>

                    <input
                      type="checkbox"
                      checked={settings.marketing}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          marketing: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-amber-300"
                    />
                  </div>

                  <p className="mt-2 text-xs leading-5 text-white/50">
                    Для рекламных пикселей, ретаргетинга и оценки кампаний.
                  </p>
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={rejectOptional}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Только необходимые
                </button>

                <button
                  type="button"
                  onClick={saveCustom}
                  className="rounded-full border border-amber-300/25 bg-amber-300/10 px-5 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/15"
                >
                  Сохранить настройки
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}