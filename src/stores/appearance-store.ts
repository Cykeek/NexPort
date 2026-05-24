import { create } from "zustand";
import { toast } from "sonner";
import {
  AVAILABLE_FONTS,
  AVAILABLE_FONT_WEIGHTS,
  AVAILABLE_COLOR_MODES,
  DEFAULT_PREFERENCES,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LOCALSTORAGE_KEY,
} from "@/config/constants";
import type { ColorMode } from "@/config/constants";
import {
  AVAILABLE_THEMES,
  getThemeByName,
  getThemeCounterpart,
} from "@/config/themes";

/* ─── Interfaces ───────────────────────────────────────────────────────── */

interface AppearancePreferences {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  themeName: string;
  uiThemingEnabled: boolean;
  colorMode: ColorMode;
  showPublicIp: boolean;
  showNetworkMeter: boolean;
}

interface ImportResult {
  /** The validated preferences that were applied */
  applied: AppearancePreferences;
  /** Field names that were reset to defaults due to invalid values */
  resetFields: string[];
}

export interface AppearanceState extends AppearancePreferences {
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  setFontWeight: (weight: number) => void;
  setThemeName: (name: string) => void;
  setUIThemingEnabled: (enabled: boolean) => void;
  setColorMode: (mode: ColorMode) => void;
  setShowPublicIp: (enabled: boolean) => void;
  setShowNetworkMeter: (enabled: boolean) => void;
  reset: () => void;
  getPreferences: () => AppearancePreferences;
  importPreferences: (raw: unknown) => ImportResult;
}

/* ─── Validation Functions ─────────────────────────────────────────────── */

function validateFontFamily(value: unknown): string {
  // Accept any non-empty string as a valid font family (supports system fonts)
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return DEFAULT_PREFERENCES.fontFamily;
}

function validateFontSize(value: unknown): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < FONT_SIZE_MIN || num > FONT_SIZE_MAX) {
    return DEFAULT_PREFERENCES.fontSize;
  }
  return num;
}

function validateFontWeight(value: unknown): number {
  const num = Number(value);
  const validWeights = AVAILABLE_FONT_WEIGHTS.map(
    (w) => w.value,
  ) as readonly number[];
  if (!validWeights.includes(num)) {
    return DEFAULT_PREFERENCES.fontWeight;
  }
  return num;
}

function validateThemeName(value: unknown): string {
  if (
    typeof value === "string" &&
    (AVAILABLE_THEMES as readonly string[]).includes(value)
  ) {
    return value;
  }
  return DEFAULT_PREFERENCES.themeName;
}

function validateColorMode(value: unknown): ColorMode {
  if (
    typeof value === "string" &&
    (AVAILABLE_COLOR_MODES as readonly string[]).includes(value)
  ) {
    return value as ColorMode;
  }
  return DEFAULT_PREFERENCES.colorMode;
}

function validatePreferences(raw: unknown): AppearancePreferences {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    fontFamily: validateFontFamily(obj.fontFamily),
    fontSize: validateFontSize(obj.fontSize),
    fontWeight: validateFontWeight(obj.fontWeight),
    themeName: validateThemeName(obj.themeName),
    uiThemingEnabled:
      typeof obj.uiThemingEnabled === "boolean"
        ? obj.uiThemingEnabled
        : DEFAULT_PREFERENCES.uiThemingEnabled,
    colorMode: validateColorMode(obj.colorMode),
    showPublicIp:
      typeof obj.showPublicIp === "boolean"
        ? obj.showPublicIp
        : DEFAULT_PREFERENCES.showPublicIp,
    showNetworkMeter:
      typeof obj.showNetworkMeter === "boolean"
        ? obj.showNetworkMeter
        : DEFAULT_PREFERENCES.showNetworkMeter,
  };
}

/* ─── Utility Functions ────────────────────────────────────────────────── */

/**
 * Clamps a numeric value to [FONT_SIZE_MIN, FONT_SIZE_MAX] and rounds to the nearest integer.
 * Unlike validateFontSize (which returns the default on invalid input),
 * clampFontSize always produces a valid clamped integer.
 */
function clampFontSize(value: number): number {
  const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
  return Math.round(clamped);
}

/* ─── localStorage Helpers ─────────────────────────────────────────────── */

function loadFromLocalStorage(): AppearancePreferences {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    const prefs = validatePreferences(parsed);

    // Reconcile theme with color mode on load.
    // If the stored theme variant doesn't match the effective color mode, switch it.
    const effectiveMode = resolveEffectiveColorMode(prefs.colorMode);
    const theme = getThemeByName(prefs.themeName);
    if (theme.variant !== effectiveMode) {
      const counterpart = getThemeCounterpart(prefs.themeName);
      prefs.themeName =
        counterpart ??
        (effectiveMode === "light" ? "default-light" : "default-dark");
    }

    return prefs;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Resolves the effective color mode synchronously (for use outside React).
 * "system" is resolved using window.matchMedia.
 */
function resolveEffectiveColorMode(colorMode: ColorMode): "light" | "dark" {
  if (colorMode === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
    return "dark";
  }
  return colorMode;
}

function persistToLocalStorage(prefs: AppearancePreferences): void {
  try {
    const json = JSON.stringify(prefs);
    localStorage.setItem(LOCALSTORAGE_KEY, json);
    // Broadcast to all other Tauri windows (terminal windows)
    import("@tauri-apps/api/event")
      .then(({ emit }) => {
        emit("appearance-changed", json);
      })
      .catch(() => {});
  } catch {
    toast.error("Preferences could not be saved");
  }
}

/* ─── Store ────────────────────────────────────────────────────────────── */

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...loadFromLocalStorage(),

  setFontFamily: (family: string) => {
    if (!family || family.trim().length === 0) return;
    set({ fontFamily: family });
    persistToLocalStorage(get().getPreferences());
  },

  setFontSize: (size: number) => {
    const clamped = clampFontSize(size);
    set({ fontSize: clamped });
    persistToLocalStorage(get().getPreferences());
  },

  setFontWeight: (weight: number) => {
    const validWeights = AVAILABLE_FONT_WEIGHTS.map(
      (w) => w.value,
    ) as readonly number[];
    if (!validWeights.includes(weight)) return;
    set({ fontWeight: weight });
    persistToLocalStorage(get().getPreferences());
  },

  setThemeName: (name: string) => {
    if (!(AVAILABLE_THEMES as readonly string[]).includes(name)) return;
    set({ themeName: name });
    persistToLocalStorage(get().getPreferences());
  },

  setUIThemingEnabled: (enabled: boolean) => {
    set({ uiThemingEnabled: enabled });
    persistToLocalStorage(get().getPreferences());
  },

  setColorMode: (mode: ColorMode) => {
    if (!(AVAILABLE_COLOR_MODES as readonly string[]).includes(mode)) return;
    set({ colorMode: mode });

    // Immediately reconcile theme with the new color mode
    const effectiveMode = resolveEffectiveColorMode(mode);
    const currentTheme = getThemeByName(get().themeName);
    if (currentTheme.variant !== effectiveMode) {
      const counterpart = getThemeCounterpart(get().themeName);
      const newTheme =
        counterpart ??
        (effectiveMode === "light" ? "default-light" : "default-dark");
      set({ themeName: newTheme });
    }

    persistToLocalStorage(get().getPreferences());
  },

  setShowPublicIp: (enabled: boolean) => {
    set({ showPublicIp: enabled });
    persistToLocalStorage(get().getPreferences());
  },

  setShowNetworkMeter: (enabled: boolean) => {
    set({ showNetworkMeter: enabled });
    persistToLocalStorage(get().getPreferences());
  },

  reset: () => {
    set({ ...DEFAULT_PREFERENCES });
    try {
      localStorage.removeItem(LOCALSTORAGE_KEY);
    } catch {
      toast.error("Preferences could not be saved");
    }
  },

  getPreferences: (): AppearancePreferences => {
    const {
      fontFamily,
      fontSize,
      fontWeight,
      themeName,
      uiThemingEnabled,
      colorMode,
      showPublicIp,
      showNetworkMeter,
    } = get();
    return {
      fontFamily,
      fontSize,
      fontWeight,
      themeName,
      uiThemingEnabled,
      colorMode,
      showPublicIp,
      showNetworkMeter,
    };
  },

  importPreferences: (raw: unknown): ImportResult => {
    const validated = validatePreferences(raw);
    const resetFields: string[] = [];

    // Determine which fields were reset to defaults
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (
        obj.fontFamily !== undefined &&
        obj.fontFamily !== validated.fontFamily
      ) {
        resetFields.push("fontFamily");
      }
      if (
        obj.fontSize !== undefined &&
        Number(obj.fontSize) !== validated.fontSize
      ) {
        resetFields.push("fontSize");
      }
      if (
        obj.fontWeight !== undefined &&
        Number(obj.fontWeight) !== validated.fontWeight
      ) {
        resetFields.push("fontWeight");
      }
      if (
        obj.themeName !== undefined &&
        obj.themeName !== validated.themeName
      ) {
        resetFields.push("themeName");
      }
      if (
        obj.uiThemingEnabled !== undefined &&
        obj.uiThemingEnabled !== validated.uiThemingEnabled
      ) {
        resetFields.push("uiThemingEnabled");
      }
      if (
        obj.colorMode !== undefined &&
        obj.colorMode !== validated.colorMode
      ) {
        resetFields.push("colorMode");
      }
      if (
        obj.showPublicIp !== undefined &&
        obj.showPublicIp !== validated.showPublicIp
      ) {
        resetFields.push("showPublicIp");
      }
      if (
        obj.showNetworkMeter !== undefined &&
        obj.showNetworkMeter !== validated.showNetworkMeter
      ) {
        resetFields.push("showNetworkMeter");
      }
    }

    // Apply all validated preferences at once
    set({ ...validated });

    // Persist to localStorage
    persistToLocalStorage(validated);

    return { applied: validated, resetFields };
  },
}));
