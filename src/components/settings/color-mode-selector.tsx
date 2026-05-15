"use client";

import { useAppearanceStore } from "@/stores/appearance-store";
import { AVAILABLE_COLOR_MODES } from "@/config/constants";
import type { ColorMode } from "@/config/constants";
import { Monitor, Moon, Sun } from "lucide-react";

const COLOR_MODE_OPTIONS: { value: ColorMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={14} /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} /> },
  { value: "system", label: "System", icon: <Monitor size={14} /> },
];

export function ColorModeSelector() {
  const colorMode = useAppearanceStore((s) => s.colorMode);
  const setColorMode = useAppearanceStore((s) => s.setColorMode);

  return (
    <div className="settings-row color-mode-selector">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Color Mode</span>
          <span className="settings-row-desc">
            Switch between light and dark appearance
          </span>
        </div>
      </div>
      <div className="color-mode-toggle">
        {COLOR_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`color-mode-btn ${colorMode === option.value ? "color-mode-btn--active" : ""}`}
            onClick={() => setColorMode(option.value)}
            aria-pressed={colorMode === option.value}
            title={option.label}
          >
            {option.icon}
            <span className="color-mode-btn-label">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
