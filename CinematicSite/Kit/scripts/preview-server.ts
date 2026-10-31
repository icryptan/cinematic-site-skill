// @ts-nocheck -- запускается Bun'ом.
/**
 * Превью собранного dist/: локальная сеть или туннель наружу. Публичная копия сайта, поэтому
 * только GET/HEAD, ничего за пределами dist/, без скрытых файлов и с запретом индексации —
 * превью не должно соперничать с боевым адресом в поиске.
 *
 *   PORT=<свободный порт> bun scripts/preview-server.ts
 *
 * Без PORT берётся случайный свободный порт (он печатается). Для постоянной службы порт задаётся
 * явно и записывается в карточку проекта: занятый порт — это чужое превью, а не твой сайт.
 */
import { join, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..", "dist");
const port = Number(process.env.PORT ?? 0);

const baseHeaders = {
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const notFound = () => new Response("Not found", { status: 404, headers: baseHeaders });

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { ...baseHeaders, allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", { headers: { ...baseHeaders, "content-type": "text/plain" } });
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return notFound();
    }
    if (decoded.includes("\0") || decoded.split("/").some((part) => part.startsWith("."))) return notFound();

    const target = resolve(root, `.${decoded}`);
    if (target !== root && !target.startsWith(root + sep)) return notFound();

    let file = Bun.file(decoded.endsWith("/") ? join(target, "index.html") : target);
    if (!(await file.exists())) {
      const asDir = Bun.file(join(target, "index.html"));
      if (!(await asDir.exists())) return notFound();
      if (!url.pathname.endsWith("/")) return Response.redirect(`${url.pathname}/${url.search}`, 301);
      file = asDir;
    }

    const headers = {
      ...baseHeaders,
      "cache-control": url.pathname.startsWith("/_astro/") ? "public, max-age=31536000, immutable" : "no-cache",
      "accept-ranges": "bytes",
    };
    // Видео в Safari и на iPhone требует ответов на Range-запросы, иначе ролик не играет.
    const range = request.headers.get("range");
    if (range) {
      const size = file.size;
      const [startText, endText] = range.replace("bytes=", "").split("-");
      const start = Number(startText) || 0;
      const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
      }
      return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1), "content-type": file.type },
      });
    }
    return new Response(file, { headers });
  },
});
console.log(`preview on http://0.0.0.0:${server.port}`);
