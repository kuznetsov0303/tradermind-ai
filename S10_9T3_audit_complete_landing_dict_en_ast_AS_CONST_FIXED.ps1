param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$runner=Join-Path $env:TEMP "s10_9t_landing_dict_ast_audit_$stamp.cjs"

$node=@'
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createRequire } = require("module");

const projectRoot = path.resolve(process.argv[2]);
const projectRequire = createRequire(path.join(projectRoot, "package.json"));
const ts = projectRequire("typescript");
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const landingPath = path.join(projectRoot, "components", "Landing.tsx");
const localePath = path.join(projectRoot, "locales", "landing", "en.json");
const reviewDir = path.join(projectRoot, "PROJECT_STATE", "i18n_exports");
const auditDir = path.join(projectRoot, "audit_exports");
const milestoneDir = path.join(projectRoot, "PROJECT_STATE", "milestones");

fs.mkdirSync(auditDir, { recursive: true });
fs.mkdirSync(milestoneDir, { recursive: true });

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!fs.existsSync(landingPath)) {
  fail(`Missing Landing source: ${landingPath}`);
}
if (!fs.existsSync(localePath)) {
  fail(`Missing installed English locale: ${localePath}`);
}

const reviewFiles = fs
  .readdirSync(reviewDir)
  .filter((name) => /^landing_en_master_review_\d+_\d+\.json$/i.test(name))
  .map((name) => ({
    name,
    fullPath: path.join(reviewDir, name),
    mtimeMs: fs.statSync(path.join(reviewDir, name)).mtimeMs,
  }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

if (!reviewFiles.length) {
  fail("No landing_en_master_review_*.json found");
}

const reviewPath = reviewFiles[0].fullPath;
const sourceText = fs.readFileSync(landingPath, "utf8");
const sourceFile = ts.createSourceFile(
  landingPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const installedEnglish = JSON.parse(fs.readFileSync(localePath, "utf8"));
const reviewEntries = JSON.parse(fs.readFileSync(reviewPath, "utf8"));

if (
  !installedEnglish ||
  Array.isArray(installedEnglish) ||
  typeof installedEnglish !== "object"
) {
  fail("Installed English locale must be a JSON object");
}
if (!Array.isArray(reviewEntries)) {
  fail("Landing English master review must be a JSON array");
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
  if (ts.isComputedPropertyName(nameNode)) {
    return `[${nameNode.expression.getText(sourceFile)}]`;
  }
  return nameNode.getText(sourceFile);
}

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

function findDictInitializer(node) {
  let found = null;

  function visit(current) {
    if (found) return;

    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.name.text === "dict" &&
      current.initializer
    ) {
      const initializer = unwrapExpression(current.initializer);

      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        found = initializer;
        return;
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return found;
}

function findObjectProperty(objectNode, propertyName) {
  for (const property of objectNode.properties) {
    if (!ts.isPropertyAssignment(property)) continue;

    if (propertyNameText(property.name) === propertyName) {
      return unwrapExpression(property.initializer);
    }
  }

  return null;
}

const dictInitializer = findDictInitializer(sourceFile);
if (!dictInitializer) {
  fail('Could not find object literal variable "dict"');
}

const enInitializer = findObjectProperty(dictInitializer, "en");
if (!enInitializer || !ts.isObjectLiteralExpression(enInitializer)) {
  fail('Could not find object literal "dict.en"');
}

function lineAndColumn(node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function literalValue(node) {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text;
  }
  return null;
}

const leaves = [];
const unsupportedNodes = [];

function walk(node, pathParts, nearestNamedKey, parentKind) {
  const directString = literalValue(node);

  if (directString !== null) {
    const location = lineAndColumn(node);
    leaves.push({
      path: `dict.en.${pathParts.join("")}`,
      pathParts,
      nearestNamedKey,
      parentKind,
      text: directString,
      line: location.line,
      column: location.column,
    });
    return;
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyNameText(property.name);
        if (name === null) continue;
        const nextPath = pathParts.length
          ? [...pathParts, `.${name}`]
          : [name];
        walk(property.initializer, nextPath, name, "object-property");
      } else if (ts.isShorthandPropertyAssignment(property)) {
        unsupportedNodes.push({
          type: "shorthand-property",
          text: property.getText(sourceFile),
          ...lineAndColumn(property),
        });
      } else if (ts.isSpreadAssignment(property)) {
        unsupportedNodes.push({
          type: "spread-assignment",
          text: property.getText(sourceFile),
          ...lineAndColumn(property),
        });
      } else if (
        ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property)
      ) {
        unsupportedNodes.push({
          type: "object-method-or-accessor",
          text: property.getText(sourceFile).slice(0, 200),
          ...lineAndColumn(property),
        });
      }
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      walk(
        element,
        [...pathParts, `[${index}]`],
        nearestNamedKey,
        "array-element",
      );
    });
    return;
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression?.(node)
  ) {
    walk(node.expression, pathParts, nearestNamedKey, parentKind);
    return;
  }

  if (ts.isTemplateExpression(node)) {
    unsupportedNodes.push({
      type: "template-expression",
      text: node.getText(sourceFile),
      path: `dict.en.${pathParts.join("")}`,
      ...lineAndColumn(node),
    });
    return;
  }

  // Numeric, boolean, null and other non-string leaves are intentionally ignored.
}

walk(enInitializer, [], "en", "root");

function looksTechnical(entry) {
  const value = entry.text.trim();
  const key = String(entry.nearestNamedKey || "").toLowerCase();

  const technicalKeys = new Set([
    "id",
    "gradient",
    "accent",
    "color",
    "colour",
    "hex",
    "href",
    "url",
    "route",
    "slug",
    "icon",
    "class",
    "classname",
    "network",
  ]);

  if (technicalKeys.has(key)) {
    return { technical: true, reason: `technical-key:${key}` };
  }

  if (/^#[0-9a-f]{3,8}$/i.test(value)) {
    return { technical: true, reason: "hex-color" };
  }

  if (
    /^(?:from|via|to)-[a-z0-9[\]#/%_.-]+(?:\s+(?:from|via|to)-[a-z0-9[\]#/%_.-]+)+$/i.test(
      value,
    )
  ) {
    return { technical: true, reason: "tailwind-gradient" };
  }

  if (/^(?:https?:\/\/|mailto:|tel:|\/[a-z0-9/_-]*)/i.test(value)) {
    return { technical: true, reason: "url-or-route" };
  }

  if (/^[a-z0-9_-]{1,20}$/i.test(value) && key === "id") {
    return { technical: true, reason: "identifier" };
  }

  return { technical: false, reason: null };
}

const installedByText = new Map();
for (const [canonicalKey, value] of Object.entries(installedEnglish)) {
  if (typeof value !== "string") continue;
  if (!installedByText.has(value)) installedByText.set(value, []);
  installedByText.get(value).push(canonicalKey);
}

const reviewByText = new Map();
for (const row of reviewEntries) {
  if (!row || typeof row.text !== "string") continue;
  if (!reviewByText.has(row.text)) reviewByText.set(row.text, []);
  reviewByText.get(row.text).push({
    canonicalKey: row.canonicalKey,
    sourceKey: row.sourceKey,
    occurrence: row.occurrence,
    protected: Boolean(row.protected),
  });
}

const exactCanonicalUsage = new Map();
const auditedLeaves = leaves.map((entry) => {
  const technical = looksTechnical(entry);
  const localeMatches = installedByText.get(entry.text) || [];
  const reviewMatches = reviewByText.get(entry.text) || [];

  let mappingStatus = "missing";
  let canonicalKey = null;

  if (localeMatches.length === 1) {
    canonicalKey = localeMatches[0];
    mappingStatus = "exact-unique";
  } else if (localeMatches.length > 1) {
    mappingStatus = "exact-ambiguous";
  }

  if (canonicalKey) {
    exactCanonicalUsage.set(
      canonicalKey,
      (exactCanonicalUsage.get(canonicalKey) || 0) + 1,
    );
  }

  return {
    ...entry,
    technical: technical.technical,
    technicalReason: technical.reason,
    mappingStatus,
    canonicalKey,
    localeMatchKeys: localeMatches,
    reviewMatches,
  };
});

const translatableLeaves = auditedLeaves.filter((row) => !row.technical);
const technicalLeaves = auditedLeaves.filter((row) => row.technical);
const coveredLeaves = translatableLeaves.filter(
  (row) =>
    row.mappingStatus === "exact-unique" ||
    row.mappingStatus === "exact-ambiguous",
);
const missingLeaves = translatableLeaves.filter(
  (row) => row.mappingStatus === "missing",
);
const ambiguousLeaves = translatableLeaves.filter(
  (row) => row.mappingStatus === "exact-ambiguous",
);

const missingUniqueByText = new Map();
for (const row of missingLeaves) {
  if (!missingUniqueByText.has(row.text)) {
    missingUniqueByText.set(row.text, {
      text: row.text,
      paths: [],
      nearestNamedKeys: new Set(),
      firstLine: row.line,
    });
  }
  const item = missingUniqueByText.get(row.text);
  item.paths.push(row.path);
  item.nearestNamedKeys.add(row.nearestNamedKey);
}

const missingUnique = [...missingUniqueByText.values()].map((item, index) => ({
  provisionalKey: `landingMissing.${String(index + 1).padStart(4, "0")}`,
  text: item.text,
  paths: item.paths,
  nearestNamedKeys: [...item.nearestNamedKeys].sort(),
  firstLine: item.firstLine,
}));

const unusedInstalledKeys = Object.keys(installedEnglish).filter(
  (key) => !exactCanonicalUsage.has(key),
);

const duplicatePathAssignments = [...exactCanonicalUsage.entries()]
  .filter(([, count]) => count > 1)
  .map(([canonicalKey, count]) => ({
    canonicalKey,
    count,
    paths: auditedLeaves
      .filter((row) => row.canonicalKey === canonicalKey)
      .map((row) => row.path),
  }));

const summary = {
  ok: true,
  classification: "LANDING_DICT_EN_AST_AUDIT_COMPLETE",
  inspectionOnly: true,
  projectMutation: false,
  productionMutation: false,
  vpsTouched: false,
  sourceFile: landingPath,
  sourceSha256: crypto.createHash("sha256").update(sourceText).digest("hex"),
  installedEnglishFile: localePath,
  reviewFile: reviewPath,
  totalStringLeaves: auditedLeaves.length,
  translatableStringLeaves: translatableLeaves.length,
  technicalStringLeaves: technicalLeaves.length,
  coveredStringLeaves: coveredLeaves.length,
  missingStringLeaves: missingLeaves.length,
  missingUniqueTexts: missingUnique.length,
  ambiguousStringLeaves: ambiguousLeaves.length,
  installedEnglishEntries: Object.keys(installedEnglish).length,
  unusedInstalledEnglishKeys: unusedInstalledKeys.length,
  duplicateCanonicalAssignments: duplicatePathAssignments.length,
  unsupportedAstNodes: unsupportedNodes.length,
  nextAction:
    missingUnique.length > 0
      ? "GENERATE_ONLY_MISSING_LANDING_TRANSLATIONS"
      : ambiguousLeaves.length > 0
        ? "RESOLVE_AMBIGUOUS_PATH_TO_KEY_MAPPING"
        : "WIRE_COMPLETE_LANDING_DICTIONARY",
};

const rawPath = path.join(
  auditDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_raw_${stamp}.json`,
);
const reportPath = path.join(
  auditDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_report_${stamp}.txt`,
);
const leavesPath = path.join(
  auditDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_leaves_${stamp}.json`,
);
const missingPath = path.join(
  auditDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_missing_${stamp}.json`,
);
const mappingPath = path.join(
  auditDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_mapping_${stamp}.json`,
);
const milestonePath = path.join(
  milestoneDir,
  `S10_9T_LANDING_DICT_AST_AUDIT_${stamp}.md`,
);

const raw = {
  ...summary,
  unusedInstalledKeys,
  duplicatePathAssignments,
  unsupportedNodes,
};

fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2), "utf8");
fs.writeFileSync(leavesPath, JSON.stringify(auditedLeaves, null, 2), "utf8");
fs.writeFileSync(missingPath, JSON.stringify(missingUnique, null, 2), "utf8");
fs.writeFileSync(
  mappingPath,
  JSON.stringify(
    auditedLeaves.map((row) => ({
      path: row.path,
      text: row.text,
      technical: row.technical,
      mappingStatus: row.mappingStatus,
      canonicalKey: row.canonicalKey,
      localeMatchKeys: row.localeMatchKeys,
      line: row.line,
    })),
    null,
    2,
  ),
  "utf8",
);

const reportLines = [
  "S10.9T LANDING DICT.EN AST AUDIT",
  `Generated=${stamp}`,
  "OK=True",
  "CLASSIFICATION=LANDING_DICT_EN_AST_AUDIT_COMPLETE",
  "INSPECTION_ONLY=True",
  "PROJECT_MUTATION=False",
  "PRODUCTION_MUTATION=False",
  "VPS_TOUCHED=False",
  `TOTAL_STRING_LEAVES=${summary.totalStringLeaves}`,
  `TRANSLATABLE_STRING_LEAVES=${summary.translatableStringLeaves}`,
  `TECHNICAL_STRING_LEAVES=${summary.technicalStringLeaves}`,
  `COVERED_STRING_LEAVES=${summary.coveredStringLeaves}`,
  `MISSING_STRING_LEAVES=${summary.missingStringLeaves}`,
  `MISSING_UNIQUE_TEXTS=${summary.missingUniqueTexts}`,
  `AMBIGUOUS_STRING_LEAVES=${summary.ambiguousStringLeaves}`,
  `INSTALLED_ENGLISH_ENTRIES=${summary.installedEnglishEntries}`,
  `UNUSED_INSTALLED_ENGLISH_KEYS=${summary.unusedInstalledEnglishKeys}`,
  `DUPLICATE_CANONICAL_ASSIGNMENTS=${summary.duplicateCanonicalAssignments}`,
  `UNSUPPORTED_AST_NODES=${summary.unsupportedAstNodes}`,
  "",
  "=== MISSING UNIQUE SAMPLE ===",
  ...missingUnique.slice(0, 40).map(
    (row) =>
      `${row.provisionalKey} | line=${row.firstLine} | ${row.text}`,
  ),
  "",
  "=== AMBIGUOUS SAMPLE ===",
  ...ambiguousLeaves.slice(0, 30).map(
    (row) =>
      `${row.path} | matches=${row.localeMatchKeys.join(",")} | ${row.text}`,
  ),
  "",
  `RAW_JSON=${rawPath}`,
  `LEAVES_JSON=${leavesPath}`,
  `MISSING_JSON=${missingPath}`,
  `MAPPING_JSON=${mappingPath}`,
  `NEXT_ACTION=${summary.nextAction}`,
];

fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

fs.writeFileSync(
  milestonePath,
  [
    "# S10.9T Landing dict.en AST Audit",
    "",
    "- OK: True",
    `- Total string leaves: ${summary.totalStringLeaves}`,
    `- Translatable leaves: ${summary.translatableStringLeaves}`,
    `- Technical leaves: ${summary.technicalStringLeaves}`,
    `- Covered leaves: ${summary.coveredStringLeaves}`,
    `- Missing leaves: ${summary.missingStringLeaves}`,
    `- Missing unique texts: ${summary.missingUniqueTexts}`,
    `- Ambiguous leaves: ${summary.ambiguousStringLeaves}`,
    "- Inspection only: True",
    "- Project mutation: False",
    "- Production mutation: False",
    "- VPS touched: False",
    `- Next: ${summary.nextAction}`,
    "",
  ].join("\n"),
  "utf8",
);

console.log("");
console.log("=== S10.9T COMPLETE ===");
console.log("OK: True");
console.log("Classification: LANDING_DICT_EN_AST_AUDIT_COMPLETE");
console.log(`Total string leaves: ${summary.totalStringLeaves}`);
console.log(`Translatable string leaves: ${summary.translatableStringLeaves}`);
console.log(`Technical string leaves: ${summary.technicalStringLeaves}`);
console.log(`Covered string leaves: ${summary.coveredStringLeaves}`);
console.log(`Missing string leaves: ${summary.missingStringLeaves}`);
console.log(`Missing unique texts: ${summary.missingUniqueTexts}`);
console.log(`Ambiguous string leaves: ${summary.ambiguousStringLeaves}`);
console.log(`Installed English entries: ${summary.installedEnglishEntries}`);
console.log(`Unused installed English keys: ${summary.unusedInstalledEnglishKeys}`);
console.log(`Unsupported AST nodes: ${summary.unsupportedAstNodes}`);
console.log("Inspection only: True");
console.log("Project mutation: False");
console.log("Production mutation: False");
console.log("VPS touched: False");
console.log(`Report: ${reportPath}`);
console.log(`Raw: ${rawPath}`);
console.log(`Missing: ${missingPath}`);
console.log(`Mapping: ${mappingPath}`);
console.log(`Milestone: ${milestonePath}`);
console.log(`Next action: ${summary.nextAction}`);
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
  throw "S10.9T Landing dict.en AST audit blocked"
}
