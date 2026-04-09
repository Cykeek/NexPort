"use client";

import { Server, Key, Settings } from "lucide-react";

interface SidebarProps {
  open: boolean;
  activeNav: "connections" | "keys" | "settings";
  onNavChange: (nav: "connections" | "keys" | "settings") => void;
}

export function AppSidebar({ open, activeNav, onNavChange }: SidebarProps) {
  if (!open) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-label">Main Menu</div>
        <button 
          className={`sidebar-nav-item ${activeNav === "connections" ? "active" : ""}`}
          onClick={() => onNavChange("connections")}
        >
          <Server className="sidebar-nav-item-icon" size={16} />
          <span>Connections</span>
        </button>
        <button 
          className={`sidebar-nav-item ${activeNav === "keys" ? "active" : ""}`}
          onClick={() => onNavChange("keys")}
        >
          <Key className="sidebar-nav-item-icon" size={16} />
          <span>Keys</span>
        </button>
        <button 
          className={`sidebar-nav-item ${activeNav === "settings" ? "active" : ""}`}
          onClick={() => onNavChange("settings")}
        >
          <Settings className="sidebar-nav-item-icon" size={16} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
