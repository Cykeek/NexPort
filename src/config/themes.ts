/**
 * Terminal and UI theme definitions for NexPort.
 * Each theme provides 20 terminal colors and 5 UI mapping colors.
 */

export interface TerminalTheme {
  name: string;
  displayName: string;
  variant: "dark" | "light";
  colors: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
  ui: {
    bg: string;
    bgElevated: string;
    bgSurface: string;
    border: string;
    accent: string;
  };
}

const defaultDark: TerminalTheme = {
  name: "default-dark",
  displayName: "Default Dark",
  variant: "dark",
  colors: {
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
  },
  ui: {
    bg: "#08080d",
    bgElevated: "#12121a",
    bgSurface: "#1a1a24",
    border: "#2a2a3a",
    accent: "#3b82f6",
  },
};

const catppuccinMocha: TerminalTheme = {
  name: "catppuccin-mocha",
  displayName: "Catppuccin Mocha",
  variant: "dark",
  colors: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#45475a",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
  ui: {
    bg: "#1e1e2e",
    bgElevated: "#282839",
    bgSurface: "#313244",
    border: "#45475a",
    accent: "#89b4fa",
  },
};

const dracula: TerminalTheme = {
  name: "dracula",
  displayName: "Dracula",
  variant: "dark",
  colors: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#44475a",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  ui: {
    bg: "#282a36",
    bgElevated: "#323443",
    bgSurface: "#3c3f50",
    border: "#44475a",
    accent: "#bd93f9",
  },
};

const nord: TerminalTheme = {
  name: "nord",
  displayName: "Nord",
  variant: "dark",
  colors: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  ui: {
    bg: "#2e3440",
    bgElevated: "#3b4252",
    bgSurface: "#434c5e",
    border: "#4c566a",
    accent: "#88c0d0",
  },
};

const solarizedDark: TerminalTheme = {
  name: "solarized-dark",
  displayName: "Solarized Dark",
  variant: "dark",
  colors: {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#839496",
    selectionBackground: "#073642",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  ui: {
    bg: "#002b36",
    bgElevated: "#073642",
    bgSurface: "#0a3f4c",
    border: "#586e75",
    accent: "#268bd2",
  },
};

/* ─── Light Themes ──────────────────────────────────────────────────────── */

const defaultLight: TerminalTheme = {
  name: "default-light",
  displayName: "Default Light",
  variant: "light",
  colors: {
    background: "#ffffff",
    foreground: "#1e1e1e",
    cursor: "#1e1e1e",
    selectionBackground: "#add6ff",
    black: "#1e1e1e",
    red: "#cd3131",
    green: "#008000",
    yellow: "#795e26",
    blue: "#0451a5",
    magenta: "#bc05bc",
    cyan: "#0598bc",
    white: "#e5e5e5",
    brightBlack: "#666666",
    brightRed: "#cd3131",
    brightGreen: "#14ce14",
    brightYellow: "#b5ba00",
    brightBlue: "#0451a5",
    brightMagenta: "#bc05bc",
    brightCyan: "#0598bc",
    brightWhite: "#a5a5a5",
  },
  ui: {
    bg: "#ffffff",
    bgElevated: "#f8f9fa",
    bgSurface: "#f1f3f5",
    border: "#e1e4e8",
    accent: "#0366d6",
  },
};

const catppuccinLatte: TerminalTheme = {
  name: "catppuccin-latte",
  displayName: "Catppuccin Latte",
  variant: "light",
  colors: {
    background: "#eff1f5",
    foreground: "#4c4f69",
    cursor: "#dc8a78",
    selectionBackground: "#acb0be",
    black: "#5c5f77",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#ea76cb",
    cyan: "#179299",
    white: "#acb0be",
    brightBlack: "#6c6f85",
    brightRed: "#d20f39",
    brightGreen: "#40a02b",
    brightYellow: "#df8e1d",
    brightBlue: "#1e66f5",
    brightMagenta: "#ea76cb",
    brightCyan: "#179299",
    brightWhite: "#bcc0cc",
  },
  ui: {
    bg: "#eff1f5",
    bgElevated: "#ffffff",
    bgSurface: "#e6e9ef",
    border: "#ccd0da",
    accent: "#1e66f5",
  },
};

const solarizedLight: TerminalTheme = {
  name: "solarized-light",
  displayName: "Solarized Light",
  variant: "light",
  colors: {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#657b83",
    selectionBackground: "#eee8d5",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  ui: {
    bg: "#fdf6e3",
    bgElevated: "#ffffff",
    bgSurface: "#eee8d5",
    border: "#d3cbb7",
    accent: "#268bd2",
  },
};

const nordLight: TerminalTheme = {
  name: "nord-light",
  displayName: "Nord Light",
  variant: "light",
  colors: {
    background: "#eceff4",
    foreground: "#2e3440",
    cursor: "#2e3440",
    selectionBackground: "#d8dee9",
    black: "#2e3440",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#5e81ac",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  ui: {
    bg: "#eceff4",
    bgElevated: "#ffffff",
    bgSurface: "#e5e9f0",
    border: "#d8dee9",
    accent: "#5e81ac",
  },
};

const githubLight: TerminalTheme = {
  name: "github-light",
  displayName: "GitHub Light",
  variant: "light",
  colors: {
    background: "#ffffff",
    foreground: "#24292e",
    cursor: "#24292e",
    selectionBackground: "#c8e1ff",
    black: "#24292e",
    red: "#d73a49",
    green: "#22863a",
    yellow: "#b08800",
    blue: "#0366d6",
    magenta: "#6f42c1",
    cyan: "#1b7c83",
    white: "#e1e4e8",
    brightBlack: "#586069",
    brightRed: "#cb2431",
    brightGreen: "#28a745",
    brightYellow: "#dbab09",
    brightBlue: "#2188ff",
    brightMagenta: "#8a63d2",
    brightCyan: "#3192aa",
    brightWhite: "#fafbfc",
  },
  ui: {
    bg: "#ffffff",
    bgElevated: "#fafbfc",
    bgSurface: "#f6f8fa",
    border: "#e1e4e8",
    accent: "#0366d6",
  },
};

/** All available themes indexed by name. */
const THEMES_MAP: Record<string, TerminalTheme> = {
  "default-dark": defaultDark,
  "catppuccin-mocha": catppuccinMocha,
  "dracula": dracula,
  "nord": nord,
  "solarized-dark": solarizedDark,
  "default-light": defaultLight,
  "catppuccin-latte": catppuccinLatte,
  "solarized-light": solarizedLight,
  "nord-light": nordLight,
  "github-light": githubLight,
};

/** Array of available theme name strings. */
export const AVAILABLE_THEMES = [
  "default-dark",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "solarized-dark",
  "default-light",
  "catppuccin-latte",
  "solarized-light",
  "nord-light",
  "github-light",
] as const;

/** All theme objects as an array. */
export const themes: TerminalTheme[] = [
  defaultDark,
  catppuccinMocha,
  dracula,
  nord,
  solarizedDark,
  defaultLight,
  catppuccinLatte,
  solarizedLight,
  nordLight,
  githubLight,
];

/** Get themes filtered by variant (dark or light). */
export function getThemesByVariant(variant: "dark" | "light"): TerminalTheme[] {
  return themes.filter((t) => t.variant === variant);
}

/**
 * Map from dark theme name to its light counterpart and vice versa.
 * Used for auto-switching when color mode changes.
 */
const THEME_PAIRS: Record<string, string> = {
  "default-dark": "default-light",
  "default-light": "default-dark",
  "catppuccin-mocha": "catppuccin-latte",
  "catppuccin-latte": "catppuccin-mocha",
  "solarized-dark": "solarized-light",
  "solarized-light": "solarized-dark",
  "nord": "nord-light",
  "nord-light": "nord",
  "dracula": "default-light",
  "github-light": "default-dark",
};

/**
 * Get the counterpart theme for the opposite color mode.
 * Returns undefined if no counterpart exists.
 */
export function getThemeCounterpart(themeName: string): string | undefined {
  return THEME_PAIRS[themeName];
}

/**
 * Look up a theme by its name identifier.
 * Returns the Default Dark theme if the name is not recognized.
 */
export function getThemeByName(name: string): TerminalTheme {
  return THEMES_MAP[name] ?? defaultDark;
}
