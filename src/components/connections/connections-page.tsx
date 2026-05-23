"use client";

import { useState } from "react";
import { Plus, Search, SlidersHorizontal, Globe } from "lucide-react";
import { toast } from "sonner";
import { ConnectionProfile } from "@/types/connection";
import { useConnections } from "@/hooks/use-connections";
import { openSshTerminal } from "@/lib/connection-manager";
import { ConnectionDialog } from "./connection-dialog";
import { ConnectionCard } from "./connection-card";
import { ConnectionDetailPanel } from "./connection-detail-panel";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { WanderingEyes } from "@/components/ui/wandering-eyes";

type FilterMode = "all" | "online" | "offline";

export function ConnectionsPage() {
  const { connections, statuses, isLoading, search, setSearch, filtered, refresh, remove } = useConnections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<ConnectionProfile | null>(null);
  const [connectionToDelete, setConnectionToDelete] = useState<ConnectionProfile | null>(null);
  const [selectedConn, setSelectedConn] = useState<ConnectionProfile | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

  const handleConnect = async (conn: ConnectionProfile) => {
    const hasPassword = conn.auth_method === "password" && conn.has_password;
    const hasKey = conn.auth_method === "key" && conn.key_id;

    if (!hasPassword && !hasKey) {
      toast.warning("Missing credentials", {
        description: "Please add a password or SSH key to connect",
      });
      return;
    }

    try {
      const opened = await openSshTerminal({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        connectionId: conn.id,
      });
      if (opened) {
        toast.success("Connecting...", { description: conn.name });
      }
    } catch (e) {
      toast.error("Failed to connect", { description: String(e) });
    }
  };

  const handleEdit = (conn: ConnectionProfile) => {
    setEditingConn(conn);
    setDialogOpen(true);
  };

  const handleDelete = (conn: ConnectionProfile) => {
    setConnectionToDelete(conn);
  };

  const executeDelete = async () => {
    if (!connectionToDelete) return;
    try {
      await remove(connectionToDelete.id);
      toast.success("Connection deleted");
      setConnectionToDelete(null);
    } catch {
      toast.error("Failed to delete connection");
    }
  };

  // Apply status filter on top of search filter
  const displayConnections = filtered.filter((conn) => {
    if (filter === "all") return true;
    const s = statuses[conn.id] || conn.status || "unknown";
    return s === filter;
  });

  return (
    <div className="connections-page page-fade-in">
      {/* Loading State */}
      {isLoading ? (
        <div className="conn-loading">
          <div className="conn-loading-text">
            Discovering your servers...
          </div>
          <WanderingEyes
            className="conn-loading-eyes"
            pupilColor="var(--accent)"
            eyeColor="var(--text-muted)"
          />
        </div>
      ) : (
      <>
      {/* Page Title */}
      <div className="conn-page-header">
        <h1 className="conn-page-title">Connections</h1>
      </div>

      {/* Search + Actions Row */}
      <div className="conn-toolbar">
        <div className="conn-search">
          <Search className="conn-search-icon" size={16} />
          <input
            type="text"
            placeholder="Search connections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary conn-filter-btn">
          <SlidersHorizontal size={14} />
          Filter
        </button>
        <button
          className="btn-primary"
          onClick={() => { setEditingConn(null); setDialogOpen(true); }}
        >
          <Plus size={14} /> New Server
        </button>
      </div>

      {/* Filter Pills */}
      <div className="conn-filters">
        <button
          className={`conn-filter-pill ${filter === "all" ? "conn-filter-pill--active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`conn-filter-pill ${filter === "online" ? "conn-filter-pill--active" : ""}`}
          onClick={() => setFilter("online")}
        >
          <span className="conn-filter-dot conn-filter-dot--online" />
          Online
        </button>
        <button
          className={`conn-filter-pill ${filter === "offline" ? "conn-filter-pill--active" : ""}`}
          onClick={() => setFilter("offline")}
        >
          <span className="conn-filter-dot conn-filter-dot--offline" />
          Offline
        </button>
      </div>

      {/* Grid or Empty State */}
      {displayConnections.length === 0 ? (
        <div className="connections-empty">
          <Globe className="connections-empty-icon" size={48} />
          <div className="connections-empty-title">No connections yet</div>
          <div className="connections-empty-desc">
            Add your first SSH server to get started
          </div>
          <button
            className="btn-primary"
            onClick={() => { setEditingConn(null); setDialogOpen(true); }}
          >
            <Plus size={14} /> New Server
          </button>
        </div>
      ) : (
        <div className="conn-grid">
          {displayConnections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              status={statuses[conn.id] || conn.status || "unknown"}
              onConnect={handleConnect}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSelect={(c) => setSelectedConn(c)}
            />
          ))}
        </div>
      )}

      </>
      )}

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingConn(null);
        }}
        editConnection={editingConn}
        onSuccess={() => refresh()}
      />

      {selectedConn && (
        <ConnectionDetailPanel
          connection={connections.find(c => c.id === selectedConn.id) || selectedConn}
          status={statuses[selectedConn.id] || selectedConn.status || "unknown"}
          onClose={() => setSelectedConn(null)}
          onConnect={(c) => { setSelectedConn(null); handleConnect(c); }}
          onEdit={(c) => { setSelectedConn(null); handleEdit(c); }}
          onDelete={(c) => { setSelectedConn(null); handleDelete(c); }}
        />
      )}

      {connectionToDelete && (
        <DeleteConfirmDialog
          connection={connectionToDelete}
          onConfirm={executeDelete}
          onCancel={() => setConnectionToDelete(null)}
        />
      )}
    </div>
  );
}
