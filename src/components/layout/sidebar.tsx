"use client";

import { Server, Key, Settings, Zap, ChevronsLeft, ChevronsRight } from "lucide-react";

interface SidebarProps {
  open: boolean;
  activeNav: "connections" | "keys" | "settings";
  onNavChange: (nav: "connections" | "keys" | "settings") => void;
  onToggle?: () => void;
}

const navItems = [
  { id: "connections" as const, label: "Connections", icon: Server },
  { id: "keys" as const, label: "Keys", icon: Key },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function AppSidebar({ open, activeNav, onNavChange, onToggle }: SidebarProps) {
  if (!open) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-collapsed-brand">
          <div className="sidebar-brand-icon">
            <Zap size={14} />
          </div>
        </div>
        <div className="sidebar-collapsed-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-collapsed-item ${activeNav === item.id ? "active" : ""}`}
              onClick={() => onNavChange(item.id)}
              title={item.label}
            >
              <item.icon size={18} />
            </button>
          ))}
        </div>
        <div className="sidebar-collapsed-footer">
          <button className="sidebar-collapse-btn" onClick={onToggle} title="Expand sidebar">
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      {/* Brand / Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Zap size={14} />
        </div>
        <span className="sidebar-brand-name">NexPort</span>
        <button className="sidebar-collapse-btn" onClick={onToggle} title="Collapse sidebar">
          <ChevronsLeft size={14} />
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

      {/* Footer */}
      <div className="sidebar-footer">
        <span className="sidebar-footer-version">v0.3.1-beta</span>
      </div>
    </div>
  );
}
