import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const localeDir = path.join(root, "locales");
const requiredLocales = [
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
];

const mojibakePatterns = [
  "РІ",
  "РЎ",
  "Рµ",
  "вЂ",
  "вњ",
  "Ð",
  "Ñ",
];

function flatten(value, prefix = "", output = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      flatten(child, nextKey, output);
    } else {
      output[nextKey] = child;
    }
  }

  return output;
}

if (!fs.existsSync(localeDir)) {
  console.log("I18N_LOCALE_DIRECTORY_NOT_CREATED_YET");
  process.exit(0);
}

const missingFiles = requiredLocales.filter(
  (locale) => !fs.existsSync(path.join(localeDir, `${locale}.json`))
);

if (missingFiles.length) {
  throw new Error(
    `Missing locale files: ${missingFiles.join(", ")}`
  );
}

const dictionaries = Object.fromEntries(
  requiredLocales.map((locale) => {
    const file = path.join(localeDir, `${locale}.json`);
    const raw = fs.readFileSync(file, "utf8");

    for (const pattern of mojibakePatterns) {
      if (raw.includes(pattern)) {
        throw new Error(
          `Mojibake pattern ${pattern} found in ${locale}.json`
        );
      }
    }

    return [locale, flatten(JSON.parse(raw))];
  })
);

const englishKeys = Object.keys(dictionaries.en).sort();

for (const locale of requiredLocales) {
  const keys = Object.keys(dictionaries[locale]).sort();
  const missing = englishKeys.filter((key) => !(key in dictionaries[locale]));
  const extra = keys.filter((key) => !(key in dictionaries.en));
  const empty = keys.filter(
    (key) =>
      typeof dictionaries[locale][key] !== "string" ||
      dictionaries[locale][key].trim() === ""
  );

  if (missing.length || extra.length || empty.length) {
    throw new Error(
      JSON.stringify(
        { locale, missing, extra, empty },
        null,
        2
      )
    );
  }
}

console.log("I18N_LOCALE_VALIDATION_PASSED");
console.log(`Locales: ${requiredLocales.length}`);
console.log(`English keys: ${englishKeys.length}`);
