"use client";

import { useAppearanceStore } from "@/stores/appearance-store";

export function NetworkIpToggle() {
  const showPublicIp = useAppearanceStore((s) => s.showPublicIp);
  const setShowPublicIp = useAppearanceStore((s) => s.setShowPublicIp);

  return (
    <div className="settings-row network-ip-toggle">
      <div className="settings-row-left">
        <div className="settings-row-text">
          <span className="settings-row-label">Public IP</span>
          <span className="settings-row-desc">
            Display your public IP address next to the network meters
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
