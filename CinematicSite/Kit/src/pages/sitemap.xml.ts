import type { APIRoute } from "astro";
import { site, localePath } from "../site";

export const GET: APIRoute = () => {
  const urls = site.locales.map((locale) => `  <url><loc>${site.url}${localePath(locale)}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "content-type": "application/xml" },
  });
};
