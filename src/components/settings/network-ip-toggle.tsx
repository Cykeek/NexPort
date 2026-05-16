"use client";

import { useAppearanceStore } from "@/stores/appearance-store";

export function NetworkIpToggle() {
  const showPublicIp = useAppearanceStore((s) => s.showPublicIp);
  const setShowPublicIp = useAppearanceStore((s) => s.setShowPublicIp);

  return (
    <div className="settings-row network-ip-toggle">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Public IP in Status Bar</span>
          <span className="settings-row-desc">
            Show your public IP next to the network meter
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showPublicIp}
        className={`toggle-switch ${showPublicIp ? "toggle-switch--active" : ""}`}
        onClick={() => setShowPublicIp(!showPublicIp)}
      >
        <span className="toggle-switch-knob" />
      </button>
    </div>
  );
}
