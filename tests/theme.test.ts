import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { themeInitScript } from "../src/lib/theme";

function bootTheme({
  saved = null,
  dark = false,
  storageBlocked = false,
}: {
  saved?: string | null;
  dark?: boolean;
  storageBlocked?: boolean;
} = {}) {
  const classes = new Set(["font-inter", "antialiased"]);
  const style = { colorScheme: "" };
  const listeners = new Map<string, (event?: { key: string | null }) => void>();
  let preference = saved;
  const media = {
    matches: dark,
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, callback),
  };
  runInNewContext(themeInitScript, {
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, enabled: boolean) =>
            enabled ? classes.add(name) : classes.delete(name),
        },
        style,
      },
    },
    window: {
      matchMedia: () => media,
      localStorage: {
        getItem: () => {
          if (storageBlocked) throw new Error("Storage denied");
          return preference;
        },
      },
      addEventListener: (
        name: string,
        callback: (event?: { key: string | null }) => void,
      ) => listeners.set(name, callback),
    },
  });
  return {
    classes,
    style,
    changeSystem(next: boolean) {
      media.matches = next;
      listeners.get("change")?.();
    },
    changeStorage(next: string | null) {
      preference = next;
      listeners.get("storage")?.({ key: next === null ? null : "theme" });
    },
  };
}

describe("theme before application startup", () => {
  for (const dark of [false, true]) {
    test(`uses the ${dark ? "dark" : "light"} system theme immediately`, () => {
      const { classes, style } = bootTheme({ dark });
      expect(classes.has(dark ? "dark" : "light")).toBe(true);
      expect(classes.has(dark ? "light" : "dark")).toBe(false);
      expect(classes.has("font-inter")).toBe(true);
      expect(style.colorScheme).toBe(dark ? "dark" : "light");
    });
  }

  for (const saved of ["light", "dark"]) {
    test(`a saved ${saved} preference overrides the OS`, () => {
      const theme = bootTheme({ saved, dark: saved !== "dark" });
      expect(theme.style.colorScheme).toBe(saved);
      theme.changeSystem(saved === "dark");
      expect(theme.style.colorScheme).toBe(saved);
    });
  }

  test("blocked storage still initializes dark mode synchronously", () => {
    expect(
      bootTheme({ dark: true, storageBlocked: true }).style.colorScheme,
    ).toBe("dark");
  });

  test("unknown stored values follow the system", () => {
    expect(
      bootTheme({ saved: "old-theme", dark: true }).style.colorScheme,
    ).toBe("dark");
  });

  test("follows OS changes without keeping both theme classes", () => {
    const theme = bootTheme();
    theme.changeSystem(true);
    expect(theme.style.colorScheme).toBe("dark");
    expect(theme.classes.has("light")).toBe(false);
    theme.changeSystem(false);
    expect(theme.classes.has("dark")).toBe(false);
  });

  test("synchronizes saved preferences across tabs, including clearing storage", () => {
    const theme = bootTheme({ dark: true });
    theme.changeStorage("light");
    expect(theme.style.colorScheme).toBe("light");
    theme.changeStorage(null);
    expect(theme.style.colorScheme).toBe("dark");
  });
});
