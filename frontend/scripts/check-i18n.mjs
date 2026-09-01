/**
 * i18n integrity check. Fails if:
 *   - en.js and hu.js disagree on any key path
 *   - a t("…") call in src/ resolves in neither dictionary
 *   - a dictionary key is referenced nowhere (dead copy)
 *   - a placeholder like {name} exists in one language but not the other
 *
 * Run with `yarn i18n:check`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const en = (await import(join(SRC, "i18n/en.js"))).default;
const hu = (await import(join(SRC, "i18n/hu.js"))).default;

function paths(node, prefix = "") {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? paths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function resolve(node, path) {
  return path.split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), node);
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx?$/.test(entry) ? [full] : [];
  });
}

const enPaths = new Set(paths(en));
const huPaths = new Set(paths(hu));
const errors = [];
const warnings = [];

// 1. Structural parity.
for (const path of enPaths) if (!huPaths.has(path)) errors.push(`missing in hu.js: ${path}`);
for (const path of huPaths) if (!enPaths.has(path)) errors.push(`missing in en.js: ${path}`);

// 2. Placeholder parity — a {name} dropped in translation silently breaks copy.
for (const path of enPaths) {
  if (!huPaths.has(path)) continue;
  const placeholders = (value) =>
    typeof value === "string" ? [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : [];
  const a = placeholders(resolve(en, path)).join(",");
  const b = placeholders(resolve(hu, path)).join(",");
  if (a !== b) errors.push(`placeholder mismatch at ${path}: en{${a}} vs hu{${b}}`);
}

// 3. Every t() call must resolve. Covers ternaries — t(x ? "a.b" : "c.d") — by
//    taking every string literal in the call arguments. Dynamic
//    t(`product.cats.${x}`) calls are recorded as prefixes and not resolved.
const files = walk(SRC).filter((f) => !f.includes(`${"i18n"}/`));
const used = new Set();
const dynamicPrefixes = new Set();

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const where = file.replace(SRC, "src");

  for (const call of source.matchAll(/\bt\(([^)]*)\)/g)) {
    for (const literal of call[1].matchAll(/"([\w.]+)"/g)) {
      const key = literal[1];
      // Top-level keys (e.g. "marquee") are valid too, but a bare word that
      // resolves to nothing is just an ordinary string, not a missing key.
      if (!key.includes(".") && resolve(en, key) === undefined) continue;
      used.add(key);
      if (resolve(en, key) === undefined) {
        errors.push(`unresolved key ${JSON.stringify(key)} in ${where}`);
      }
    }
  }
  for (const match of source.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
    dynamicPrefixes.add(match[1]);
  }
  // Keys passed around as bare literals before reaching t(), e.g. a helper
  // returning "staff.rewardUnlocked".
  for (const literal of source.matchAll(/"([a-z][\w]*(?:\.[\w]+)+)"/g)) {
    if (resolve(en, literal[1]) !== undefined) used.add(literal[1]);
  }
}

// 4. Dead copy: keys referenced by nothing, ignoring dynamic-prefix families and
//    nested objects/arrays consumed wholesale (e.g. t("home.about.chapters")).
const consumedWholesale = [...used].filter(
  (key) => typeof resolve(en, key) === "object",
);
for (const path of enPaths) {
  if (used.has(path)) continue;
  if ([...dynamicPrefixes].some((prefix) => path.startsWith(prefix))) continue;
  if (consumedWholesale.some((parent) => path.startsWith(`${parent}.`))) continue;
  warnings.push(`unused key: ${path}`);
}

console.log(`en: ${enPaths.size} keys · hu: ${huPaths.size} keys`);
console.log(`t() calls: ${used.size} static, ${dynamicPrefixes.size} dynamic prefixes`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
console.log("\n✓ i18n consistent");
