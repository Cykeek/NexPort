import { Zap, Pencil, Trash2, Terminal } from "lucide-react";
import { ConnectionProfile } from "@/types/connection";
import { HostStatus } from "@/lib/connection-manager";
import { OSIcon } from "@/lib/os-icons";

interface ConnectionCardProps {
  connection: ConnectionProfile;
  status: HostStatus;
  onConnect: (conn: ConnectionProfile) => void;
  onEdit: (conn: ConnectionProfile) => void;
  onDelete: (conn: ConnectionProfile) => void;
}

function getStatusColor(status: HostStatus): string {
  if (status === "online") return "var(--success)";
  if (status === "offline") return "var(--text-muted)";
  return "var(--warning)";
}

function getStatusText(status: HostStatus): string {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Unknown";
}

export function ConnectionCard({ connection, status, onConnect, onEdit, onDelete }: ConnectionCardProps) {
  return (
    <div className="connection-card">
      <div className="connection-card-top">
        <div className="connection-card-icon">
          <OSIcon os={connection.detected_os} size={18} />
        </div>
        <div className="connection-card-meta">
          <div className="connection-card-status">
            <span className="status-indicator" style={{ backgroundColor: getStatusColor(status) }} />
            {getStatusText(status)}
          </div>
        </div>
        <div className="connection-card-actions">
          <button className="card-action-btn" onClick={() => onEdit(connection)} title="Edit">
            <Pencil size={14} />
          </button>
          <button className="card-action-btn danger" onClick={() => onDelete(connection)} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      
      <div className="connection-card-content">
        <div className="connection-card-name">{connection.name}</div>
        <div className="connection-card-host">{connection.username}@{connection.host}:{connection.port}</div>
      </div>
      
      <div className="connection-card-footer">
        <div className="connection-card-auth">
          <Terminal size={12} />
          {connection.auth_method === "key" ? "Key Auth" : "Password"}
        </div>
        <button className="connect-btn" onClick={() => onConnect(connection)}>
          <Zap size={14} />
          Connect
        </button>
      </div>
    </div>
  );
}
