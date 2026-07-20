import type { Locale } from "./config";

import en from "@/locales/landing/en.json";
import ru from "@/locales/landing/ru.json";
import uk from "@/locales/landing/uk.json";
import zh from "@/locales/landing/zh.json";
import de from "@/locales/landing/de.json";
import fr from "@/locales/landing/fr.json";
import es from "@/locales/landing/es.json";
import ar from "@/locales/landing/ar.json";
import it from "@/locales/landing/it.json";
import nb from "@/locales/landing/nb.json";
import ka from "@/locales/landing/ka.json";
import pl from "@/locales/landing/pl.json";
import tr from "@/locales/landing/tr.json";
import el from "@/locales/landing/el.json";
import hi from "@/locales/landing/hi.json";

export type LandingLocaleDictionary = typeof en;

export const LANDING_LOCALE_DICTIONARIES: Record<
  Locale,
  LandingLocaleDictionary
> = {
  en,
  ru,
  uk,
  zh,
  de,
  fr,
  es,
  ar,
  it,
  nb,
  ka,
  pl,
  tr,
  el,
  hi,
};

export function getLandingLocaleDictionary(
  locale: Locale,
): LandingLocaleDictionary {
  return LANDING_LOCALE_DICTIONARIES[locale] ?? en;
}
