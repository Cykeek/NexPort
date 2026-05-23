"use client";

import { useState, useEffect, useCallback } from "react";
import { networkApi } from "@/lib/tauri-api";

interface NetworkStatus {
  online: boolean;
  ip: string | null;
  download: string;
  upload: string;
  meterAvailable: boolean;
  rxBps: number;
  txBps: number;
}

interface CounterSnapshot {
  rxBytesTotal: number;
  txBytesTotal: number;
  atMs: number;
}

const NETWORK_POLL_INTERVAL_MS = 1000;
const NETWORK_COUNTER_TIMEOUT_MS = 800;
const IP_REFRESH_INTERVAL_MS = 60000;
const SPEED_SMOOTHING_ALPHA_RISE = 0.55;
const SPEED_SMOOTHING_ALPHA_FALL = 0.25;

export function useNetworkStatus(showPublicIp = false) {
  const [status, setStatus] = useState<NetworkStatus>({
    online: true,
    ip: null,
    download: "—",
    upload: "—",
    meterAvailable: true,
    rxBps: 0,
    txBps: 0,
  });

  const fetchIp = useCallback(async () => {
    if (!showPublicIp) {
      setStatus((prev) => (prev.ip === null ? prev : { ...prev, ip: null }));
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus((prev) => ({ ...prev, ip: null }));
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as { ip?: unknown };
      const ip = typeof data.ip === "string" ? data.ip : null;
      setStatus((prev) => ({ ...prev, ip }));
    } catch {
      setStatus((prev) => ({ ...prev, ip: null }));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [showPublicIp]);

  useEffect(() => {
    const initialOnline = navigator.onLine;
    setStatus((prev) => ({ ...prev, online: initialOnline }));

    let disposed = false;
    let pollTimer: number | undefined;
    let ipInterval: number | undefined;

    let lastSnapshot: CounterSnapshot | null = null;
    let smoothedRxBps = 0;
    let smoothedTxBps = 0;

    const resetMeter = () => {
      lastSnapshot = null;
      smoothedRxBps = 0;
      smoothedTxBps = 0;
      setStatus((prev) => ({ ...prev, rxBps: 0, txBps: 0 }));
    };

    const updateFromCounters = async () => {
      if (disposed || !navigator.onLine) return;

      try {
        const counters = await withTimeout(
          networkApi.getCounters(),
          NETWORK_COUNTER_TIMEOUT_MS,
        );
        if (disposed) return;

        const now = performance.now();

        if (!lastSnapshot) {
          lastSnapshot = {
            rxBytesTotal: counters.rxBytesTotal,
            txBytesTotal: counters.txBytesTotal,
            atMs: now,
          };

          setStatus((prev) =>
            prev.online
              ? {
                  ...prev,
                  download: "0 B/s",
                  upload: "0 B/s",
                  meterAvailable: true,
                  rxBps: 0,
                  txBps: 0,
                }
              : prev,
          );
          return;
        }

        const elapsedSeconds = Math.max(
          (now - lastSnapshot.atMs) / 1000,
          0.001,
        );
        const rxDelta = Math.max(
          0,
          counters.rxBytesTotal - lastSnapshot.rxBytesTotal,
        );
        const txDelta = Math.max(
          0,
          counters.txBytesTotal - lastSnapshot.txBytesTotal,
        );

        const rxRawBps = rxDelta / elapsedSeconds;
        const txRawBps = txDelta / elapsedSeconds;

        smoothedRxBps = smoothBps(smoothedRxBps, rxRawBps);
        smoothedTxBps = smoothBps(smoothedTxBps, txRawBps);

        const download =
          counters.interfaceCount > 0 ? formatSpeed(smoothedRxBps) : "0 B/s";
        const upload =
          counters.interfaceCount > 0 ? formatSpeed(smoothedTxBps) : "0 B/s";

        setStatus((prev) =>
          prev.online
            ? {
                ...prev,
                download,
                upload,
                meterAvailable: true,
                rxBps: smoothedRxBps,
                txBps: smoothedTxBps,
              }
            : prev,
        );

        lastSnapshot = {
          rxBytesTotal: counters.rxBytesTotal,
          txBytesTotal: counters.txBytesTotal,
          atMs: now,
        };
      } catch {
        setStatus((prev) =>
          prev.online
            ? {
                ...prev,
                download: "N/A",
                upload: "N/A",
                meterAvailable: false,
                rxBps: 0,
                txBps: 0,
              }
            : prev,
        );
      }
    };

    const pollLoop = async () => {
      if (disposed) return;
      await updateFromCounters();
      if (disposed) return;
      pollTimer = window.setTimeout(pollLoop, NETWORK_POLL_INTERVAL_MS);
    };

    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, online: true }));
      resetMeter();
      if (showPublicIp) {
        void fetchIp();
      }
    };

    const handleOffline = () => {
      resetMeter();
      setStatus((prev) => ({
        ...prev,
        online: false,
        ip: null,
        download: "—",
        upload: "—",
        rxBps: 0,
        txBps: 0,
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (initialOnline && showPublicIp) {
      void fetchIp();
    } else if (!showPublicIp) {
      setStatus((prev) => (prev.ip === null ? prev : { ...prev, ip: null }));
    }

    void pollLoop();

    if (showPublicIp) {
      ipInterval = window.setInterval(() => {
        if (navigator.onLine) {
          void fetchIp();
        }
      }, IP_REFRESH_INTERVAL_MS);
    }

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
      }
      if (ipInterval !== undefined) {
        window.clearInterval(ipInterval);
      }
    };
  }, [fetchIp, showPublicIp]);

  return status;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("network meter timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function smoothBps(previous: number, next: number): number {
  if (previous === 0) return next;
  const alpha =
    next > previous ? SPEED_SMOOTHING_ALPHA_RISE : SPEED_SMOOTHING_ALPHA_FALL;
  return alpha * next + (1 - alpha) * previous;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1) return "0 B/s";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024)
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}
