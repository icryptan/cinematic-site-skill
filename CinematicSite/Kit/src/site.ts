/**
 * Бренд, адрес и языки сайта. Тексты разделов живут здесь же, в `copy` каждого языка, —
 * их форму задаёт выбранное направление (разделы у каждого сайта свои).
 * Первый язык живёт в корне «/», остальные — в «/<код>/».
 * Форму текстов всех языков сверяет scripts/verify.ts.
 */

export type Copy = {
  seo: { title: string; description: string };
  /** Текст ссылки «перейти к содержанию» для клавиатуры и экранных дикторов. */
  skip: string;
  /** Остальные поля добавляются под разделы выбранного направления. */
  [key: string]: unknown;
};

export type Locale = { code: string; hreflang: string; label: string; copy: Copy };

const en: Copy = {
  seo: { title: "Your Brand", description: "One line about what the brand does and for whom." },
  skip: "Skip to content",
};

export const site = {
  brand: { name: "Your Brand", mark: "Y", email: "hello@example.com" },
  /** Боевой адрес без слеша на конце: canonical, hreflang, sitemap. */
  url: "https://example.com",
  themeColor: "#0a0a0a",
  /** Ключ localStorage для однократной заставки, если направление её использует. */
  introKey: "site-intro",
  locales: [{ code: "en", hreflang: "en", label: "EN", copy: en }] as Locale[],
};

export const defaultLocale = site.locales[0];
export const localePath = (locale: Locale) => (locale.code === defaultLocale.code ? "/" : `/${locale.code}/`);
