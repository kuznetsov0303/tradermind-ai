export const LOCALES = [
  "en",
  "ru",
  "uk",
  "zh",
  "de",
  "fr",
  "es",
  "ar",
  "it",
  "nb",
  "ka",
  "pl",
  "tr",
  "el",
  "hi",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const RTL_LOCALES: Locale[] = ["ar"];

export type LocaleMeta = {
  code: Locale;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: {
    code: "en",
    label: "English",
    nativeLabel: "English",
    dir: "ltr",
  },
  ru: {
    code: "ru",
    label: "Russian",
    nativeLabel: "Русский",
    dir: "ltr",
  },
  uk: {
    code: "uk",
    label: "Ukrainian",
    nativeLabel: "Українська",
    dir: "ltr",
  },
  zh: {
    code: "zh",
    label: "Chinese",
    nativeLabel: "中文",
    dir: "ltr",
  },
  de: {
    code: "de",
    label: "German",
    nativeLabel: "Deutsch",
    dir: "ltr",
  },
  fr: {
    code: "fr",
    label: "French",
    nativeLabel: "Français",
    dir: "ltr",
  },
  es: {
    code: "es",
    label: "Spanish",
    nativeLabel: "Español",
    dir: "ltr",
  },
  ar: {
    code: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    dir: "rtl",
  },
  it: {
    code: "it",
    label: "Italian",
    nativeLabel: "Italiano",
    dir: "ltr",
  },
  nb: {
    code: "nb",
    label: "Norwegian",
    nativeLabel: "Norsk",
    dir: "ltr",
  },
  ka: {
    code: "ka",
    label: "Georgian",
    nativeLabel: "ქართული",
    dir: "ltr",
  },
  pl: {
    code: "pl",
    label: "Polish",
    nativeLabel: "Polski",
    dir: "ltr",
  },
  tr: {
    code: "tr",
    label: "Turkish",
    nativeLabel: "Türkçe",
    dir: "ltr",
  },
  el: {
    code: "el",
    label: "Greek",
    nativeLabel: "Ελληνικά",
    dir: "ltr",
  },
  hi: {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    dir: "ltr",
  },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && LOCALES.includes(value as Locale));
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const normalized = value.toLowerCase();

  if (normalized === "ua") {
    return "uk";
  }

  if (normalized === "no") {
    return "nb";
  }

  if (isLocale(normalized)) {
    return normalized;
  }

  return DEFAULT_LOCALE;
}

export function getLocaleDirection(locale: Locale): "ltr" | "rtl" {
  return LOCALE_META[locale]?.dir || "ltr";
}