"use client";

import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Download, RefreshCw, Check, ChevronDown, ExternalLink, Zap, Info, Bell, Palette } from "lucide-react";
import { AppearanceSection } from "./appearance-section";

type UpdateChannel = "stable" | "dev";
type SettingsTab = "general" | "appearance";

const CHANNEL_ENDPOINTS: Record<UpdateChannel, string> = {
  stable: "https://github.com/Cykeek/NexPort/releases/latest/download/latest.json",
  dev: "https://github.com/Cykeek/NexPort/releases/download/dev-latest/latest.json",
};

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

const SETTINGS_TABS = [
  { id: "general" as const, label: "General", icon: Info },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
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
        try {
          const responseText = await invoke<string>("fetch_url", { url: CHANNEL_ENDPOINTS.stable });
          const manifest = JSON.parse(responseText);
          const hasPlatforms = manifest.platforms && Object.keys(manifest.platforms).length > 0;
          if (!hasPlatforms) { setUpdateStatus("no-packages"); return; }
          const result = await check({ timeout: 10 });
          if (result) {
            setUpdate(result);
            setUpdateInfo({ version: result.version, date: result.date, body: result.body || undefined });
            setUpdateStatus("available");
          } else {
            setUpdateStatus("up-to-date");
          }
        } catch { setUpdateStatus("no-packages"); }
      } else {
        const responseText = await invoke<string>("fetch_url", { url: CHANNEL_ENDPOINTS.dev });
        const manifest = JSON.parse(responseText);
        const hasPlatforms = manifest.platforms && Object.keys(manifest.platforms).length > 0;
        if (!hasPlatforms) { setUpdateStatus("no-packages"); return; }

        const { getVersion } = await import("@tauri-apps/api/app");
        const installedVersion = await getVersion();
        const buildCommit = await invoke<string>("get_build_commit");
        const devHashMatch = manifest.version?.match(/-dev\.([a-f0-9]+)$/);
        const manifestHash = devHashMatch ? devHashMatch[1] : null;
        const manifestBase = manifest.version?.replace(/-dev\..+$/, "") || "";
        const knownCommit = buildCommit && buildCommit !== "unknown" ? buildCommit : localStorage.getItem("nexport-last-dev-hash");
        const isNewerBase = manifestBase !== installedVersion && manifestBase > installedVersion;
        const isNewerDev = manifestBase === installedVersion && manifestHash && manifestHash !== knownCommit;

        if (isNewerBase || isNewerDev) {
          setUpdateInfo({ version: manifest.version, date: manifest.pub_date, body: manifest.notes || "Dev build available" });
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
      if (updateInfo?.version) {
        const hashMatch = updateInfo.version.match(/-dev\.([a-f0-9]+)$/);
        if (hashMatch) localStorage.setItem("nexport-last-dev-hash", hashMatch[1]);
      }
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

      <div className="settings-layout">
        {/* Settings Tabs */}
        <nav className="settings-tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? "settings-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Settings Content */}
        <div className="settings-content">
          {activeTab === "general" && (
            <>
              {/* General Settings Grid */}
              <div className="settings-grid">
                {/* About Card */}
                <div className="settings-card">
                  <div className="settings-card-title">About</div>
                  <div className="settings-card-body">
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
                      <a href="https://github.com/Cykeek/NexPort" target="_blank" rel="noopener noreferrer" className="settings-row-action-link">
                        GitHub <ExternalLink size={11} />
                      </a>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <div className="settings-row-text">
                          <span className="settings-row-label">Version</span>
                        </div>
                      </div>
                      <span className="settings-row-value">0.3.2-beta</span>
                    </div>
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <div className="settings-row-text">
                          <span className="settings-row-label">Build Channel</span>
                        </div>
                      </div>
                      <span className="settings-row-value">{channel}</span>
                    </div>
                  </div>
                </div>

                {/* Updates Card */}
                <div className="settings-card">
                  <div className="settings-card-title">Updates</div>
                  <div className="settings-card-body">
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <div className="settings-row-text">
                          <span className="settings-row-label">Update Channel</span>
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
                          <span className="settings-row-label">Check for Updates</span>
                          <span className="settings-row-desc">
                            {checking ? "Checking..." : updateStatus === "available" ? `v${updateInfo?.version} available` : updateStatus === "no-packages" ? "No packages found" : "Up to date"}
                          </span>
                        </div>
                      </div>
                      {checking ? (
                        <div className="btn-secondary btn-sm btn-disabled">
                          <RefreshCw size={12} className="settings-spin" />
                        </div>
                      ) : updateInfo ? (
                        <button className="btn-primary btn-sm" onClick={downloadAndInstall} disabled={downloading}>
                          {downloading ? <RefreshCw size={12} className="settings-spin" /> : <Download size={12} />}
                          {downloading ? "Installing" : "Update"}
                        </button>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => checkForUpdates()}>
                          <RefreshCw size={12} />
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <AppearanceSection />
          )}
        </div>
      </div>
    </div>
  );
}
