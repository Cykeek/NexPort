"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useAppearanceStore } from "@/stores/appearance-store";
import Counter from "@/components/ui/Counter";
import "@/components/ui/Counter.css";

function SpeedCounter({ value, icon }: { value: number; icon: React.ReactNode }) {
  const absValue = Math.abs(value);
  const displayValue = absValue < 1 ? 0 : absValue;

  let convertedValue: number;
  let unit: string;

  if (displayValue >= 1024 * 1024 * 1024) {
    convertedValue = displayValue / (1024 * 1024 * 1024);
    unit = "GB/s";
  } else if (displayValue >= 1024 * 1024) {
    convertedValue = displayValue / (1024 * 1024);
    unit = "MB/s";
  } else if (displayValue >= 1024) {
    convertedValue = displayValue / 1024;
    unit = "KB/s";
  } else {
    convertedValue = displayValue;
    unit = "B/s";
  }

  convertedValue = Math.round(convertedValue * 100) / 100;

  return (
    <span className="statusbar-meter-counter">
      {icon}
      <Counter
        value={convertedValue}
        fontSize={8}
        padding={2}
        gap={1}
        textColor="inherit"
        fontWeight="500"
        gradientHeight={0}
      />
      <span className="statusbar-meter-unit">{unit}</span>
    </span>
  );
}

export function StatusBar() {
  const showPublicIp = useAppearanceStore((s) => s.showPublicIp);
  const { online, ip, download, upload, meterAvailable, rxBps, txBps } =
    useNetworkStatus(showPublicIp);

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-version">v0.4.0-beta</span>
      </div>
      <div className="statusbar-right">
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
                  {meterAvailable ? (
                    <SpeedCounter value={rxBps} icon={<ArrowDown size={10} className="statusbar-meter-icon" />} />
                  ) : (
                    <>
                      <ArrowDown size={10} className="statusbar-meter-icon" />
                      <span>{download}</span>
                    </>
                  )}
                </span>
                <span
                  className={`statusbar-meter ${meterAvailable ? "" : "statusbar-meter--unavailable"}`}
                  title={
                    meterAvailable
                      ? undefined
                      : "Network meter unavailable (backend counters not accessible)"
                  }
                >
                  {meterAvailable ? (
                    <SpeedCounter value={txBps} icon={<ArrowUp size={10} className="statusbar-meter-icon" />} />
                  ) : (
                    <>
                      <ArrowUp size={10} className="statusbar-meter-icon" />
                      <span>{upload}</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="statusbar-dot disconnected" />
                <span>No Internet</span>
              </>
            )}
          </div>
      </div>
    </div>
  );
}
