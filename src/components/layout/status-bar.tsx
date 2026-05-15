"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function StatusBar() {
  const { online, ip, download, upload, mounted } = useNetworkStatus();

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-version">v0.3.2-beta</span>
      </div>
      <div className="statusbar-right">
        {mounted && (
          <div className={`statusbar-network ${online ? "connected" : "disconnected"}`}>
            {online ? (
              <>
                <span className="statusbar-dot connected" />
                {ip && <span className="statusbar-ip">{ip}</span>}
                <span className="statusbar-divider" />
                <span className="statusbar-meter">
                  <ArrowDown size={10} className="statusbar-meter-icon" />
                  <span>{download}</span>
                </span>
                <span className="statusbar-meter">
                  <ArrowUp size={10} className="statusbar-meter-icon" />
                  <span>{upload}</span>
                </span>
              </>
            ) : (
              <>
                <span className="statusbar-dot disconnected" />
                <span>No Internet</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
