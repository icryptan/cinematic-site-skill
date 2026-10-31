// @ts-nocheck -- запускается Bun'ом.
/**
 * Проверка собранного сайта перед показом и выкатом.
 *
 *   bun scripts/verify.ts                       — ссылки dist, форма текстов всех языков
 *   bun scripts/verify.ts --release             — плюс: в сайте не осталось демо-бренда и example.com
 *   bun scripts/verify.ts --forbid <строка> …   — плюс: этих строк нет в dist (например, адрес превью)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { site } from "../src/site.ts";

const args = process.argv.slice(2);
const release = args.includes("--release");
const forbid = args.flatMap((arg, i) => (arg === "--forbid" && args[i + 1] ? [args[i + 1]] : []));
const root = join(import.meta.dir, "..", "dist");
const problems: string[] = [];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

if (!existsSync(root)) {
  console.error("нет dist/ — сначала bun run build");
  process.exit(1);
}
const files = walk(root);
const texts = files.filter((path) => /\.(?:html|css|js|xml)$/.test(path)).map((path) => [path, readFileSync(path, "utf8")] as const);

// 1. Каждая локальная ссылка ведёт на существующий файл.
const referencePattern = /(?:src|href|poster|data-frame-src|data-poster)=["'](\/[^"'#?]+)|url\(["']?(\/[^)"'?]+)["']?\)/g;
for (const [file, contents] of texts) {
  for (const match of contents.matchAll(referencePattern)) {
    const reference = match[1] ?? match[2];
    if (!reference) continue;
    if (!existsSync(join(root, decodeURIComponent(reference).replace(/^\//, "")))) problems.push(`нет файла: ${reference} (в ${file.replace(root, "dist")})`);
  }
}

// 2. Тексты всех языков одной формы: те же ключи и столько же пунктов в списках.
const shape = (value: unknown, path = ""): string[] => {
  if (Array.isArray(value)) return [`${path}[${value.length}]`, ...value.flatMap((item, i) => shape(item, `${path}[${i}]`))];
  if (value && typeof value === "object") return Object.keys(value).sort().flatMap((key) => shape(value[key], `${path}.${key}`));
  return [path];
};
const base = shape(site.locales[0].copy);
for (const locale of site.locales.slice(1)) {
  const other = new Set(shape(locale.copy));
  const missing = base.filter((key) => !other.has(key));
  if (missing.length) problems.push(`язык ${locale.code}: не хватает ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}`);
}

// 3. Каждому языку — своя страница.
for (const locale of site.locales.slice(1)) {
  if (!existsSync(join(root, locale.code, "index.html"))) problems.push(`нет страницы языка /${locale.code}/`);
}

// 4. Перед выкатом: следов каркаса нет, каждый язык действительно переведён.
const demo = ["Your Brand", "example.com", "hello@example.com", "Каркас без визуала", "One line about what the brand does and for whom."];
if (release) {
  for (const word of demo) {
    const hits = texts.filter(([, contents]) => contents.includes(word)).map(([file]) => file.replace(root, "dist"));
    if (hits.length) problems.push(`след каркаса «${word}» ещё на сайте: ${hits.slice(0, 3).join(", ")}`);
  }
  const first = JSON.stringify(site.locales[0].copy);
  for (const locale of site.locales.slice(1)) {
    if (JSON.stringify(locale.copy) === first) problems.push(`язык ${locale.code}: тексты — копия первого языка, перевода нет`);
  }
}
for (const word of forbid) {
  const hits = texts.filter(([, contents]) => contents.includes(word)).map(([file]) => file.replace(root, "dist"));
  if (hits.length) problems.push(`запрещённая строка «${word}»: ${hits.slice(0, 3).join(", ")}`);
}
if (files.some((file) => file.endsWith(".DS_Store"))) problems.push("в dist есть .DS_Store — на сервер он не должен уйти");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`проверено файлов: ${files.length}; языков: ${site.locales.length}; замечаний нет${release ? " (режим выката)" : ""}`);
