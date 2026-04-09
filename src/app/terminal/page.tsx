"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { X, Plus, Minus, Square } from "lucide-react";
import { useWindowControls } from "@/hooks/use-window-controls";

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

export default function TerminalPage() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [initParams, setInitParams] = useState<InitParams | null>(null);
  const terminalsRef = useRef<Map<string, XTerm>>(new Map());
  const fitAddonsRef = useRef<Map<string, FitAddon>>(new Map());
  const pollingRef = useRef<Set<string>>(new Set());
  const { handleMinimize, handleMaximize, handleClose: winClose, dragRef } = useWindowControls();

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

  const createTerminal = async (host: string, port: number, username: string, connectionId?: string): Promise<TerminalTab | null> => {
    try {
      const sessionId = await invoke<string>("ssh_connect", {
        sessionId: crypto.randomUUID(),
        host,
        port,
        username,
        password: null,
        keyData: null,
        connectionId: connectionId || null,
      });

      if (connectionId) {
        invoke<string>("ssh_detect_os", { connectionId })
          .then((os) => {
            console.log("Detected OS:", os);
            if (os && os !== "unknown") {
              invoke("update_connection_os", { id: connectionId, os })
                .then(() => {
                  window.dispatchEvent(new CustomEvent("refresh-connections"));
                });
            }
          })
          .catch((e) => console.error("OS detection failed:", e));
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
      return null;
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

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Fira Code", "Consolas", monospace',
      theme: {
        background: "#08080d",
        foreground: "#c4c6d0",
        cursor: "#c4c6d0",
        selectionBackground: "#33467c",
        black: "#1e1e2e", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
        blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#cdd6f4",
        brightBlack: "#585b70", brightRed: "#f38ba8", brightGreen: "#a6e3a1", brightYellow: "#f9e2af",
        brightBlue: "#89b4fa", brightMagenta: "#f5c2e7", brightCyan: "#94e2d5", brightWhite: "#ffffff",
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new SearchAddon());
    term.loadAddon(new Unicode11Addon());
    term.open(container);
    term.unicode.activeVersion = "11";

    terminalsRef.current.set(tab.id, term);
    fitAddonsRef.current.set(tab.id, fitAddon);

    setTimeout(() => fitAddon.fit(), 50);

    term.onData(async (data) => {
      try {
        await invoke("ssh_write", { sessionId: tab.sessionId, data });
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
        const data = await invoke<string>("ssh_read", { 
          sessionId: tab.sessionId, 
          timeoutMs: 100 
        });
        
        // Check for EOF signal from backend
        if (data === "__EOF__") {
          console.log("Connection closed (EOF received), closing terminal");
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
          console.log("Connection lost, closing terminal...", String(e));
          handleConnectionLost(tab, term);
          return;
        }
      }
      
      // Continue polling
      if (pollingRef.current.has(tab.sessionId)) {
        setTimeout(poll, 50);
      }
    };
    poll();
  }, [winClose, activeTabId]);

  const pollOutput = useCallback(async (tabId: string, sessionId: string) => {
    if (!pollingRef.current.has(sessionId)) {
      return;
    }

    try {
      const data = await invoke<string>("ssh_read", { sessionId, timeoutMs: 50 });
      if (data) {
        const term = terminalsRef.current.get(tabId);
        if (term) {
          term.write(data);
        }
      }
    } catch (e) {
      console.error("Poll error:", e);
    }

    if (pollingRef.current.has(sessionId)) {
      setTimeout(() => pollOutput(tabId, sessionId), 30);
    }
  }, []);

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

  useEffect(() => {
    const handleResize = () => {
      fitAddonsRef.current.forEach((fitAddon, tabId) => {
        fitAddon.fit();
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
          const dims = fitAddon.proposeDimensions();
          if (dims && dims.cols && dims.rows) {
            invoke("ssh_resize", { sessionId: tab.sessionId, cols: dims.cols, rows: dims.rows }).catch(() => {});
          }
        }
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
        await invoke("ssh_disconnect", { sessionId: tab.sessionId });
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
    pollingRef.current.clear();
    for (const tab of tabs) {
      try {
        await invoke("ssh_disconnect", { sessionId: tab.sessionId });
      } catch {}
    }
    await winClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#08080d" }}>
      <div
        ref={dragRef}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px",
          background: "#1a1a24",
          borderBottom: "1px solid #333",
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
                background: activeTabId === tab.id ? "#333" : "transparent",
                borderRadius: "4px",
                cursor: "pointer",
                color: "#c4c6d0",
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
                  color: "#888",
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
                  e.currentTarget.style.color = "#888";
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
              color: "#888",
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
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#888", padding: "4px", display: "flex", alignItems: "center" }}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#888", padding: "4px", display: "flex", alignItems: "center" }}
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#888", padding: "4px", display: "flex", alignItems: "center" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
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
      </div>
    </div>
  );
}
