import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  build: {
    format: "directory",
  },
  // Превью открывают по имени хоста в локальной сети или через туннель — Vite по умолчанию
  // отклоняет незнакомый Host. Для `astro preview` проверку отключаем; на прод это не влияет.
  vite: {
    preview: {
      allowedHosts: true,
    },
    // Скрипты всегда отдельными файлами в _astro/: проверка запасных путей блокирует их по адресу,
    // а выкат сверяет страницы по этим ресурсам. Встроенный скрипт обе проверки обходит.
    build: {
      assetsInlineLimit: 0,
    },
  },
});
