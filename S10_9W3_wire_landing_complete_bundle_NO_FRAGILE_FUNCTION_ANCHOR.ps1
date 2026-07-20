param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9w_wire_complete_landing_$stamp.cjs"

$node=@'
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const { createRequire } = require("module");

const projectRoot = path.resolve(process.argv[2]);
const projectRequire = createRequire(path.join(projectRoot, "package.json"));
const ts = projectRequire("typescript");
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

const landingPath = path.join(projectRoot, "components", "Landing.tsx");
const completeDir = path.join(projectRoot, "locales", "landing-complete");
const pathMapPath = path.join(completeDir, "path-map.json");
const manifestPath = path.join(completeDir, "manifest.json");
const structuredLoaderPath = path.join(
  projectRoot,
  "lib",
  "i18n",
  "landing-structured-locales.ts",
);
const auditDir = path.join(projectRoot, "audit_exports");
const milestoneDir = path.join(projectRoot, "PROJECT_STATE", "milestones");
const backupRoot = path.join(
  projectRoot,
  "PROJECT_STATE",
  `S10_9W_landing_wiring_backup_${stamp}`,
);

const locales = [
  "en", "ru", "uk", "zh", "de", "fr", "es", "ar",
  "it", "nb", "ka", "pl", "tr", "el", "hi",
];

fs.mkdirSync(auditDir, { recursive: true });
fs.mkdirSync(milestoneDir, { recursive: true });
fs.mkdirSync(backupRoot, { recursive: true });

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (!fs.existsSync(landingPath)) fail(`Missing ${landingPath}`);
if (!fs.existsSync(pathMapPath)) fail(`Missing ${pathMapPath}`);
if (!fs.existsSync(manifestPath)) fail(`Missing ${manifestPath}`);

for (const locale of locales) {
  const localeFile = path.join(completeDir, `${locale}.json`);
  if (!fs.existsSync(localeFile)) fail(`Missing ${localeFile}`);
}

const originalLanding = fs.readFileSync(landingPath, "utf8");
const originalLandingHash = crypto
  .createHash("sha256")
  .update(originalLanding)
  .digest("hex");

const sourceFile = ts.createSourceFile(
  landingPath,
  originalLanding,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function unwrapExpression(node) {
  let current = node;

  while (current) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      (typeof ts.isSatisfiesExpression === "function" &&
        ts.isSatisfiesExpression(current))
    ) {
      current = current.expression;
      continue;
    }

    break;
  }

  return current;
}

function propertyNameText(nameNode) {
  if (!nameNode) return null;

  if (
    ts.isIdentifier(nameNode) ||
    ts.isStringLiteral(nameNode) ||
    ts.isNumericLiteral(nameNode)
  ) {
    return nameNode.text;
  }

  return nameNode.getText(sourceFile);
}

function findDictObject() {
  let found = null;

  function visit(node) {
    if (found) return;

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "dict" &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);

      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        found = initializer;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function findPropertyObject(objectNode, propertyName) {
  for (const property of objectNode.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) !== propertyName) continue;

    const initializer = unwrapExpression(property.initializer);
    return initializer;
  }

  return null;
}

const dictObject = findDictObject();
if (!dictObject) fail('Could not locate const dict object');

const englishObject = findPropertyObject(dictObject, "en");
if (!englishObject || !ts.isObjectLiteralExpression(englishObject)) {
  fail("Could not locate dict.en object");
}

const pathMap = readJson(pathMapPath);
const completeManifest = readJson(manifestPath);
const technicalPathsSkipped = new Set(
  Array.isArray(completeManifest.technicalPathsSkipped)
    ? completeManifest.technicalPathsSkipped
    : [],
);

const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    readJson(path.join(completeDir, `${locale}.json`)),
  ]),
);

const completeKeys = new Set(Object.keys(dictionaries.en));

for (const locale of locales) {
  const localeKeys = new Set(Object.keys(dictionaries[locale]));

  if (
    localeKeys.size !== completeKeys.size ||
    [...completeKeys].some((key) => !localeKeys.has(key))
  ) {
    fail(`Locale key parity failed for ${locale}`);
  }
}

const unresolved = [];
const usedKeys = new Set();

function cloneForLocale(node, locale, pathParts) {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    const astPath = `dict.en.${pathParts.join("")}`;
    const canonicalKey = pathMap[astPath];

    if (!canonicalKey) {
      if (technicalPathsSkipped.has(astPath)) {
        return node;
      }

      unresolved.push(astPath);
      return node;
    }

    const translated = dictionaries[locale][canonicalKey];

    if (typeof translated !== "string") {
      fail(`${locale}: missing string for ${canonicalKey}`);
    }

    usedKeys.add(canonicalKey);
    return ts.factory.createStringLiteral(translated);
  }

  if (ts.isObjectLiteralExpression(node)) {
    return ts.factory.updateObjectLiteralExpression(
      node,
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) return property;

        const name = propertyNameText(property.name);
        const nextPath = pathParts.length
          ? [...pathParts, `.${name}`]
          : [name];

        return ts.factory.updatePropertyAssignment(
          property,
          property.name,
          cloneForLocale(property.initializer, locale, nextPath),
        );
      }),
    );
  }

  if (ts.isArrayLiteralExpression(node)) {
    return ts.factory.updateArrayLiteralExpression(
      node,
      node.elements.map((element, index) =>
        cloneForLocale(element, locale, [...pathParts, `[${index}]`]),
      ),
    );
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    (typeof ts.isSatisfiesExpression === "function" &&
      ts.isSatisfiesExpression(node))
  ) {
    const inner = cloneForLocale(node.expression, locale, pathParts);

    if (ts.isParenthesizedExpression(node)) {
      return ts.factory.updateParenthesizedExpression(node, inner);
    }

    if (ts.isAsExpression(node)) {
      return ts.factory.updateAsExpression(node, inner, node.type);
    }

    if (ts.isTypeAssertionExpression(node)) {
      return ts.factory.updateTypeAssertion(node, node.type, inner);
    }

    return ts.factory.updateSatisfiesExpression(node, inner, node.type);
  }

  return node;
}

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});

const generatedObjects = {};

for (const locale of locales) {
  generatedObjects[locale] = cloneForLocale(englishObject, locale, []);
}

if (unresolved.length) {
  fail(
    `Unresolved translatable AST paths: ${JSON.stringify(
      [...new Set(unresolved)].sort(),
    )}`,
  );
}

const objectBlocks = locales
  .map((locale) => {
    const printed = printer.printNode(
      ts.EmitHint.Expression,
      generatedObjects[locale],
      sourceFile,
    );

    return `const ${locale} = ${printed} as const;`;
  })
  .join("\n\n");

const dictionaryEntries = locales.map((locale) => `  ${locale},`).join("\n");

const structuredLoader = `import type { Locale } from "./config";

${objectBlocks}

export type StructuredLandingDictionary = typeof en;

export const STRUCTURED_LANDING_DICTIONARIES: Record<
  Locale,
  StructuredLandingDictionary
> = {
${dictionaryEntries}
};

export function getStructuredLandingDictionary(
  locale: Locale,
): StructuredLandingDictionary {
  return STRUCTURED_LANDING_DICTIONARIES[locale] ?? en;
}
`;

const backupLanding = path.join(backupRoot, "components", "Landing.tsx");
const backupLoader = path.join(
  backupRoot,
  "lib",
  "i18n",
  "landing-structured-locales.ts",
);

fs.mkdirSync(path.dirname(backupLanding), { recursive: true });
fs.copyFileSync(landingPath, backupLanding);

if (fs.existsSync(structuredLoaderPath)) {
  fs.mkdirSync(path.dirname(backupLoader), { recursive: true });
  fs.copyFileSync(structuredLoaderPath, backupLoader);
}

function restore() {
  fs.copyFileSync(backupLanding, landingPath);

  if (fs.existsSync(backupLoader)) {
    fs.mkdirSync(path.dirname(structuredLoaderPath), { recursive: true });
    fs.copyFileSync(backupLoader, structuredLoaderPath);
  } else if (fs.existsSync(structuredLoaderPath)) {
    fs.unlinkSync(structuredLoaderPath);
  }
}

fs.mkdirSync(path.dirname(structuredLoaderPath), { recursive: true });
fs.writeFileSync(structuredLoaderPath, structuredLoader, "utf8");

const importAnchor =
  'import { applyDocumentLocale, getSavedLocale, saveLocale } from "@/lib/i18n/runtime";';

const newImport =
  'import { getStructuredLandingDictionary } from "@/lib/i18n/landing-structured-locales";';

if (!originalLanding.includes(importAnchor)) {
  restore();
  fail("Landing runtime import anchor not found");
}

let patchedLanding = originalLanding;

if (!patchedLanding.includes(newImport)) {
  patchedLanding = patchedLanding.replace(
    importAnchor,
    `${importAnchor}\n${newImport}`,
  );
}

const selectionAnchor =
  "  const t = dict[getLandingDictionaryLocale(language)];";

if (!patchedLanding.includes(selectionAnchor)) {
  restore();
  fail("Landing dictionary selection anchor not found");
}

patchedLanding = patchedLanding.replace(
  selectionAnchor,
  "  const t = getStructuredLandingDictionary(language);",
);

fs.writeFileSync(landingPath, patchedLanding, "utf8");

const build = cp.spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  },
);

const buildLog = path.join(
  auditDir,
  `S10_9W_LANDING_COMPLETE_WIRING_build_${stamp}.txt`,
);

fs.writeFileSync(
  buildLog,
  `${build.stdout || ""}\n--- STDERR ---\n${build.stderr || ""}`,
  "utf8",
);

if (build.status !== 0) {
  restore();
  fail(`Build failed and wiring was restored. See ${buildLog}`);
}

const finalLanding = fs.readFileSync(landingPath, "utf8");
const finalLandingHash = crypto
  .createHash("sha256")
  .update(finalLanding)
  .digest("hex");

const raw = {
  ok: true,
  classification: "LANDING_COMPLETE_LOCALE_WIRING_PASSED",
  productionMutation: false,
  vpsTouched: false,
  runtimeAiTranslation: false,
  localesWired: locales.length,
  completeEntriesPerLocale: completeKeys.size,
  astPathAssignmentsUsed: Object.keys(pathMap).length,
  uniqueLocaleKeysUsed: usedKeys.size,
  technicalPathsPreserved: technicalPathsSkipped.size,
  landingComponentChanged: true,
  structuredLoaderCreated: true,
  oldThreeLanguageSelectorBypassed: true,
  buildPassed: true,
  originalLandingSha256: originalLandingHash,
  finalLandingSha256: finalLandingHash,
  backupRoot,
  buildLog,
  nextAction: "RUN_LOCAL_VISUAL_AND_LANGUAGE_SWITCH_QA",
};

const rawPath = path.join(
  auditDir,
  `S10_9W_LANDING_COMPLETE_WIRING_raw_${stamp}.json`,
);
const reportPath = path.join(
  auditDir,
  `S10_9W_LANDING_COMPLETE_WIRING_report_${stamp}.txt`,
);
const milestonePath = path.join(
  milestoneDir,
  `S10_9W_LANDING_COMPLETE_WIRING_${stamp}.md`,
);

fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2), "utf8");

fs.writeFileSync(
  reportPath,
  [
    "S10.9W LANDING COMPLETE LOCALE WIRING",
    `Generated=${stamp}`,
    "OK=True",
    "CLASSIFICATION=LANDING_COMPLETE_LOCALE_WIRING_PASSED",
    `LOCALES_WIRED=${locales.length}`,
    `COMPLETE_ENTRIES_PER_LOCALE=${completeKeys.size}`,
    `AST_PATH_ASSIGNMENTS_USED=${Object.keys(pathMap).length}`,
    `UNIQUE_LOCALE_KEYS_USED=${usedKeys.size}`,
    `TECHNICAL_PATHS_PRESERVED=${technicalPathsSkipped.size}`,
    "LANDING_COMPONENT_CHANGED=True",
    "STRUCTURED_LOADER_CREATED=True",
    "OLD_THREE_LANGUAGE_SELECTOR_BYPASSED=True",
    "BUILD_PASSED=True",
    "RUNTIME_AI_TRANSLATION=False",
    "PRODUCTION_MUTATION=False",
    "VPS_TOUCHED=False",
    `ORIGINAL_LANDING_SHA256=${originalLandingHash}`,
    `FINAL_LANDING_SHA256=${finalLandingHash}`,
    `BACKUP_ROOT=${backupRoot}`,
    `BUILD_LOG=${buildLog}`,
    `RAW_JSON=${rawPath}`,
    "NEXT_ACTION=RUN_LOCAL_VISUAL_AND_LANGUAGE_SWITCH_QA",
    "",
  ].join("\n"),
  "utf8",
);

fs.writeFileSync(
  milestonePath,
  [
    "# S10.9W Landing Complete Locale Wiring",
    "",
    "- OK: True",
    `- Locales wired: ${locales.length}`,
    `- Complete entries per locale: ${completeKeys.size}`,
    `- AST path assignments: ${Object.keys(pathMap).length}`,
    "- Landing component changed: True",
    "- Structured loader created: True",
    "- Old 3-language fallback selector bypassed: True",
    "- Build passed: True",
    "- Runtime AI translation: False",
    "- Production mutation: False",
    "- VPS touched: False",
    "- Next: local visual and language-switch QA",
    "",
  ].join("\n"),
  "utf8",
);

console.log("");
console.log("=== S10.9W COMPLETE ===");
console.log("OK: True");
console.log("Classification: LANDING_COMPLETE_LOCALE_WIRING_PASSED");
console.log(`Locales wired: ${locales.length}`);
console.log(`Complete entries per locale: ${completeKeys.size}`);
console.log(`AST path assignments used: ${Object.keys(pathMap).length}`);
console.log(`Unique locale keys used: ${usedKeys.size}`);
console.log(`Technical paths preserved: ${technicalPathsSkipped.size}`);
console.log("Landing component changed: True");
console.log("Structured loader created: True");
console.log("Old 3-language selector bypassed: True");
console.log("Build passed: True");
console.log("Runtime AI translation: False");
console.log("Production mutation: False");
console.log("VPS touched: False");
console.log(`Backup root: ${backupRoot}`);
console.log(`Build log: ${buildLog}`);
console.log(`Report: ${reportPath}`);
console.log(`Raw: ${rawPath}`);
console.log(`Milestone: ${milestonePath}`);
console.log("Next action: RUN_LOCAL_VISUAL_AND_LANGUAGE_SWITCH_QA");
'@

[IO.File]::WriteAllText(
  $runner,
  $node,
  [Text.UTF8Encoding]::new($false)
)

try{
  & node $runner $ProjectRoot
  $exitCode=$LASTEXITCODE
}finally{
  Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue
}

if($exitCode-ne 0){
  throw "S10.9W Landing complete locale wiring blocked"
}
