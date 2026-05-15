"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "./sidebar";
import { ContentArea } from "./content-area";
import { StatusBar } from "./status-bar";
import { Toaster } from "sonner";
import { Minus, Square, X, Zap } from "lucide-react";
import { ConnectionsPage } from "@/components/connections/connections-page";
import { KeyManager } from "@/components/keys/key-manager";
import { SettingsPage } from "@/components/settings/settings-page";
import { useWindowControls } from "@/hooks/use-window-controls";
import { useColorMode } from "@/hooks/use-color-mode";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { WanderingEyes } from "@/components/ui/wandering-eyes";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState<"connections" | "keys" | "settings">("connections");
  const [appReady, setAppReady] = useState(false);
  const { handleMinimize, handleMaximize, handleClose, dragRef } = useWindowControls();
  useColorMode();

  // Splash screen — show for a brief moment while the app initializes
  useEffect(() => {
    const timer = setTimeout(() => setAppReady(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  if (!appReady) {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <div className="splash-brand">
            <div className="splash-brand-icon">
              <Zap size={24} />
            </div>
            <span className="splash-brand-name">NexPort</span>
          </div>
          <WanderingEyes
            className="splash-eyes"
            pupilColor="var(--accent)"
            eyeColor="var(--text-muted)"
          />
          <div className="splash-text">Initializing secure connections...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Drag region with window controls */}
      <div className="topnav" ref={dragRef} data-tauri-drag-region style={{ cursor: "grab" }}>
        <div className="topnav-left" data-tauri-drag-region />
        <div className="topnav-right">
          <button className="topnav-btn" onClick={handleMinimize}>
            <Minus size={14} />
          </button>
          <button className="topnav-btn" onClick={handleMaximize}>
            <Square size={11} />
          </button>
          <button className="topnav-btn" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="app-body">
        <AppSidebar
          open={sidebarOpen}
          activeNav={activePage}
          onNavChange={setActivePage}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <ContentArea>
          <ErrorBoundary>
            {activePage === "connections" && <ConnectionsPage />}
            {activePage === "keys" && <KeyManager />}
            {activePage === "settings" && <SettingsPage />}
          </ErrorBoundary>
        </ContentArea>
      </div>

      {/* Status Bar */}
      <StatusBar />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)", fontSize: "13px" },
        }}
      />
    </div>
  );
}
