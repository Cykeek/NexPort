"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useNetworkStatus, type SpeedTier } from "@/hooks/use-network-status";
import { useAppearanceStore } from "@/stores/appearance-store";
import Counter from "@/components/ui/Counter";
import "@/components/ui/Counter.css";

function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1024);
  const pad = h * 0.1;
  const range = h - pad * 2;
  const stepX = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (1 - v / max) * range;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function SpeedCounter({ value, history, tier, icon }: { value: number; history: number[]; tier: SpeedTier; icon: React.ReactNode }) {
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
    <span className={`statusbar-meter-counter statusbar-meter--${tier}`}>
      <span className={`statusbar-meter-icon-wrap ${absValue > 0 ? "statusbar-meter-icon-wrap--active" : ""}`}>
        {icon}
      </span>
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
      {history.length >= 2 && (
        <svg className="statusbar-sparkline" viewBox="0 0 40 12" preserveAspectRatio="none">
          <path d={sparklinePath(history, 40, 12)} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function StatusBar() {
  const showPublicIp = useAppearanceStore((s) => s.showPublicIp);
  const showNetworkMeter = useAppearanceStore((s) => s.showNetworkMeter);
  const { online, ip, download, upload, meterAvailable, rxBps, txBps, speedTier, rxHistory, txHistory } =
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
                {showNetworkMeter && (
                  <>
                    <span
                      className={`statusbar-meter ${meterAvailable ? `statusbar-meter--${speedTier}` : "statusbar-meter--unavailable"}`}
                      title={
                        meterAvailable
                          ? undefined
                          : "Network meter unavailable (backend counters not accessible)"
                      }
                    >
                      {meterAvailable ? (
                        <SpeedCounter value={rxBps} history={rxHistory} tier={speedTier} icon={<ArrowDown size={10} className="statusbar-meter-icon" />} />
                      ) : (
                        <>
                          <ArrowDown size={10} className="statusbar-meter-icon" />
                          <span>{download}</span>
                        </>
                      )}
                    </span>
                    <span
                      className={`statusbar-meter ${meterAvailable ? `statusbar-meter--${speedTier}` : "statusbar-meter--unavailable"}`}
                      title={
                        meterAvailable
                          ? undefined
                          : "Network meter unavailable (backend counters not accessible)"
                      }
                    >
                      {meterAvailable ? (
                        <SpeedCounter value={txBps} history={txHistory} tier={speedTier} icon={<ArrowUp size={10} className="statusbar-meter-icon" />} />
                      ) : (
                        <>
                          <ArrowUp size={10} className="statusbar-meter-icon" />
                          <span>{upload}</span>
                        </>
                      )}
                    </span>
                  </>
                )}
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
