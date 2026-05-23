"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { X, Plus, Minus, Square } from "lucide-react";
import { useWindowControls } from "@/hooks/use-window-controls";
import { useColorMode } from "@/hooks/use-color-mode";
import { WanderingEyes } from "@/components/ui/wandering-eyes";
import {
  TERMINAL_CONFIG,
  SSH_DEFAULTS,
} from "@/config/constants";
import { useAppearanceStore } from "@/stores/appearance-store";
import { getThemeByName } from "@/config/themes";
import { sshApi, connectionApi } from "@/lib/tauri-api";

interface TerminalTab {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sessionId: string;
  authMethod?: string;
  keyId?: string;
}

interface InitParams {
  host: string;
  port: number;
  username: string;
  connectionId?: string;
}

interface TerminalContextMenuState {
  x: number;
  y: number;
}

/** Progress steps shown during the SSH connection handshake. */
const CONNECT_STEPS = [
  { label: "Resolving host", detail: "Looking up the remote server" },
  { label: "Establishing connection", detail: "TCP handshake" },
  { label: "Negotiating protocol", detail: "SSH key exchange" },
  { label: "Authenticating", detail: "Verifying credentials" },
  { label: "Opening shell", detail: "Allocating PTY" },
  { label: "Ready", detail: "Connecting terminal…" },
] as const;

export default function TerminalPageClient() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [initParams, setInitParams] = useState<InitParams | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState(0);
  const terminalsRef = useRef<Map<string, XTerm>>(new Map());
  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map());
  const pollingRef = useRef<Set<string>>(new Set());
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const { handleMinimize, handleMaximize, handleClose: winClose, dragRef } = useWindowControls();
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState | null>(null);

  // Subscribe to appearance store for live terminal customization
  const { fontFamily, fontSize, fontWeight, themeName, uiThemingEnabled } = useAppearanceStore();

  // Apply color mode and auto-switch theme in terminal window
  useColorMode();

  // Derive terminal window chrome colors from theme when UI theming is enabled
  const currentThemeForUI = getThemeByName(themeName);
  const ui = uiThemingEnabled
    ? {
        bg: currentThemeForUI.ui.bg,
        bgElevated: currentThemeForUI.ui.bgElevated,
        bgSurface: currentThemeForUI.ui.bgSurface,
        border: currentThemeForUI.ui.border,
        text: currentThemeForUI.colors.foreground,
        textMuted: currentThemeForUI.colors.brightBlack,
        accent: currentThemeForUI.ui.accent,
        tabActive: currentThemeForUI.ui.bgSurface,
      }
    : currentThemeForUI.variant === "light"
    ? {
        bg: "#f8f9fa",
        bgElevated: "#ffffff",
        bgSurface: "#f1f3f5",
        border: "#e1e4e8",
        text: "#1e1e1e",
        textMuted: "#666666",
        accent: "#3b82f6",
        tabActive: "#e9ecef",
      }
    : {
        bg: "#08080d",
        bgElevated: "#1a1a24",
        bgSurface: "#1a1a24",
        border: "#333",
        text: "#c4c6d0",
        textMuted: "#888",
        accent: "#3b82f6",
        tabActive: "#333",
      };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitParams({
      host: params.get("host") || "localhost",
      port: parseInt(params.get("port") || "22"),
      username: params.get("username") || "root",
      connectionId: params.get("connectionId") || undefined,
    });
  }, []);

  useEffect(() => {
    if (initParams) {
      createTerminal(initParams.host, initParams.port, initParams.username, initParams.connectionId);
    }
  }, [initParams]);

  useEffect(() => {
    const preventDefaultContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", preventDefaultContextMenu);
    return () => document.removeEventListener("contextmenu", preventDefaultContextMenu);
  }, []);

  const createTerminal = async (host: string, port: number, username: string, connectionId?: string): Promise<TerminalTab | null> => {
    setConnecting(true);
    setConnectError(null);
    setConnectStep(0);

    // Animate through progress steps at a natural pace.
    const stepTimer = setInterval(() => {
      setConnectStep(prev => {
        if (prev >= CONNECT_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 600);

    try {
      const sessionId = await sshApi.connect({
        sessionId: crypto.randomUUID(),
        host,
        port,
        username,
        password: null,
        keyData: null,
        connectionId: connectionId || null,
      });

      if (connectionId) {
        sshApi.detectOs(connectionId)
          .then((os) => {
            if (os && os !== "unknown") {
              connectionApi.updateOs(connectionId, os)
                .then(() => {
                  window.dispatchEvent(new CustomEvent("refresh-connections"));
                });
            }
          })
          .catch(() => {});
      }

      const tab: TerminalTab = {
        id: crypto.randomUUID(),
        name: `${username}@${host}`,
        host,
        port,
        username,
        sessionId,
      };

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);

      return tab;
    } catch (e) {
      console.error("Failed to connect:", e);
      setConnectError(String(e));
      return null;
    } finally {
      clearInterval(stepTimer);
      setConnecting(false);
    }
  };

  const handleConnectionLost = (tab: TerminalTab, term: XTerm) => {
    pollingRef.current.delete(tab.sessionId);
    term.dispose();
    terminalsRef.current.delete(tab.id);
    fitAddonsRef.current.delete(tab.id);
    
    setTabs((prevTabs) => {
      const remainingTabs = prevTabs.filter(t => t.id !== tab.id);
      if (remainingTabs.length === 0) {
        pollingRef.current.clear();
        winClose();
      } else if (activeTabId === tab.id) {
        setActiveTabId(remainingTabs[0].id);
      }
      return remainingTabs;
    });
  };

  const initTerminal = useCallback((tab: TerminalTab) => {
    const container = document.getElementById(`terminal-${tab.id}`);
    if (!container || terminalsRef.current.has(tab.id)) return;

    // Use current appearance store values for initial terminal creation
    const state = useAppearanceStore.getState();
    const currentTheme = getThemeByName(state.themeName);

    const term = new XTerm({
      cursorBlink: true,
      fontSize: state.fontSize,
      fontWeight: state.fontWeight as any,
      fontFamily: `"${state.fontFamily}", "Consolas", "Courier New", monospace`,
      theme: {
        ...currentTheme.colors,
        background: currentTheme.colors.background,
      },
      scrollback: TERMINAL_CONFIG.scrollback,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new Unicode11Addon());
    term.open(container);
    term.unicode.activeVersion = "11";

    terminalsRef.current.set(tab.id, term);
    fitAddonsRef.current.set(tab.id, fitAddon);

    setTimeout(() => fitAddon.fit(), 50);

    term.onData(async (data) => {
      try {
        await sshApi.write(tab.sessionId, data);
      } catch (e) {
        console.error("Write error:", e);
      }
    });

    pollingRef.current.add(tab.sessionId);
    
    // Track if we've received any data from the server
    const hasReceivedData = { current: false };
    
    // Start polling for output
    const poll = async () => {
      if (!pollingRef.current.has(tab.sessionId)) return;
      
      try {
        // Try to read data
        const data = await sshApi.read(tab.sessionId, TERMINAL_CONFIG.pollTimeoutMs);
        
        // Check for EOF signal from backend
        if (data === "__EOF__") {
          handleConnectionLost(tab, term);
          return;
        }
        
        // Track if we've received any data
        if (data && data.length > 0) {
          hasReceivedData.current = true;
          term.write(data);
        }
      } catch (e: unknown) {
        // On connection errors (network loss, server disconnect, etc), close the terminal
        const errorStr = String(e).toLowerCase();
        const isConnectionError = 
          errorStr.includes("sessionnotfound") ||
          errorStr.includes("eof") ||
          errorStr.includes("channel") ||
          errorStr.includes("connection") ||
          errorStr.includes("reset") ||
          errorStr.includes("broken") ||
          errorStr.includes("transport") ||
          errorStr.includes("disconnected");
        
        if (isConnectionError) {
          handleConnectionLost(tab, term);
          return;
        }
      }
      
      // Continue polling
      if (pollingRef.current.has(tab.sessionId)) {
        setTimeout(poll, TERMINAL_CONFIG.pollIntervalMs);
      }
    };
    poll();
  }, [winClose, activeTabId]);

  useEffect(() => {
    if (tabs.length > 0 && activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab && !terminalsRef.current.has(tab.id)) {
        setTimeout(() => initTerminal(tab), 50);
      } else {
        const fitAddon = fitAddonsRef.current.get(activeTabId);
        if (fitAddon) {
          setTimeout(() => fitAddon.fit(), 50);
        }
      }
    }
  }, [activeTabId, tabs, initTerminal]);

  // Patch active terminal instances when appearance preferences change
  useEffect(() => {
    const theme = getThemeByName(themeName);

    terminalsRef.current.forEach((term, tabId) => {
      term.options.fontFamily = `"${fontFamily}", "Consolas", "Courier New", monospace`;
      term.options.fontSize = fontSize;
      term.options.fontWeight = fontWeight as any;
      term.options.theme = {
        ...theme.colors,
        background: theme.colors.background,
      };
      // Refit immediately — xterm handles font metric recalculation internally
      const fitAddon = fitAddonsRef.current.get(tabId);
      if (fitAddon) fitAddon.fit();
    });
  }, [fontFamily, fontSize, fontWeight, themeName, uiThemingEnabled]);

  // Listen for appearance changes from the main window via Tauri events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!isMounted) return;
        unlisten = await listen<string>("appearance-changed", (event) => {
          try {
            const prefs = JSON.parse(event.payload);
            // Directly update store state without re-persisting (avoids loop)
            useAppearanceStore.setState({
              ...(prefs.fontFamily && { fontFamily: prefs.fontFamily }),
              ...(prefs.fontSize && { fontSize: prefs.fontSize }),
              ...(prefs.fontWeight && { fontWeight: prefs.fontWeight }),
              ...(prefs.themeName && { themeName: prefs.themeName }),
              ...(prefs.uiThemingEnabled !== undefined && { uiThemingEnabled: prefs.uiThemingEnabled }),
              ...(prefs.colorMode && { colorMode: prefs.colorMode }),
            });
          } catch {}
        });
      } catch {}
    })();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      fitAddonsRef.current.forEach((fitAddon, tabId) => {
        fitAddon.fit();
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
          const dims = fitAddon.proposeDimensions();
          if (dims && dims.cols && dims.rows) {
            sshApi.resize(tab.sessionId, dims.cols, dims.rows).catch(() => {});
          }
        }
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [tabs]);

  // Ensure SSH sessions are cleaned up when the window is closed externally
  // (e.g. main window closes all terminal windows on exit).
  useEffect(() => {
    const onBeforeUnload = () => {
      pollingRef.current.clear();
      tabs.forEach(tab => {
        sshApi.disconnect(tab.sessionId).catch(() => {});
        const term = terminalsRef.current.get(tab.id);
        if (term) term.dispose();
      });
      terminalsRef.current.clear();
      fitAddonsRef.current.clear();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tabs]);

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const closeTab = async (tabId: string) => {
    if (tabs.length === 1) {
      pollingRef.current.clear();
      await handleClose();
      return;
    }

    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      pollingRef.current.delete(tab.sessionId);
      try {
        await sshApi.disconnect(tab.sessionId);
      } catch {}
    }

    const term = terminalsRef.current.get(tabId);
    if (term) {
      term.dispose();
      terminalsRef.current.delete(tabId);
    }
    fitAddonsRef.current.delete(tabId);

    const remainingTabs = tabs.filter(t => t.id !== tabId);
    setTabs(remainingTabs);

    if (activeTabId === tabId) {
      setActiveTabId(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null);
    }
  };

  const handleClose = async () => {
    // Stop all polling immediately to prevent stale reads.
    pollingRef.current.clear();

    // Disconnect all SSH sessions in parallel for faster close.
    await Promise.allSettled(
      tabs.map(tab => sshApi.disconnect(tab.sessionId))
    );

    // Dispose all XTerm instances to free resources and stop any pending writes.
    terminalsRef.current.forEach(term => term.dispose());
    terminalsRef.current.clear();
    fitAddonsRef.current.clear();

    await winClose();
  };

  const closeTerminalContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const getActiveTerminal = useCallback(() => {
    if (!activeTabId) return null;
    const tab = tabs.find((t) => t.id === activeTabId);
    const term = terminalsRef.current.get(activeTabId);
    if (!tab || !term) return null;
    return { tab, term };
  }, [activeTabId, tabs]);

  const openTerminalContextMenu = (clientX: number, clientY: number) => {
    const menuWidth = 210;
    const menuHeight = 190;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 12);
    setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) });
  };

  const copyTerminalSelection = async () => {
    const active = getActiveTerminal();
    if (!active) return;
    const selected = active.term.getSelection();
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected);
      closeTerminalContextMenu();
    } catch {
      closeTerminalContextMenu();
    }
  };

  const pasteIntoTerminal = async () => {
    const active = getActiveTerminal();
    if (!active) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        active.term.paste(text);
      }
      closeTerminalContextMenu();
    } catch {
      closeTerminalContextMenu();
    }
  };

  const selectAllTerminalText = () => {
    const active = getActiveTerminal();
    if (!active) return;
    active.term.selectAll();
    closeTerminalContextMenu();
  };

  const clearTerminalScreen = () => {
    const active = getActiveTerminal();
    if (!active) return;
    active.term.clear();
    closeTerminalContextMenu();
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTerminalContextMenu();
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contextMenuRef.current && target && contextMenuRef.current.contains(target)) {
        return;
      }
      closeTerminalContextMenu();
    };
    const handleScroll = () => {
      closeTerminalContextMenu();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [contextMenu, closeTerminalContextMenu]);

  const hasActiveTerminal = Boolean(getActiveTerminal());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: ui.bg }}>
      <div
        ref={dragRef}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px",
          background: ui.bgElevated,
          borderBottom: `1px solid ${ui.border}`,
          cursor: "grab",
        }}
      >
        {/* Tabs section */}
        <div style={{ display: "flex", gap: "4px", flex: 1 }}>
          {tabs.map((tab) => (
            <div
              data-tab="true"
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                background: activeTabId === tab.id ? ui.tabActive : "transparent",
                borderRadius: "4px",
                cursor: "pointer",
                color: ui.text,
                fontSize: "12px",
                userSelect: "none",
              }}
            >
              <span>{tab.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: ui.textMuted,
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#f38ba8";
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = ui.textMuted;
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            data-tab="true"
            onClick={() => initParams && createTerminal(initParams.host, initParams.port, initParams.username, initParams.connectionId)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              background: "transparent",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              color: ui.textMuted,
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        
        {/* Window controls */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={handleMinimize}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: ui.textMuted, padding: "4px", display: "flex", alignItems: "center" }}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: ui.textMuted, padding: "4px", display: "flex", alignItems: "center" }}
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: ui.textMuted, padding: "4px", display: "flex", alignItems: "center" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div
        style={{ flex: 1, position: "relative" }}
        onContextMenu={(event) => {
          event.preventDefault();
          openTerminalContextMenu(event.clientX, event.clientY);
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`terminal-${tab.id}`}
            style={{
              position: "absolute",
              inset: 0,
              display: activeTabId === tab.id ? "block" : "none",
              padding: "4px",
            }}
          />
        ))}

        {/* Connecting progress overlay */}
        {connecting && (
          <div className="term-connect-overlay" style={{ background: ui.bg, color: ui.text }}>
            <WanderingEyes
              className="term-connect-eyes"
              pupilColor={ui.accent}
              eyeColor={ui.textMuted}
            />
            <div className="term-connect-status">
              Connecting to {initParams?.host}:{initParams?.port}
            </div>
            <div className="term-connect-step">
              {CONNECT_STEPS[connectStep]?.label}
              {CONNECT_STEPS[connectStep]?.detail && (
                <span className="term-connect-detail"> — {CONNECT_STEPS[connectStep].detail}</span>
              )}
            </div>
            <button className="btn-secondary btn-sm" onClick={winClose}>
              Cancel
            </button>
          </div>
        )}

        {/* Connection error overlay */}
        {connectError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: ui.bg,
              gap: "16px",
              color: ui.text,
              padding: "32px",
              textAlign: "center",
              zIndex: 10,
            }}
          >
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)",
            }}>
              <span style={{ fontSize: "22px" }}>✕</span>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#ef4444" }}>
              Connection failed
            </div>
            <pre style={{
              fontSize: "12px", color: ui.textMuted,
              maxWidth: "480px", maxHeight: "120px", overflow: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: ui.bgSurface, padding: "12px 16px", borderRadius: "6px",
              border: `1px solid ${ui.border}`,
            }}>
              {connectError}
            </pre>
            <button
              onClick={winClose}
              style={{
                marginTop: "4px",
                padding: "8px 24px",
                background: ui.accent,
                border: "none",
                borderRadius: "6px",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#60a5fa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ui.accent; }}
            >
              Close window
            </button>
          </div>
        )}

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="app-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              className={`app-context-menu-item ${!hasActiveTerminal ? "app-context-menu-item--disabled" : ""}`}
              disabled={!hasActiveTerminal}
              onClick={() => void copyTerminalSelection()}
            >
              Copy
            </button>
            <button
              className={`app-context-menu-item ${!hasActiveTerminal ? "app-context-menu-item--disabled" : ""}`}
              disabled={!hasActiveTerminal}
              onClick={() => void pasteIntoTerminal()}
            >
              Paste
            </button>
            <button
              className={`app-context-menu-item ${!hasActiveTerminal ? "app-context-menu-item--disabled" : ""}`}
              disabled={!hasActiveTerminal}
              onClick={selectAllTerminalText}
            >
              Select all
            </button>
            <button
              className={`app-context-menu-item ${!hasActiveTerminal ? "app-context-menu-item--disabled" : ""}`}
              disabled={!hasActiveTerminal}
              onClick={clearTerminalScreen}
            >
              Clear screen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
