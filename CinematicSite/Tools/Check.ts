#!/usr/bin/env bun
/**
 * Check.ts — проверка кинематографичного сайта в безоконном Chrome: компьютер и телефон,
 * снимок на каждой остановке 3D-мира (data-cam) или на каждом разделе (main > section, [data-shot]).
 *
 *   bun Check.ts --url http://127.0.0.1:<порт>/ [--expect-title "<часть заголовка>"] [--out ./.check]
 *                [--force-world | --allow-no-world] [--desktop-only | --mobile-only]
 *                [--reduced-motion] [--block-js] [--no-js] [--every N] [--max-initial-mb 6] [--port 9445]
 *
 * --url обязателен: занятый порт часто держит чужое превью, и проверка тихо проверила бы не тот сайт.
 * Заголовок страницы печатается всегда; --expect-title останавливает проверку, если он не тот.
 *
 * Проверяет: ошибки консоли и исключения; прокрутку вбок; на телефоне — заголовок первого
 * экрана не заезжает на 3D-экран (h1 ниже --hero-media-bottom); после загрузки есть ui-ready
 * (или ui-failed в --block-js, если у сайта есть внешние скрипты _astro); мир поднялся (has-world),
 * если не --allow-no-world / --reduced-motion / --no-js; в --no-js и --block-js первый заголовок h1
 * видим; вес первой загрузки не больше --max-initial-mb (по умолчанию 6 МБ, без сжатия превью-сервера);
 * соседние снимки различаются. Выход 1 при любой проблеме.
 *
 * Свой Chrome: если на --port никто не слушает, запускается безоконный Chrome с отдельным
 * профилем во временной папке. Регулятор кадров мира в безоконном Chrome даёт 7–10 к/с
 * и выключает мир — для съёмки мира используйте --force-world (добавляет ?world=force).
 * Это дополнительная диагностика: финальные кадры и движение проверяются в настоящем браузере.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { safeShotPath } from "./CheckPaths";

const args = process.argv.slice(2);
const has = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (has("help")) {
  console.log((await Bun.file(import.meta.path).text()).split("*/")[0]);
  process.exit(0);
}

const baseUrl = opt("url", "");
if (!baseUrl) {
  console.error("нужен --url адреса превью именно этого сайта (порт смотри в карточке проекта или lsof)");
  process.exit(2);
}
const expectTitle = opt("expect-title", "");
const maxInitialMb = Number(opt("max-initial-mb", "6"));
const outDir = resolve(opt("out", ".check"));
const port = Number(opt("port", "9445"));
const every = Math.max(1, Number(opt("every", "1")));
const forceWorld = has("force-world");
const reduced = has("reduced-motion");
const blockJs = has("block-js");
const noJs = has("no-js");
const expectWorld = !has("allow-no-world") && !reduced && !noJs && !blockJs;
mkdirSync(outDir, { recursive: true });

const pageUrl = (() => {
  const u = new URL(baseUrl);
  if (forceWorld) u.searchParams.set("world", "force");
  return u.toString();
})();

/* ---------- Chrome ---------- */
const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cdpUp = async () => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
  } catch {
    return false;
  }
};
let launched: ReturnType<typeof Bun.spawn> | null = null;
let profileDir: string | null = null;
try {
if (!(await cdpUp())) {
  profileDir = mkdtempSync(join(tmpdir(), "cinematic-check-chrome-"));
  launched = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 40 && !(await cdpUp()); i += 1) await Bun.sleep(250);
  if (!(await cdpUp())) {
    throw new Error(`Chrome не поднялся на порту ${port} (CHROME_BIN=${CHROME})`);
  }
}

type Viewport = { name: "desktop" | "mobile"; width: number; height: number; dpr: number; mobile: boolean };
const viewports: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, dpr: 1, mobile: false },
  { name: "mobile", width: 402, height: 874, dpr: 2, mobile: true },
].filter((vp) => (has("desktop-only") ? vp.name === "desktop" : has("mobile-only") ? vp.name === "mobile" : true)) as Viewport[];

const problems: string[] = [];
const notes: string[] = [];
const report: Record<string, unknown> = { url: pageUrl, mode: { forceWorld, reduced, blockJs, noJs }, viewports: {} };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function session() {
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const logs: string[] = [];
  let crashed = false;
  const net = { bytes: 0, blockedScripts: 0, counting: true };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === "Inspector.targetCrashed") crashed = true;
    if (m.method === "Network.loadingFinished" && net.counting) net.bytes += m.params.encodedDataLength ?? 0;
    if (m.method === "Network.loadingFailed" && (m.params.blockedReason || /BLOCKED/.test(m.params.errorText ?? ""))) net.blockedScripts += 1;
    if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 240));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("console.error: " + m.params.args.map((a: any) => a.value ?? a.description).join(" ").slice(0, 240));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/net::ERR_BLOCKED_BY_CLIENT/.test(m.params.entry.text)) logs.push("log: " + m.params.entry.text.slice(0, 240));
  };
  // У каждой команды свой срок: упавшая или зависшая вкладка не должна вешать всю проверку.
  const send = (method: string, params: any = {}, timeoutMs = 20000) => new Promise<any>((r) => {
    id += 1;
    const callId = id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      r({ timeout: true });
    }, timeoutMs);
    pending.set(callId, (value) => {
      clearTimeout(timer);
      r(value);
    });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  const evaluate = async (expression: string) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, 8000);
    return r.result?.result?.value;
  };
  const close = async () => {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${page.id}`).catch(() => {});
  };
  return { send, evaluate, logs, close, crashed: () => crashed, net };
}

for (const vp of viewports) {
  const s = await session();
  await s.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
  if (vp.mobile) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await s.send("Runtime.enable");
  await s.send("Inspector.enable");
  await s.send("Log.enable");
  await s.send("Network.enable");
  // вес первой загрузки — честный только без кэша: второй размер экрана иначе берёт файлы из кэша первого
  await s.send("Network.setCacheDisabled", { cacheDisabled: true });
  await s.send("Page.enable");
  await s.send("Page.bringToFront");
  if (reduced) await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (blockJs) await s.send("Network.setBlockedURLs", { urls: ["*/_astro/*.js"] });
  if (noJs) await s.send("Emulation.setScriptExecutionDisabled", { value: true });
  await s.send("Page.navigate", { url: pageUrl });

  // ждём, пока страница встанет: ui-ready/ui-failed (или 6 с без скриптов)
  let state = "";
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    if (s.crashed()) break;
    state = noJs ? "no-js" : String(await s.evaluate("document.documentElement.className"));
    if (noJs ? i >= 24 : /ui-ready|ui-failed/.test(state) && (blockJs || i >= 16)) break;
  }
  if (noJs) await s.send("Emulation.setScriptExecutionDisabled", { value: false });
  await sleep(blockJs ? 5000 : 2200);
  s.net.counting = false;
  const initialMb = s.net.bytes / 1024 / 1024;

  const facts = await s.evaluate(`(() => {
    const root = document.documentElement;
    const h1 = document.querySelector("h1");
    const r = h1 ? h1.getBoundingClientRect() : null;
    const mediaBottom = parseFloat(getComputedStyle(root).getPropertyValue("--hero-media-bottom")) || null;
    const sections = [...document.querySelectorAll("main > section, [data-shot]")].filter((el, i, all) => all.indexOf(el) === i);
    return {
      title: document.title,
      classes: root.className,
      h1: h1 ? h1.textContent.trim().slice(0, 80) : null,
      h1Top: r ? Math.round(r.top + scrollY) : null,
      h1Opacity: h1 ? Number(getComputedStyle(h1).opacity) : null,
      mediaBottom,
      scrollWidth: root.scrollWidth,
      innerWidth: innerWidth,
      anchors: [...document.querySelectorAll("[data-cam]")].map((el) => {
        const rect = el.getBoundingClientRect();
        const frac = Number(el.dataset.camAt ?? "0.5");
        return { cam: el.dataset.cam, y: Math.max(0, Math.round(rect.top + scrollY + rect.height * frac - innerHeight * 0.5)) };
      }),
      sections: sections.map((el, i) => {
        const rect = el.getBoundingClientRect();
        return { cam: el.id || el.dataset.shot || "section-" + i, y: Math.max(0, Math.round(rect.top + scrollY - 80)) };
      }),
    };
  })()`);

  const where = vp.name;
  if (!facts) {
    problems.push(`${where}: страница не ответила`);
    await s.close();
    continue;
  }
  if (expectTitle && !String(facts.title ?? "").includes(expectTitle)) {
    problems.push(`${where}: на адресе другой сайт — заголовок «${facts.title}», ждали «${expectTitle}»`);
    await s.close();
    continue;
  }
  if (!noJs && !/ui-ready|ui-failed/.test(facts.classes)) problems.push(`${where}: нет ui-ready/ui-failed (${facts.classes})`);
  const blockApplies = blockJs && s.net.blockedScripts > 0;
  if (blockJs && !blockApplies) notes.push(`${where}: внешних скриптов _astro не было — проверка блокировки не применима (скрипты встроены в HTML)`);
  if (blockApplies && !/ui-failed/.test(facts.classes)) problems.push(`${where}: скрипты заблокированы, а страховка ui-failed не сработала (${facts.classes})`);
  if (!blockJs && !noJs && initialMb > maxInitialMb) problems.push(`${where}: первая загрузка ${initialMb.toFixed(1)} МБ > ${maxInitialMb} МБ`);
  if (!blockJs && !noJs && /ui-failed/.test(facts.classes)) problems.push(`${where}: ui-failed — интерфейс не поднялся`);
  if (expectWorld && !/has-world/.test(facts.classes)) problems.push(`${where}: мир не поднялся (нет has-world${forceWorld ? "" : "; в безоконном Chrome нужен --force-world"})`);
  if ((noJs || blockApplies) && (facts.h1Opacity ?? 0) < 0.5) problems.push(`${where}: без скриптов заголовок невидим (opacity ${facts.h1Opacity})`);
  if (facts.scrollWidth > facts.innerWidth + 1) problems.push(`${where}: прокрутка вбок (${facts.scrollWidth} > ${facts.innerWidth})`);
  if (vp.mobile && facts.mediaBottom && facts.h1Top !== null && facts.h1Top < facts.mediaBottom - 2) problems.push(`${where}: заголовок первого экрана заезжает на 3D-экран (h1 ${facts.h1Top}px < экран ${facts.mediaBottom}px)`);

  // снимки по остановкам мира
  const shots: { cam: string; file: string; hash: string }[] = [];
  const points = facts.anchors.length ? facts.anchors : facts.sections;
  const stops = points.filter((_: unknown, i: number) => i % every === 0 || i === points.length - 1);
  if (!stops.length) stops.push({ cam: "top", y: 0 });
  for (const [index, stop] of stops.entries()) {
    await s.evaluate(`window.scrollTo(0, ${stop.y})`);
    await sleep(index === 0 ? 900 : 1300);
    const shot = await s.send("Page.captureScreenshot", { format: "jpeg", quality: 78 });
    if (!shot?.result?.data || s.crashed()) {
      problems.push(`${where}: вкладка ${s.crashed() ? "упала" : "перестала отвечать"} на остановке ${index} (${stop.cam})`);
      break;
    }
    const data = Buffer.from(shot.result.data, "base64");
    const file = safeShotPath(outDir, where, index, stop.cam);
    writeFileSync(file, data);
    shots.push({ cam: stop.cam, file, hash: createHash("sha1").update(data).digest("hex") });
  }
  const repeats = shots.filter((shot, i) => i > 0 && shot.hash === shots[i - 1].hash).length;
  if (shots.length > 2 && repeats > shots.length / 2) problems.push(`${where}: соседние снимки одинаковые (${repeats} из ${shots.length}) — камера или прокрутка стоят`);

  const consoleProblems = s.logs.filter((line) => !(blockJs && /ERR_BLOCKED_BY_CLIENT|Failed to fetch dynamically imported module|blocked/i.test(line)));
  if (consoleProblems.length) problems.push(`${where}: консоль — ${consoleProblems.slice(0, 3).join(" | ")}`);
  (report.viewports as Record<string, unknown>)[where] = { ...facts, anchors: facts.anchors.map((a: { cam: string }) => a.cam), sections: facts.sections.length, initialMb: Number(initialMb.toFixed(2)), shots: shots.map((x) => x.file), console: consoleProblems };
  await s.close();
}

report.problems = problems;
report.notes = notes;
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
for (const [name, value] of Object.entries(report.viewports as Record<string, any>)) {
  console.log(`${name}: «${value.title}» · ${value.classes} · остановок ${value.anchors.length} · разделов ${value.sections} · снимков ${value.shots.length} · ширина ${value.scrollWidth}/${value.innerWidth} · первая загрузка ${value.initialMb} МБ${value.mediaBottom ? ` · h1 ${value.h1Top}px / экран ${value.mediaBottom}px` : ""}`);
}
for (const note of notes) console.log("заметка: " + note);
console.log(`снимки и report.json: ${outDir}`);
if (problems.length) {
  console.error("ПРОБЛЕМЫ:\n- " + problems.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("замечаний нет");
}
} finally {
  if (launched) { launched.kill(); await launched.exited; }
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
