"use client";

import { useEffect, useState } from "react";
import { useAppearanceStore } from "@/stores/appearance-store";
import { getThemeByName } from "@/config/themes";

export function TerminalPreview() {
  const fontFamily = useAppearanceStore((s) => s.fontFamily);
  const fontSize = useAppearanceStore((s) => s.fontSize);
  const fontWeight = useAppearanceStore((s) => s.fontWeight);
  const themeName = useAppearanceStore((s) => s.themeName);

  const theme = getThemeByName(themeName);

  const [actualFont, setActualFont] = useState<string | null>(null);

  useEffect(() => {
    // Detect if the selected font is available on the system
    if (typeof document === "undefined" || !document.fonts) {
      setActualFont(null);
      return;
    }

    const checkFont = () => {
      const isAvailable = document.fonts.check(`${fontSize}px "${fontFamily}"`);
      if (!isAvailable) {
        // Try fallback fonts to determine which one is actually rendering
        const fallbacks = ["Fira Code", "Consolas", "Courier New", "monospace"];
        let rendered = "monospace";
        for (const fallback of fallbacks) {
          if (document.fonts.check(`${fontSize}px "${fallback}"`)) {
            rendered = fallback;
            break;
          }
        }
        setActualFont(rendered);
      } else {
        setActualFont(null);
      }
    };

    // Check after fonts are loaded
    document.fonts.ready.then(checkFont);
  }, [fontFamily, fontSize]);

  return (
    <div
      className="terminal-preview"
      style={{
        background: theme.colors.background,
        color: theme.colors.foreground,
        fontFamily: `"${fontFamily}", "Consolas", "Courier New", monospace`,
        fontSize: `${fontSize}px`,
        fontWeight: fontWeight,
        borderColor: theme.ui.border,
      }}
    >
      {/* Prompt line */}
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.green }}>user@nexport</span>
        <span style={{ color: theme.colors.foreground }}>:</span>
        <span style={{ color: theme.colors.blue }}>~</span>
        <span style={{ color: theme.colors.foreground }}>$ </span>
        <span style={{ color: theme.colors.foreground }}>ls -la</span>
      </div>

      {/* Output lines with distinct ANSI colors */}
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.blue }}>drwxr-xr-x</span>
        <span style={{ color: theme.colors.foreground }}> 4 user user 4096 </span>
        <span style={{ color: theme.colors.blue }}>documents/</span>
      </div>
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.cyan }}>lrwxrwxrwx</span>
        <span style={{ color: theme.colors.foreground }}> 1 user user   24 </span>
        <span style={{ color: theme.colors.magenta }}>.config</span>
        <span style={{ color: theme.colors.foreground }}> → </span>
        <span style={{ color: theme.colors.cyan }}>/etc/config</span>
      </div>
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.green }}>-rwxr-xr-x</span>
        <span style={{ color: theme.colors.foreground }}> 1 user user 8192 </span>
        <span style={{ color: theme.colors.green }}>deploy.sh</span>
      </div>
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.yellow }}>-rw-r--r--</span>
        <span style={{ color: theme.colors.foreground }}> 1 user user  512 </span>
        <span style={{ color: theme.colors.yellow }}>TODO.md</span>
      </div>
      <div className="terminal-preview-line">
        <span style={{ color: theme.colors.red }}>-rw-------</span>
        <span style={{ color: theme.colors.foreground }}> 1 user user    0 </span>
        <span style={{ color: theme.colors.red }}>.env.local</span>
      </div>

      {/* Font fallback notice */}
      {actualFont && (
        <div
          className="terminal-preview-line"
          style={{
            color: theme.colors.yellow,
            fontSize: `${Math.max(fontSize - 2, 8)}px`,
            marginTop: "8px",
            opacity: 0.8,
          }}
        >
          ⚠ Font &quot;{fontFamily}&quot; not available — rendering with &quot;{actualFont}&quot;
        </div>
      )}
    </div>
  );
}
