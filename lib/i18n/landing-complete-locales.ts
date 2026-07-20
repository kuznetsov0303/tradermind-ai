import type { Locale } from "./config";

import en from "@/locales/landing-complete/en.json";
import ru from "@/locales/landing-complete/ru.json";
import uk from "@/locales/landing-complete/uk.json";
import zh from "@/locales/landing-complete/zh.json";
import de from "@/locales/landing-complete/de.json";
import fr from "@/locales/landing-complete/fr.json";
import es from "@/locales/landing-complete/es.json";
import ar from "@/locales/landing-complete/ar.json";
import it from "@/locales/landing-complete/it.json";
import nb from "@/locales/landing-complete/nb.json";
import ka from "@/locales/landing-complete/ka.json";
import pl from "@/locales/landing-complete/pl.json";
import tr from "@/locales/landing-complete/tr.json";
import el from "@/locales/landing-complete/el.json";
import hi from "@/locales/landing-complete/hi.json";

export type CompleteLandingLocaleDictionary = typeof en;

export const COMPLETE_LANDING_LOCALE_DICTIONARIES: Record<
  Locale,
  CompleteLandingLocaleDictionary
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

export function getCompleteLandingLocaleDictionary(
  locale: Locale,
): CompleteLandingLocaleDictionary {
  return COMPLETE_LANDING_LOCALE_DICTIONARIES[locale] ?? en;
}
