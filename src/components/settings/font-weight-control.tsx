"use client";

import { AVAILABLE_FONT_WEIGHTS } from "@/config/constants";
import { useAppearanceStore } from "@/stores/appearance-store";
import { Dropdown } from "@/components/ui/dropdown";

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
      <Dropdown
        value={fontWeight}
        items={AVAILABLE_FONT_WEIGHTS.map((w) => ({
          value: w.value,
          label: `${w.value} (${w.label})`,
        }))}
        onChange={(v) => v && setFontWeight(Number(v))}
        compact
        align="right"
      />
    </div>
  );
}
