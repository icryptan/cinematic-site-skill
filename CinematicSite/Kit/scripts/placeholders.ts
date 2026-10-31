// @ts-nocheck -- запускается Bun'ом, в сборку Astro не входит.
/**
 * Картинки-заглушки и ролик в цветах бренда, пока нет настоящих материалов.
 * Мягкие цветовые облака (plasma) с виньеткой: страница сразу выглядит собранной,
 * а заменить их — положить файлы с теми же именами в public/media.
 *
 *   bun scripts/placeholders.ts [--accent "#hex"] [--warm "#hex"] [--bg "#hex"]
 *                               [--list "hero.jpg:1600x900,card-1.webp:1200x800"] [--reel] [--force]
 *
 * Без --list: hero.jpg, og.jpg, card-1…6.webp; ролик reel-1280/1920.mp4 — только с --reel (нужен, если направление с роликом).
 * Нужны ImageMagick (`magick`) и ffmpeg. Существующие файлы не перезаписываются без --force.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const force = args.includes("--force");
// Цвета — из выбранного направления. Без флагов — нейтральный серый, чтобы заглушка не несла палитру прошлого сайта.
const accent = flag("accent", "#9a9a9a");
const warm = flag("warm", "#cfcfcf");
const bg = flag("bg", "#141414");
if (!["accent", "warm", "bg"].every((name) => args.includes(`--${name}`))) console.warn("цвета направления не заданы полностью (--accent, --warm, --bg) — заглушки серые");
const out = join(import.meta.dir, "..", "public", "media");
mkdirSync(out, { recursive: true });

const run = (cmd: string[]) => {
  const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${cmd[0]} failed: ${result.stderr.toString().slice(0, 400)}`);
};
for (const tool of ["magick", "ffmpeg"]) {
  if (Bun.spawnSync(["which", tool]).exitCode !== 0) {
    console.error(`Нужен ${tool}: brew install ${tool === "magick" ? "imagemagick" : "ffmpeg"}`);
    process.exit(1);
  }
}

// Серое облако раскрашивается градиентом из цветов бренда: в заглушках нет случайных оттенков.
const ramps = [[bg, accent, warm], [bg, warm, accent], [bg, bg, accent]];
const clut = (ramp: string[]) => ["(", "-size", "1x128", `gradient:${ramp[0]}-${ramp[1]}`, "-size", "1x128", `gradient:${ramp[1]}-${ramp[2]}`, "-append", "-flip", ")", "-clut"];
let seed = 7;
const image = (name: string, w: number, h: number, ramp = ramps[seed % ramps.length]) => {
  const target = join(out, name);
  seed += 1;
  if (existsSync(target) && !force) return;
  run([
    "magick", "-seed", String(seed * 97), "-size", `${w}x${h}`, "plasma:", "-colorspace", "Gray",
    "-blur", `0x${Math.round(Math.min(w, h) / 26)}`, "-auto-level", ...clut(ramp),
    "(", "-size", `${w}x${h}`, "radial-gradient:rgba(0,0,0,0)-rgba(0,0,0,0.82)", ")",
    "-compose", "over", "-composite", "-quality", "82", target,
  ]);
};

// Список файлов — под разделы выбранного направления: --list "имя:ШxВ,…"
const list = flag("list", "hero.jpg:1600x900,og.jpg:1200x630,card-1.webp:1200x800,card-2.webp:1200x800,card-3.webp:1200x800,card-4.webp:1200x800,card-5.webp:1200x800,card-6.webp:1200x800");
for (const item of list.split(",").map((s) => s.trim()).filter(Boolean)) {
  const [name, size] = item.split(":");
  const [w, h] = (size ?? "1200x800").split("x").map(Number);
  if (!name || !w || !h) throw new Error(`не понял «${item}» — нужно имя:ШxВ`);
  image(name, w, h, name.startsWith("hero") || name.startsWith("og") ? ramps[0] : undefined);
}

// Ролик: медленный наезд по большому облаку, 10 секунд, 24 кадра в секунду.
const reels: [string, number, number][] = !args.includes("--reel") ? [] : [["reel-1280.mp4", 1280, 720], ["reel-1920.mp4", 1920, 1080]];
const source = join(tmpdir(), `placeholder-reel-${process.pid}.png`);
if (reels.some(([name]) => force || !existsSync(join(out, name)))) {
  run(["magick", "-seed", "4242", "-size", "3200x1800", "plasma:", "-colorspace", "Gray", "-blur", "0x60", "-auto-level", ...clut(ramps[0]), "(", "-size", "3200x1800", "radial-gradient:rgba(0,0,0,0)-rgba(0,0,0,0.7)", ")", "-compose", "over", "-composite", source]);
  for (const [name, w, h] of reels) {
    const target = join(out, name);
    if (existsSync(target) && !force) continue;
    run([
      "ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-loop", "1", "-i", source,
      "-vf", `zoompan=z='1.0+0.0009*on':x='iw/2-(iw/zoom/2)+on*0.6':y='ih/2-(ih/zoom/2)':d=240:s=${w}x${h}:fps=24,format=yuv420p`,
      "-frames:v", "240", "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", "-an", target,
    ]);
  }
  rmSync(source, { force: true });
}
console.log(`заглушки в ${out}`);
