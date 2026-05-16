"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useAppearanceStore } from "@/stores/appearance-store";

export function StatusBar() {
  const showPublicIp = useAppearanceStore((s) => s.showPublicIp);
  const { online, ip, download, upload, mounted, meterAvailable } =
    useNetworkStatus(showPublicIp);

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-version">v0.4.0-beta</span>
      </div>
      <div className="statusbar-right">
        {mounted && (
          <div
            className={`statusbar-network ${online ? "connected" : "disconnected"}`}
          >
            {online ? (
              <>
                <span className="statusbar-dot connected" />
                {showPublicIp && ip && (
                  <>
                    <span className="statusbar-ip">{ip}</span>
                    <span className="statusbar-divider" />
                  </>
                )}
                <span
                  className={`statusbar-meter ${meterAvailable ? "" : "statusbar-meter--unavailable"}`}
                  title={
                    meterAvailable
                      ? undefined
                      : "Network meter unavailable (backend counters not accessible)"
                  }
                >
                  <ArrowDown size={10} className="statusbar-meter-icon" />
                  <span>{download}</span>
                </span>
                <span
                  className={`statusbar-meter ${meterAvailable ? "" : "statusbar-meter--unavailable"}`}
                  title={
                    meterAvailable
                      ? undefined
                      : "Network meter unavailable (backend counters not accessible)"
                  }
                >
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
