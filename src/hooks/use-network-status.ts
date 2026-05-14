"use client";

import { useState, useEffect, useCallback } from "react";

interface NetworkStatus {
  online: boolean;
  ip: string | null;
  download: string;
  upload: string;
}

export function useNetworkStatus() {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<NetworkStatus>({
    online: true,
    ip: null,
    download: "—",
    upload: "—",
  });

  const fetchIp = useCallback(async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { 
        signal: AbortSignal.timeout(5000) 
      });
      const data = await res.json();
      setStatus((prev) => ({ ...prev, ip: data.ip, online: true }));
    } catch {
      setStatus((prev) => ({ ...prev, ip: null }));
    }
  }, []);

  useEffect(() => {
    // Set actual online status after mount to avoid hydration mismatch
    setMounted(true);
    setStatus((prev) => ({ ...prev, online: navigator.onLine }));

    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, online: true }));
      fetchIp();
    };
    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, online: false, ip: null, download: "—", upload: "—" }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial IP fetch
    if (navigator.onLine) {
      fetchIp();
    }

    // Poll network throughput using Performance API
    let rafId: number;
    let lastBytes = 0;
    let lastTime = performance.now();

    const measureThroughput = () => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const now = performance.now();
      const elapsed = (now - lastTime) / 1000; // seconds

      if (elapsed >= 2) {
        let totalTransferred = 0;
        for (const entry of entries) {
          if (entry.transferSize) {
            totalTransferred += entry.transferSize;
          }
        }

        const deltaBytes = totalTransferred - lastBytes;
        const speedBps = deltaBytes / elapsed;

        setStatus((prev) => {
          if (!prev.online) return prev;
          return {
            ...prev,
            download: formatSpeed(speedBps),
            upload: "—",
          };
        });

        lastBytes = totalTransferred;
        lastTime = now;
      }

      rafId = requestAnimationFrame(measureThroughput);
    };

    rafId = requestAnimationFrame(measureThroughput);

    // Re-fetch IP every 60s to detect changes
    const ipInterval = setInterval(() => {
      if (navigator.onLine) fetchIp();
    }, 60000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      cancelAnimationFrame(rafId);
      clearInterval(ipInterval);
    };
  }, [fetchIp]);

  return { ...status, mounted };
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1) return "0 B/s";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}
