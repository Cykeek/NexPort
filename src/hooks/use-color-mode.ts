"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAppearanceStore } from "@/stores/appearance-store";
import { getThemeByName, getThemeCounterpart } from "@/config/themes";

/**
 * Resolves the system color scheme preference synchronously.
 * Uses useSyncExternalStore to avoid hydration mismatches and ensure
 * the correct value is available on the very first render.
 */
function useSystemColorScheme(): "light" | "dark" {
  return useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
    () => "dark" // SSR fallback
  );
}

/**
 * Returns the effective color mode ("light" or "dark"), resolving "system" to the actual OS preference.
 */
export function useEffectiveColorMode(): "light" | "dark" {
  const colorMode = useAppearanceStore((s) => s.colorMode);
  const systemMode = useSystemColorScheme();
  return colorMode === "system" ? systemMode : colorMode;
}

/**
 * Syncs the color mode preference to the <html> element class and ensures
 * the terminal theme matches the effective color mode.
 *
 * This hook handles:
 * 1. Applying/removing the "light" class on <html>
 * 2. Auto-switching the terminal theme when the effective mode changes
 *    (covers the "system" mode case where the OS preference changes at runtime)
 */
export function useColorMode() {
  const effectiveMode = useEffectiveColorMode();

  // Apply the class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveMode === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
  }, [effectiveMode]);

  // Auto-switch theme when effective color mode changes.
  // This handles the case where colorMode is "system" and the OS preference changes,
  // or on initial mount if the stored theme doesn't match.
  useEffect(() => {
    const { themeName, setThemeName } = useAppearanceStore.getState();
    const currentTheme = getThemeByName(themeName);

    if (currentTheme.variant !== effectiveMode) {
      const counterpart = getThemeCounterpart(themeName);
      if (counterpart) {
        setThemeName(counterpart);
      } else {
        setThemeName(effectiveMode === "light" ? "default-light" : "default-dark");
      }
    }
  }, [effectiveMode]);
}
