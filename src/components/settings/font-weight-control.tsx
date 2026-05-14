"use client";

import { AVAILABLE_FONT_WEIGHTS } from "@/config/constants";
import { useAppearanceStore } from "@/stores/appearance-store";

export function FontWeightControl() {
  const fontWeight = useAppearanceStore((s) => s.fontWeight);
  const setFontWeight = useAppearanceStore((s) => s.setFontWeight);

  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Font weight</span>
          <span className="settings-row-desc">Terminal text weight</span>
        </div>
      </div>
      <select
        className="settings-select"
        value={fontWeight}
        onChange={(e) => setFontWeight(Number(e.target.value))}
      >
        {AVAILABLE_FONT_WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.value} ({w.label})
          </option>
        ))}
      </select>
    </div>
  );
}
