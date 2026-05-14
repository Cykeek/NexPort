"use client";

import { TerminalPreview } from "./terminal-preview";
import { FontFamilySelector } from "./font-family-selector";
import { FontSizeControl } from "./font-size-control";
import { FontWeightControl } from "./font-weight-control";
import { ThemeSelector } from "./theme-selector";
import { UIThemeToggle } from "./ui-theme-toggle";
import { ThemeShareControls } from "./theme-share-controls";

export function AppearanceSection() {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-title">Appearance</span>
      </div>

      <TerminalPreview />
      <FontFamilySelector />
      <FontSizeControl />
      <FontWeightControl />
      <ThemeSelector />
      <UIThemeToggle />
      <ThemeShareControls />
    </div>
  );
}
