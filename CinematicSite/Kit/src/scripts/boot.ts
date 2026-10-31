/**
 * Минимальный загрузчик страницы: раскрытие заголовков по словам и элементов при прокрутке,
 * затем ui-ready. Каждый шаг изолирован: сбой одного не оставляет страницу невидимой.
 * Мир, заставка, курсор и сцены прокрутки подключаются под направление (см. каталог приёмов скилла).
 */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;

function splitWords() {
  document.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    el.setAttribute("aria-label", text);
    el.textContent = "";
    text.split(/\s+/).forEach((word, index, all) => {
      const outer = document.createElement("span");
      outer.className = "w";
      outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.textContent = word;
      inner.style.setProperty("--wi", String(index));
      outer.append(inner);
      el.append(outer);
      if (index < all.length - 1) el.append(" ");
    });
  });
}

function setupReveal() {
  const targets = document.querySelectorAll("[data-reveal], [data-split]");
  if (reducedMotion.matches) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );
  targets.forEach((el) => observer.observe(el));
}

export function boot(extra: Record<string, () => void> = {}) {
  const safely = (name: string, step: () => void) => {
    try {
      step();
      return true;
    } catch (error) {
      console.warn("ui step failed:", name, error);
      return false;
    }
  };
  safely("split", splitWords);
  const revealed = safely("reveal", setupReveal);
  for (const [name, step] of Object.entries(extra)) safely(name, step);
  root.classList.add(revealed ? "ui-ready" : "ui-failed");
}
