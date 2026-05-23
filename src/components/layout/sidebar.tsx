"use client";

import { LayoutGrid, Key, Settings, FolderOpen, Zap, PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface SidebarProps {
  open: boolean;
  activeNav: "connections" | "keys" | "sftp" | "settings";
  onNavChange: (nav: "connections" | "keys" | "sftp" | "settings") => void;
  onToggle: () => void;
}

const navItems = [
  { id: "connections" as const, label: "Connections", icon: LayoutGrid },
  { id: "keys" as const, label: "SSH Keys", icon: Key },
  { id: "sftp" as const, label: "SFTP", icon: FolderOpen },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function AppSidebar({ open, activeNav, onNavChange, onToggle }: SidebarProps) {
  if (!open) {
    return (
      <div className="sidebar sidebar-collapsed">
        {/* Brand icon only */}
        <div className="sidebar-collapsed-brand">
          <div className="sidebar-brand-icon" onClick={onToggle} title="Expand sidebar">
            <PanelLeftOpen size={15} />
          </div>
        </div>

        {/* Icon-only nav */}
        <nav className="sidebar-collapsed-nav">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                className={`sidebar-collapsed-item ${isActive ? "active" : ""}`}
                onClick={() => onNavChange(item.id)}
                title={item.label}
              >
                <item.icon size={18} />
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="sidebar">
      {/* Brand + Collapse button */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Zap size={15} />
        </div>
        <span className="sidebar-brand-name">NexPort</span>
        <button className="sidebar-collapse-btn" onClick={onToggle} title="Collapse sidebar">
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              onClick={() => onNavChange(item.id)}
            >
              <item.icon className="sidebar-nav-item-icon" size={16} />
              <span className="sidebar-nav-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
