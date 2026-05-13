"use client";

import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, Check, AlertCircle, ChevronDown } from "lucide-react";

type UpdateChannel = "stable" | "dev";

const CHANNEL_ENDPOINTS: Record<UpdateChannel, string> = {
  stable: "https://github.com/Cykeek/NexPort/releases/latest/download/latest.json",
  dev: "https://github.com/Cykeek/NexPort/releases/download/dev-latest/latest.json",
};

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export function SettingsPage() {
  const [channel, setChannel] = useState<UpdateChannel>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("update-channel") as UpdateChannel) || "stable";
    }
    return "stable";
  });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    checkForUpdates(channel);
  }, []);

  const handleChannelChange = (newChannel: UpdateChannel) => {
    setChannel(newChannel);
    setDropdownOpen(false);
    localStorage.setItem("update-channel", newChannel);
    setUpdateInfo(null);
    setUpdate(null);
    setError(null);
    checkForUpdates(newChannel);
  };

  const checkForUpdates = async (ch?: UpdateChannel) => {
    const activeChannel = ch || channel;
    setChecking(true);
    setError(null);
    setUpdateInfo(null);
    setUpdate(null);

    try {
      if (activeChannel === "stable") {
        // Stable channel uses the default endpoint from tauri.conf.json
        const result = await check({ timeout: 10 });
        if (result) {
          setUpdate(result);
          setUpdateInfo({
            version: result.version,
            date: result.date,
            body: result.body || undefined,
          });
        }
      } else {
        // Dev channel: fetch manifest manually, then use check() with headers
        // to signal the backend. Since Tauri doesn't support dynamic endpoints,
        // we fetch the dev manifest and compare versions ourselves.
        const response = await fetch(CHANNEL_ENDPOINTS.dev);
        if (!response.ok) {
          setUpdateInfo(null);
          return;
        }
        const manifest = await response.json();
        const currentVersion = "0.2.0-alpha"; // matches tauri.conf.json

        // If the dev manifest has a different version, show it
        if (manifest.version && manifest.version !== currentVersion) {
          // Try check() — it will use the stable endpoint but if dev has a newer
          // version we show the info. For actual install, we use check() which
          // handles signature verification via the configured endpoint.
          const result = await check({ timeout: 10 });
          if (result) {
            setUpdate(result);
            setUpdateInfo({
              version: result.version,
              date: result.date,
              body: result.body || undefined,
            });
          } else {
            // Stable endpoint says no update, but dev has one — show dev info
            // User will need to download manually or we show the version info
            setUpdateInfo({
              version: manifest.version,
              date: manifest.pub_date,
              body: manifest.notes || "Dev build available (manual download required)",
            });
            setUpdate(null);
          }
        }
      }
    } catch (e) {
      // Any error from check() means the endpoint is unreachable or has no valid release.
      // This is expected when no stable release exists yet, or the dev endpoint isn't set up.
      console.warn("Update check:", String(e));
      setUpdateInfo(null);
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    if (!update) {
      // Dev channel without auto-install — open GitHub releases page
      window.open("https://github.com/Cykeek/NexPort/releases/tag/dev-latest", "_blank");
      return;
    }
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
        borderRadius: "var(--radius-lg)",
        padding: "20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>
            Updates
          </h2>

          {/* Channel Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-secondary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              <span style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: channel === "stable" ? "var(--success)" : "var(--warning)",
              }} />
              {channel === "stable" ? "Stable" : "Dev"}
              <ChevronDown size={12} />
            </button>

            {dropdownOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  onClick={() => setDropdownOpen(false)}
                />
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px",
                  zIndex: 50,
                  minWidth: "140px",
                  boxShadow: "0 8px 24px rgba(0,0,0,.4)",
                }}>
                  <button
                    onClick={() => handleChannelChange("stable")}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      background: channel === "stable" ? "var(--bg-active)" : "transparent",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      fontSize: "12px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--success)" }} />
                    Stable
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>main</span>
                  </button>
                  <button
                    onClick={() => handleChannelChange("dev")}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      background: channel === "dev" ? "var(--bg-active)" : "transparent",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      fontSize: "12px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--warning)" }} />
                    Dev
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>dev</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "16px", color: "var(--text-secondary)", fontSize: "13px" }}>
          Current Version: <span style={{ fontWeight: 500, color: "var(--text)" }}>0.2.0-alpha</span>
        </div>

        {checking ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "13px" }}>
            <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
            <span>Checking for updates on {channel} channel...</span>
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--danger)", fontSize: "13px" }}>
              <AlertCircle size={14} />
              <span>Failed to check for updates</span>
            </div>
            <button onClick={() => checkForUpdates()} className="btn-secondary" style={{ width: "fit-content", padding: "8px 14px", fontSize: "12px" }}>
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        ) : updateInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{
              padding: "10px 14px",
              background: "var(--success-subtle)",
              border: "1px solid rgba(34,197,94,.3)",
              borderRadius: "var(--radius-md)",
              color: "var(--success)",
              fontSize: "13px",
            }}>
              Update available: <strong>{updateInfo.version}</strong>
            </div>
            {updateInfo.body && (
              <div style={{
                padding: "10px 12px",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                maxHeight: "120px",
                overflow: "auto",
                lineHeight: 1.5,
              }}>
                {updateInfo.body}
              </div>
            )}
            <button
              onClick={downloadAndInstall}
              disabled={downloading || !update}
              className="btn-primary"
              style={{ width: "fit-content", padding: "8px 16px", fontSize: "12px", opacity: (downloading || !update) ? 0.7 : 1 }}
            >
              {downloading ? (
                <>
                  <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                  Downloading...
                </>
              ) : !update ? (
                <>
                  <Download size={12} />
                  Download from GitHub
                </>
              ) : (
                <>
                  <Download size={12} />
                  Download & Install
                </>
              )}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success)", fontSize: "13px" }}>
            <Check size={14} />
            <span>
              {channel === "stable"
                ? "No stable release available yet — you're on a dev build"
                : "You're on the latest dev build"}
            </span>
          </div>
        )}

        {!checking && !error && (
          <button
            onClick={() => checkForUpdates()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "14px",
              padding: "7px 12px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <RefreshCw size={12} />
            Check Again
          </button>
        )}
      </div>
    </div>
  );
}
