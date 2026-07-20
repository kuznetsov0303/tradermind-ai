import {
  DEFAULT_LOCALE,
  LOCALE_META,
  getLocaleDirection,
  normalizeLocale,
  type Locale,
} from "./config";

export const SKILLEDGE_LANGUAGE_STORAGE_KEY = "skilledge_language";
export const SKILLEDGE_LANGUAGE_CHANGED_EVENT =
  "skilledge:language-changed";

export function getSavedLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(
    window.localStorage.getItem(SKILLEDGE_LANGUAGE_STORAGE_KEY)
  );
}

export function applyDocumentLocale(localeInput: string | null | undefined): Locale {
  const locale = normalizeLocale(localeInput);

  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
  }

  return locale;
}

export function saveLocale(localeInput: string | null | undefined): Locale {
  const locale = normalizeLocale(localeInput);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      SKILLEDGE_LANGUAGE_STORAGE_KEY,
      locale
    );

    window.dispatchEvent(
      new CustomEvent(SKILLEDGE_LANGUAGE_CHANGED_EVENT, {
        detail: { locale },
      })
    );
  }

  applyDocumentLocale(locale);
  return locale;
}

export function subscribeToLocaleChanges(
  callback: (locale: Locale) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{
      locale?: string;
      language?: string;
    }>;

    callback(
      normalizeLocale(
        customEvent.detail?.locale ??
          customEvent.detail?.language ??
          getSavedLocale()
      )
    );
  };

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === SKILLEDGE_LANGUAGE_STORAGE_KEY &&
      event.newValue
    ) {
      callback(normalizeLocale(event.newValue));
    }
  };

  window.addEventListener(
    SKILLEDGE_LANGUAGE_CHANGED_EVENT,
    onCustomEvent
  );
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(
      SKILLEDGE_LANGUAGE_CHANGED_EVENT,
      onCustomEvent
    );
    window.removeEventListener("storage", onStorage);
  };
}

export function getLocaleLabel(localeInput: string | null | undefined): string {
  const locale = normalizeLocale(localeInput);
  return LOCALE_META[locale]?.nativeLabel || locale.toUpperCase();
}
