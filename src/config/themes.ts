/**
 * Terminal and UI theme definitions for NexPort.
 * Each theme provides 20 terminal colors and 5 UI mapping colors.
 */

export interface TerminalTheme {
  name: string;
  displayName: string;
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

/** All available themes indexed by name. */
const THEMES_MAP: Record<string, TerminalTheme> = {
  "default-dark": defaultDark,
  "catppuccin-mocha": catppuccinMocha,
  "dracula": dracula,
  "nord": nord,
  "solarized-dark": solarizedDark,
};

/** Array of available theme name strings. */
export const AVAILABLE_THEMES = [
  "default-dark",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "solarized-dark",
] as const;

/** All theme objects as an array. */
export const themes: TerminalTheme[] = [
  defaultDark,
  catppuccinMocha,
  dracula,
  nord,
  solarizedDark,
];

/**
 * Look up a theme by its name identifier.
 * Returns the Default Dark theme if the name is not recognized.
 */
export function getThemeByName(name: string): TerminalTheme {
  return THEMES_MAP[name] ?? defaultDark;
}
