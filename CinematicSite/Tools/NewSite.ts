#!/usr/bin/env bun
/**
 * NewSite.ts — новый проект из комплектного нейтрального каркаса, без визуала.
 *
 *   bun NewSite.ts --name <slug> [--dir <путь>] [--brand "Имя"] [--mark X] [--url https://…]
 *                  [--locales en,pt:pt-PT] [--kit <путь к набору>] [--no-install] [--no-git]
 *
 * Языки: код пути и, через двоеточие, региональный hreflang (pt:pt-PT → страница /pt/, hreflang pt-PT).
 *
 * Что делает: копирует комплектный Kit/ (для внешнего git-набора — экспорт main),
 * подставляет имя, знак, адрес и языки в src/site.ts, знак в
 * favicon, имя пакета, ставит зависимости, делает git init и первый коммит.
 *
 * Визуал не задаёт: палитра, шрифты, разделы, мир и движение пишутся по выбранному
 * направлению. `bun scripts/verify.ts --release` не пропустит выкат, пока в сайте
 * остаются следы каркаса.
 *
 * Набор по умолчанию: комплектная папка Kit/; другой набор задаётся --kit или CINEMATIC_KIT.
 * Каталог по умолчанию: ./<slug>. Существующий каталог никогда не перезаписывается.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const has = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
if (has("help") || !opt("name")) {
  console.log((await Bun.file(import.meta.path).text()).split("*/")[0]);
  process.exit(has("help") ? 0 : 2);
}
// Незнакомый флаг — ошибка, а не тишина: молча проглоченный флаг даёт сайт не таким, каким его просили.
const known = new Set(["name", "dir", "brand", "mark", "url", "locales", "kit", "no-install", "no-git", "help"]);
const unknownFlags = args.filter((a) => a.startsWith("--") && !known.has(a.slice(2)));
if (unknownFlags.length) {
  console.error(`незнакомые флаги: ${unknownFlags.join(" ")}. Есть: ${[...known].map((k) => `--${k}`).join(" ")}`);
  console.error("Палитра, шрифты и разделы задаются направлением в tokens.css и разметке, не флагами.");
  process.exit(2);
}

const slug = opt("name").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
if (!slug) { console.error("--name должен содержать латинскую букву или цифру"); process.exit(2); }
const brand = opt("brand", slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
const mark = opt("mark", brand.trim().charAt(0).toUpperCase());
const url = opt("url", "https://example.com").replace(/\/+$/, "");
try { if (!["http:", "https:"].includes(new URL(url).protocol)) throw Error(); } catch { console.error("--url должен быть HTTP(S) адресом"); process.exit(2); }
const kit = resolve(opt("kit", process.env.CINEMATIC_KIT ?? join(import.meta.dir, "..", "Kit")));
const dir = resolve(opt("dir", join(process.cwd(), slug)));
const localeSpecs = opt("locales", "").split(",").map((s) => s.trim()).filter(Boolean).map((spec) => {
  const [code, hreflang] = spec.split(":");
  return { code: code.toLowerCase(), hreflang: hreflang || code.toLowerCase() };
});
const locales = localeSpecs.map((l) => l.code);
if (new Set(locales).size !== locales.length || localeSpecs.some(({code,hreflang}) => !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(hreflang))) {
  console.error("--locales: нужны уникальные языковые коды, например en,pt:pt-PT"); process.exit(2);
}

const die = (message: string) => {
  console.error(message);
  process.exit(1);
};
const run = (cmd: string[], cwd: string) => {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) die(`${cmd.join(" ")}: ${result.stderr.toString().slice(0, 400)}`);
  return result.stdout.toString();
};

if (!existsSync(join(kit, "src", "site.ts"))) die(`нейтральный набор не найден: ${kit} (флаг --kit или CINEMATIC_KIT)`);
if (existsSync(dir)) die(`папка уже есть: ${dir} (выбери другое --name/--dir)`);

/* 1. комплектный каркас или main внешнего git-набора */
if (existsSync(join(kit, ".git"))) {
  const archive = Bun.spawnSync(["git", "archive", "--format=tar", "main"], { cwd: kit, stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode !== 0) die(`git archive main: ${archive.stderr.toString().slice(0, 300)}`);
  mkdirSync(dir, { recursive: true });
  const untar = Bun.spawnSync(["tar", "-x", "-C", dir], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" });
  if (untar.exitCode !== 0) die(`tar: ${untar.stderr.toString().slice(0, 300)}`);
} else {
  cpSync(kit, dir, { recursive: true, filter: (source) => !["node_modules", "dist", ".astro", ".git"].includes(basename(source)) });
}

/* 2. бренд, адрес, языки — src/site.ts */
const sitePath = join(dir, "src", "site.ts");
let site = readFileSync(sitePath, "utf8")
  .replace(/brand: \{ name: "[^"]*", mark: "[^"]*",/, () => `brand: { name: ${JSON.stringify(brand)}, mark: ${JSON.stringify(mark)},`)
  .replace(/url: "[^"]*",/, () => `url: ${JSON.stringify(url)},`)
  .replace(/introKey: "[^"]*",/, () => `introKey: ${JSON.stringify(`${slug}-intro`)},`)
  .replace(/seo: \{ title: "Your Brand",/, () => `seo: { title: ${JSON.stringify(brand)},`);
if (locales.length) {
  const extra = locales.filter((code) => code !== "en");
  const copies = extra.map((code) => `\n// TODO(${code}): перевести — пока копия английских текстов.\nconst ${code.replace(/-/g, "_")}: Copy = structuredClone(en);\n`).join("");
  site = site.replace(/\nexport const site = \{/, () => `${copies}\nexport const site = {`);
  const entries = localeSpecs.map(({ code, hreflang }) => `{ code: ${JSON.stringify(code)}, hreflang: ${JSON.stringify(hreflang)}, label: ${JSON.stringify(code.toUpperCase())}, copy: ${code === "en" ? "en" : code.replace(/-/g, "_")} }`);
  site = site.replace(/locales: \[[^\]]*\] as Locale\[\],/, () => `locales: [${entries.join(", ")}] as Locale[],`);
}
writeFileSync(sitePath, site);

/* 3. favicon и имя пакета */
const faviconPath = join(dir, "public", "favicon.svg");
const xmlMark = mark.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
if (existsSync(faviconPath)) writeFileSync(faviconPath, readFileSync(faviconPath, "utf8").replace(/>[^<]{1,3}<\/text>/, () => `>${xmlMark}</text>`));
const pkgPath = join(dir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = slug;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

/* 4. зависимости и git */
if (!has("no-install")) run(["bun", "install"], dir);
if (!has("no-git")) {
  run(["git", "init", "-q"], dir);
  run(["git", "add", "-A"], dir);
  const message = `Новый сайт ${brand} из каркаса`;
  const commit = Bun.spawnSync(["git", "commit", "-q", "-m", message], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (commit.exitCode !== 0) run(["git", "-c", "user.name=CinematicSite", "-c", "user.email=site@localhost", "commit", "-q", "-m", message], dir);
}

console.log(`готово: ${dir}`);
console.log(`бренд ${brand} (${mark})${locales.length ? ` · языки ${locales.join(", ")}` : ""}`);
console.log(`дальше: направление → tokens.css, разделы, мир; сборка: cd ${dir} && bun run build && PORT=<свободный порт 43xx, проверь lsof> bun run preview`);
