// This runs directly in <head>, before the body can paint. next/script's
// beforeInteractive queue still waits for the Next.js bootstrap to download.
export const themeInitScript = `
(() => {
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme() {
    let preference;
    try {
      preference = window.localStorage.getItem("theme");
    } catch {}

    const resolved = preference === "light" || preference === "dark"
      ? preference
      : system.matches ? "dark" : "light";

    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
    root.style.colorScheme = resolved;
  }

  applyTheme();
  system.addEventListener("change", applyTheme);
  window.addEventListener("storage", (event) => {
    if (event.key === "theme" || event.key === null) applyTheme();
  });
})();
`;
