"use client";

import { useAppearanceStore } from "@/stores/appearance-store";

export function NetworkMeterToggle() {
  const showNetworkMeter = useAppearanceStore((s) => s.showNetworkMeter);
  const setShowNetworkMeter = useAppearanceStore((s) => s.setShowNetworkMeter);

  return (
    <div className="settings-row network-meter-toggle">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Network Speed Meter</span>
          <span className="settings-row-desc">
            Show real-time download/upload speeds in the status bar
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showNetworkMeter}
        className={`toggle-switch ${showNetworkMeter ? "toggle-switch--active" : ""}`}
        onClick={() => setShowNetworkMeter(!showNetworkMeter)}
      >
        <span className="toggle-switch-knob" />
      </button>
    </div>
  );
}
