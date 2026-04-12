"use client";

import { useState } from "react";
import { Plus, Search, Globe } from "lucide-react";
import { toast } from "sonner";
import { ConnectionProfile } from "@/types/connection";
import { useConnections } from "@/hooks/use-connections";
import { openSshTerminal } from "@/lib/connection-manager";
import { ConnectionDialog } from "./connection-dialog";
import { ConnectionCard } from "./connection-card";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function ConnectionsPage() {
  const { connections, statuses, search, setSearch, filtered, refresh, remove } = useConnections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<ConnectionProfile | null>(null);
  const [connectionToDelete, setConnectionToDelete] = useState<ConnectionProfile | null>(null);

  const handleConnect = async (conn: ConnectionProfile) => {
    const hasPassword = conn.auth_method === "password" && conn.has_password;
    const hasKey = conn.auth_method === "key" && conn.key_id;
    
    if (!hasPassword && !hasKey) {
      toast.warning("Missing credentials", { 
        description: "Please add a password or SSH key to connect" 
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
    await remove(connectionToDelete.id);
    toast.success("Connection deleted");
    setConnectionToDelete(null);
  };

  return (
    <div className="connections-page">
      <div className="connections-header">
        <div className="connections-header-left">
          <h1 className="connections-header-title">Connections</h1>
        </div>
        <div className="connections-header-right">
          <div className="connections-search">
            <Search className="connections-search-icon" size={14} />
            <input
              type="text"
              placeholder="Search connections..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => { setEditingConn(null); setDialogOpen(true); }}>
            <Plus size={14} /> Add Connection
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="connections-empty">
          <Globe className="connections-empty-icon" size={48} />
          <div className="connections-empty-title">No connections yet</div>
          <div className="connections-empty-desc">Add your first SSH server to get started</div>
          <button className="btn-primary" onClick={() => { setEditingConn(null); setDialogOpen(true); }}>
            <Plus size={14} /> Add Connection
          </button>
        </div>
      ) : (
        <div className="connections-grid">
          {filtered.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              status={statuses[conn.id] || conn.status || "unknown"}
              onConnect={handleConnect}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
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
