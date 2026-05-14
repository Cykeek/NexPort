/**
 * Centralized configuration constants for the frontend.
 * All tunable values live here — no more grepping through the codebase.
 */

export const TERMINAL_CONFIG = {
  /** Default font size in pixels. */
  fontSize: 14,
  /** Font family stack for the terminal. */
  fontFamily: '"Fira Code", "Consolas", monospace',
  /** Number of lines to keep in the scrollback buffer. */
  scrollback: 10_000,
  /** Milliseconds between SSH read polls. */
  pollIntervalMs: 50,
  /** Milliseconds for each SSH read poll timeout. */
  pollTimeoutMs: 100,
} as const;

export const CONNECTION_CONFIG = {
  /** Milliseconds between host status check cycles. */
  statusCheckIntervalMs: 10_000,
  /** Seconds to wait for a TCP connect before marking host offline. */
  hostTimeoutSecs: 3,
} as const;

/** Default SSH port and terminal type. */
export const SSH_DEFAULTS = {
  port: 22,
  ptyType: "xterm-256color" as const,
} as const;

/** Theme colours used by the terminal. */
export const TERMINAL_THEME = {
  background: "#08080d",
  foreground: "#c4c6d0",
  cursor: "#c4c6d0",
  selectionBackground: "#33467c",
  black: "#1e1e2e",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#cdd6f4",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#ffffff",
} as const;

/* ─── Appearance Customization ─────────────────────────────────────────── */

/** Curated list of monospace font options available in the appearance settings. */
export const AVAILABLE_FONTS = [
  "Fira Code",
  "JetBrains Mono",
  "Cascadia Code",
  "Consolas",
  "Source Code Pro",
  "Courier New",
] as const;

/** Font size boundaries (pixels). */
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;

/** localStorage key used to persist appearance preferences. */
export const LOCALSTORAGE_KEY = "nexport-appearance" as const;

/** Available font weight options for the terminal. */
export const AVAILABLE_FONT_WEIGHTS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "SemiBold" },
  { value: 700, label: "Bold" },
] as const;

/** Default appearance preferences applied when no saved state exists or values are invalid. */
export const DEFAULT_PREFERENCES = {
  fontFamily: "Fira Code",
  fontSize: 14,
  fontWeight: 400,
  themeName: "default-dark",
  uiThemingEnabled: false,
} as const;
