"use client";

import { useAppearanceStore } from "@/stores/appearance-store";

export function UIThemeToggle() {
  const uiThemingEnabled = useAppearanceStore((s) => s.uiThemingEnabled);
  const setUIThemingEnabled = useAppearanceStore((s) => s.setUIThemingEnabled);

  return (
    <div className="settings-row ui-theme-toggle">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">UI Theming</span>
          <span className="settings-row-desc">
            Apply terminal theme colors to the application UI
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={uiThemingEnabled}
        className={`toggle-switch ${uiThemingEnabled ? "toggle-switch--active" : ""}`}
        onClick={() => setUIThemingEnabled(!uiThemingEnabled)}
      >
        <span className="toggle-switch-knob" />
      </button>
    </div>
  );
}
