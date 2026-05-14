"use client";

import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";
import { useAppearanceStore } from "@/stores/appearance-store";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "@/config/constants";

export function FontSizeControl() {
  const fontSize = useAppearanceStore((s) => s.fontSize);
  const setFontSize = useAppearanceStore((s) => s.setFontSize);
  const [inputValue, setInputValue] = useState(String(fontSize));

  // Keep local input in sync when store value changes externally (e.g., import/reset)
  useEffect(() => {
    setInputValue(String(fontSize));
  }, [fontSize]);

  const handleDecrement = () => {
    const next = fontSize - 1;
    if (next >= FONT_SIZE_MIN) {
      setFontSize(next);
      setInputValue(String(next));
    }
  };

  const handleIncrement = () => {
    const next = fontSize + 1;
    if (next <= FONT_SIZE_MAX) {
      setFontSize(next);
      setInputValue(String(next));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed)) {
      // Reset to current store value
      setInputValue(String(fontSize));
      return;
    }
    // Clamp to boundaries
    const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, parsed));
    setFontSize(clamped);
    setInputValue(String(clamped));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Font size</span>
          <span className="settings-row-desc">Terminal text size in pixels (8–32)</span>
        </div>
      </div>
      <div className="font-size-stepper">
        <button
          className="font-size-stepper-btn"
          onClick={handleDecrement}
          disabled={fontSize <= FONT_SIZE_MIN}
          aria-label="Decrease font size"
        >
          <Minus size={14} />
        </button>
        <input
          className="font-size-stepper-input"
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label="Font size"
        />
        <button
          className="font-size-stepper-btn"
          onClick={handleIncrement}
          disabled={fontSize >= FONT_SIZE_MAX}
          aria-label="Increase font size"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
