"use client";

import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, Check, AlertCircle, Info } from "lucide-react";

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export function SettingsPage() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<any>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      const update = await check();
      if (update) {
        setUpdate(update);
        setUpdateInfo({
          version: update.version,
          date: update.date,
          body: update.body,
        });
      } else {
        setUpdateInfo(null);
      }
    } catch (e) {
      const errorStr = String(e);
      if (errorStr.includes("did not respond") || errorStr.includes("Could not fetch") || errorStr.includes("no releases")) {
        setUpdateInfo(null);
      } else {
        console.error("Update check failed:", e);
        setError(String(e));
      }
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    if (!update) return;
    setDownloading(true);
    setError(null);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "600px" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "24px", color: "var(--text)" }}>
        Settings
      </h1>

      <div style={{ 
        background: "var(--bg-elevated)", 
        border: "1px solid var(--border)", 
        borderRadius: "8px",
        padding: "20px"
      }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "var(--text)" }}>
          Updates
        </h2>

        <div style={{ marginBottom: "16px", color: "var(--text-secondary)", fontSize: "14px" }}>
          Current Version: <span style={{ fontWeight: 500 }}>0.2.0-alpha</span>
        </div>

        {checking ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)" }}>
            <RefreshCw size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
            <span>Checking for updates...</span>
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f38ba8" }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: "14px" }}>Failed to check for updates</span>
            </div>
            <button
              onClick={checkForUpdates}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        ) : updateInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ 
              padding: "12px 16px", 
              background: "rgba(166, 227, 161, 0.1)", 
              border: "1px solid rgba(166, 227, 161, 0.3)",
              borderRadius: "6px",
              color: "#a6e3a1",
              fontSize: "14px",
            }}>
              Update available: <strong>{updateInfo.version}</strong>
            </div>
            {updateInfo.body && (
              <div style={{ 
                padding: "12px", 
                background: "var(--bg)", 
                borderRadius: "6px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                maxHeight: "150px",
                overflow: "auto",
              }}>
                {updateInfo.body}
              </div>
            )}
            <button
              onClick={downloadAndInstall}
              disabled={downloading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 20px",
                background: downloading ? "var(--text-secondary)" : "var(--accent)",
                color: downloading ? "var(--text)" : "var(--bg)",
                border: "none",
                borderRadius: "6px",
                cursor: downloading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 500,
                opacity: downloading ? 0.7 : 1,
              }}
            >
              {downloading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                  Downloading...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download & Install
                </>
              )}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#a6e3a1" }}>
            <Check size={16} />
            <span style={{ fontSize: "14px" }}>You're running the latest version</span>
          </div>
        )}

        {!checking && !error && (
          <button
            onClick={checkForUpdates}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "16px",
              padding: "8px 16px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            <RefreshCw size={16} />
            Check for Updates
          </button>
        )}
      </div>
    </div>
  );
}
