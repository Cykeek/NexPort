"use client";

import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Download, RefreshCw, Check, ChevronDown, ExternalLink, Zap } from "lucide-react";

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
  const [update, setUpdate] = useState<Update | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [updateStatus, setUpdateStatus] = useState<"checking" | "available" | "up-to-date" | "no-packages">("checking");

  useEffect(() => {
    checkForUpdates(channel);
  }, []);

  const handleChannelChange = (newChannel: UpdateChannel) => {
    setChannel(newChannel);
    setDropdownOpen(false);
    localStorage.setItem("update-channel", newChannel);
    setUpdateInfo(null);
    setUpdate(null);
    setUpdateStatus("checking");
    checkForUpdates(newChannel);
  };

  const checkForUpdates = async (ch?: UpdateChannel) => {
    const activeChannel = ch || channel;
    setChecking(true);
    setUpdateInfo(null);
    setUpdate(null);
    setUpdateStatus("checking");

    try {
      if (activeChannel === "stable") {
        // First check if the stable manifest exists and has assets
        try {
          const responseText = await invoke<string>("fetch_url", { url: CHANNEL_ENDPOINTS.stable });
          const manifest = JSON.parse(responseText);
          const hasPlatforms = manifest.platforms && Object.keys(manifest.platforms).length > 0;
          if (!hasPlatforms) {
            setUpdateStatus("no-packages");
            return;
          }
          // Manifest exists with assets — now use Tauri's check() for proper version comparison + install
          const result = await check({ timeout: 10 });
          if (result) {
            setUpdate(result);
            setUpdateInfo({ version: result.version, date: result.date, body: result.body || undefined });
            setUpdateStatus("available");
          } else {
            setUpdateStatus("up-to-date");
          }
        } catch {
          setUpdateStatus("no-packages");
        }
      } else {
        // Dev channel: fetch manifest via Rust backend (bypasses webview CSP/CORS)
        const responseText = await invoke<string>("fetch_url", { url: CHANNEL_ENDPOINTS.dev });
        console.log("[updater] Dev manifest:", responseText.substring(0, 200));
        const manifest = JSON.parse(responseText);

        // Check if the manifest has platform data (actual assets)
        const hasPlatforms = manifest.platforms && Object.keys(manifest.platforms).length > 0;
        console.log("[updater] Has platforms:", hasPlatforms);
        if (!hasPlatforms) {
          setUpdateStatus("no-packages");
          return;
        }

        const currentVersion = "0.2.1-alpha";
        if (manifest.version && manifest.version !== currentVersion) {
          setUpdateInfo({
            version: manifest.version,
            date: manifest.pub_date,
            body: manifest.notes || "Dev build available",
          });
          setUpdate(null);
          setUpdateStatus("available");
        } else {
          setUpdateStatus("up-to-date");
        }
      }
    } catch (e) {
      console.warn("[updater] Update check error:", String(e));
      setUpdateStatus("no-packages");
    } finally {
      setChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    if (!update) {
      // Dev channel without auto-install — open GitHub releases page in default browser
      await open("https://github.com/Cykeek/NexPort/releases/tag/dev-latest");
      return;
    }
    setDownloading(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      console.error("Download failed:", e);
      setDownloading(false);
    }
  };

  return (
    <div className="settings-page">
      <h1 className="settings-title">Settings</h1>

      {/* About Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">About</span>
          <span className="settings-section-badge">v0.2.1-alpha</span>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-icon">
              <Zap size={16} />
            </div>
            <div className="settings-row-text">
              <span className="settings-row-label">NexPort</span>
              <span className="settings-row-desc">A modern SSH client for desktop</span>
            </div>
          </div>
          <a
            href="https://github.com/Cykeek/NexPort"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-row-action-link"
          >
            GitHub <ExternalLink size={11} />
          </a>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Version</span>
              <span className="settings-row-desc">Current installed version</span>
            </div>
          </div>
          <span className="settings-row-value">0.2.1-alpha</span>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Build</span>
              <span className="settings-row-desc">Release channel for this build</span>
            </div>
          </div>
          <span className="settings-row-value">{channel}</span>
        </div>
      </div>

      {/* Updates Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">Updates</span>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Update channel</span>
              <span className="settings-row-desc">Choose between stable and dev builds</span>
            </div>
          </div>
          <div className="settings-dropdown-wrapper">
            <button className="settings-channel-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <span className="settings-channel-dot" style={{ background: channel === "stable" ? "var(--success)" : "var(--warning)" }} />
              {channel === "stable" ? "Stable" : "Dev"}
              <ChevronDown size={11} />
            </button>
            {dropdownOpen && (
              <>
                <div className="settings-dropdown-backdrop" onClick={() => setDropdownOpen(false)} />
                <div className="settings-dropdown-menu">
                  <button className={`settings-dropdown-item ${channel === "stable" ? "active" : ""}`} onClick={() => handleChannelChange("stable")}>
                    <span className="settings-channel-dot" style={{ background: "var(--success)" }} />
                    Stable
                    <span className="settings-dropdown-hint">main</span>
                  </button>
                  <button className={`settings-dropdown-item ${channel === "dev" ? "active" : ""}`} onClick={() => handleChannelChange("dev")}>
                    <span className="settings-channel-dot" style={{ background: "var(--warning)" }} />
                    Dev
                    <span className="settings-dropdown-hint">dev</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Check for updates</span>
              <span className="settings-row-desc">
                {checking
                  ? "Checking..."
                  : updateStatus === "available"
                    ? `Update available: ${updateInfo?.version}`
                    : updateStatus === "no-packages"
                      ? "No release packages found"
                      : "Already updated"}
              </span>
            </div>
          </div>
          {checking ? (
            <div className="settings-row-action-btn disabled">
              <RefreshCw size={12} className="settings-spin" />
              Checking
            </div>
          ) : updateInfo ? (
            <button className="settings-row-action-btn primary" onClick={downloadAndInstall} disabled={downloading}>
              {downloading ? <RefreshCw size={12} className="settings-spin" /> : <Download size={12} />}
              {downloading ? "Installing..." : update ? "Install" : "Download"}
            </button>
          ) : (
            <button className="settings-row-action-btn" onClick={() => checkForUpdates()}>
              <RefreshCw size={12} />
              Check now
            </button>
          )}
        </div>

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Status</span>
              <span className="settings-row-desc">Current update status</span>
            </div>
          </div>
          <div className="settings-status-indicator" style={{ color: updateStatus === "no-packages" ? "var(--text-muted)" : updateStatus === "available" ? "var(--accent)" : "var(--success)" }}>
            {checking ? (
              <>
                <RefreshCw size={12} className="settings-spin" />
                <span>Checking</span>
              </>
            ) : updateStatus === "available" ? (
              <>
                <Download size={12} />
                <span>Update ready</span>
              </>
            ) : updateStatus === "no-packages" ? (
              <>
                <span>No packages</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>Up to date</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
