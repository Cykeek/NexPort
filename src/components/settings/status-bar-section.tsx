"use client";

import { NetworkIpToggle } from "./network-ip-toggle";
import { NetworkMeterToggle } from "./network-meter-toggle";

export function StatusBarSection() {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-title">Status Bar</span>
      </div>

      <NetworkIpToggle />
      <NetworkMeterToggle />
    </div>
  );
}
