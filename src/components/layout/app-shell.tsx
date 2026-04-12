"use client";

import { useState } from "react";
import { AppSidebar } from "./sidebar";
import { ContentArea } from "./content-area";
import { StatusBar } from "./status-bar";
import { Toaster } from "sonner";
import { Minus, Square, X } from "lucide-react";
import { ConnectionsPage } from "@/components/connections/connections-page";
import { KeyManager } from "@/components/keys/key-manager";
import { SettingsPage } from "@/components/settings/settings-page";
import { useWindowControls } from "@/hooks/use-window-controls";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState<"connections" | "keys" | "settings">("connections");
  const { handleMinimize, handleMaximize, handleClose, dragRef } = useWindowControls();

  return (
    <div className="app">
      {/* Top Navigation Bar */}
      <div className="topnav" ref={dragRef} style={{ cursor: "grab" }}>
        <div className="topnav-left">
          <span className="topnav-logo">SSH CONNECT</span>
        </div>
        <div className="topnav-right">
          <div className="topnav-divider" />
          <button className="topnav-btn" onClick={handleMinimize}>
            <Minus size={14} />
          </button>
          <button className="topnav-btn" onClick={handleMaximize}>
            <Square size={12} />
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
