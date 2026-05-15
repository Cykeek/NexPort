"use client";

import { getThemesByVariant, type TerminalTheme } from "@/config/themes";
import { useAppearanceStore } from "@/stores/appearance-store";
import { useEffectiveColorMode } from "@/hooks/use-color-mode";

/**
 * Renders a grid of theme cards allowing the user to select a terminal color theme.
 * Each card displays the theme's display name and a color swatch showing the
 * background color and representative ANSI colors.
 * Themes are filtered based on the current effective color mode (light/dark).
 */
export function ThemeSelector() {
  const themeName = useAppearanceStore((s) => s.themeName);
  const setThemeName = useAppearanceStore((s) => s.setThemeName);
  const effectiveMode = useEffectiveColorMode();

  const filteredThemes = getThemesByVariant(effectiveMode);

  return (
    <div className="theme-selector-row">
      <div className="theme-selector-grid">
        {filteredThemes.map((theme) => (
          <button
            key={theme.name}
            className={`theme-card ${theme.name === themeName ? "theme-card--active" : ""}`}
            onClick={() => setThemeName(theme.name)}
            aria-pressed={theme.name === themeName}
            aria-label={`Select ${theme.displayName} theme`}
            type="button"
          >
            <ThemeSwatch theme={theme} />
            <span className="theme-card-label">{theme.displayName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeSwatch({ theme }: { theme: TerminalTheme }) {
  const { background, red, green, blue, yellow, cyan } = theme.colors;

  return (
    <div className="theme-swatch" style={{ backgroundColor: background }}>
      <span className="theme-swatch-dot" style={{ backgroundColor: red }} />
      <span className="theme-swatch-dot" style={{ backgroundColor: green }} />
      <span className="theme-swatch-dot" style={{ backgroundColor: yellow }} />
      <span className="theme-swatch-dot" style={{ backgroundColor: blue }} />
      <span className="theme-swatch-dot" style={{ backgroundColor: cyan }} />
    </div>
  );
}
