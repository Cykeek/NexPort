// Component sourced from React Bits: BorderGlow
import { Pencil, Zap } from "lucide-react";
import { ConnectionProfile } from "@/types/connection";
import type { HostStatus } from "@/stores/connection-store";
import { OSIcon } from "@/lib/os-icons";
import BorderGlow from "@/components/ui/BorderGlow";

interface ConnectionCardProps {
  connection: ConnectionProfile;
  status: HostStatus;
  onConnect: (conn: ConnectionProfile) => void;
  onEdit: (conn: ConnectionProfile) => void;
  onDelete: (conn: ConnectionProfile) => void;
  onSelect: (conn: ConnectionProfile) => void;
}

function getStatusColor(status: HostStatus): string {
  if (status === "online") return "var(--success)";
  if (status === "offline") return "var(--danger)";
  return "var(--text-muted)";
}

function getStatusText(status: HostStatus): string {
  if (status === "online") return "ONLINE";
  if (status === "offline") return "OFFLINE";
  return "UNKNOWN";
}

function getStatusClass(status: HostStatus): string {
  if (status === "online") return "conn-status--online";
  if (status === "offline") return "conn-status--offline";
  return "conn-status--unknown";
}

export function ConnectionCard({ connection, status, onConnect, onEdit, onSelect }: ConnectionCardProps) {
  return (
    <BorderGlow
      borderRadius={22}
      glowRadius={20}
      glowIntensity={0.6}
      edgeSensitivity={40}
      coneSpread={20}
      backgroundColor="var(--bg-elevated)"
      glowColor="245 60 70"
      colors={["#4F46E5", "#6366f1", "#818cf8"]}
      fillOpacity={0.3}
      className="conn-card-glow"
    >
      <div className="conn-card" onClick={() => onSelect(connection)}>
        {/* Status badge */}
        <div className={`conn-status-badge ${getStatusClass(status)}`}>
          <span className="conn-status-dot" style={{ backgroundColor: getStatusColor(status) }} />
          {getStatusText(status)}
        </div>

        {/* OS Icon */}
        <div className="conn-card-icon">
          <OSIcon os={connection.detected_os} size={40} />
        </div>

        {/* Connection info */}
        <div className="conn-card-info">
          <div className="conn-card-name">{connection.name}</div>
          <div className="conn-card-host">
            {connection.username}@{connection.host}{connection.port !== 22 ? `:${connection.port}` : ""}
          </div>
        </div>

        {/* Action buttons */}
        <div className="conn-card-btns">
          <button
            className="btn-secondary btn-full"
            onClick={(e) => { e.stopPropagation(); onEdit(connection); }}
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            className="btn-primary btn-full"
            onClick={(e) => { e.stopPropagation(); onConnect(connection); }}
          >
            <Zap size={14} />
            Connect
          </button>
        </div>
      </div>
    </BorderGlow>
  );
}
