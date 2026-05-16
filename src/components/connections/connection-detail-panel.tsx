"use client";

import {
  X,
  Server,
  Key,
  Globe,
  Terminal,
  Zap,
  Pencil,
  Trash2,
  Clock,
  Activity,
  Tag,
  Shield,
  Wifi,
} from "lucide-react";
import { ConnectionProfile } from "@/types/connection";
import type { HostStatus } from "@/stores/connection-store";
import { OSIcon } from "@/lib/os-icons";

interface ConnectionDetailPanelProps {
  connection: ConnectionProfile;
  status: HostStatus;
  onClose: () => void;
  onConnect: (conn: ConnectionProfile) => void;
  onEdit: (conn: ConnectionProfile) => void;
  onDelete: (conn: ConnectionProfile) => void;
}

function getStatusDotClass(status: HostStatus): string {
  if (status === "online") return "detail-status-dot--online";
  if (status === "offline") return "detail-status-dot--offline";
  return "detail-status-dot--unknown";
}

function getStatusLabel(status: HostStatus): string {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Unknown";
}

function formatLastConnected(timestamp?: string): string {
  if (!timestamp) return "Never";
  const secs = parseInt(timestamp);
  if (isNaN(secs)) return "Never";
  const date = new Date(secs * 1000);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function getIpType(host: string): string {
  if (host.includes(":")) return "IPv6";
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return "IPv4";
  return "Hostname";
}

export function ConnectionDetailPanel({
  connection,
  status,
  onClose,
  onConnect,
  onEdit,
  onDelete,
}: ConnectionDetailPanelProps) {
  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-panel">
        {/* Header */}
        <div className="detail-header">
          <div className="detail-header-left">
            <div className="detail-os-icon">
              <OSIcon os={connection.detected_os} size={32} />
            </div>
            <div>
              <div className="detail-name">{connection.name}</div>
              <div className="detail-host">
                {connection.username}@{connection.host}:{connection.port}
              </div>
            </div>
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Status */}
        <div className="detail-status-row">
          <span className={"detail-status-dot " + getStatusDotClass(status)} />
          <span className="detail-status-text">{getStatusLabel(status)}</span>
          {connection.response_time_ms != null && status === "online" && (
            <span className="detail-latency">
              {connection.response_time_ms}ms
            </span>
          )}
        </div>

        {/* Connection Details */}
        <div className="detail-section">
          <div className="detail-section-title">Connection Details</div>
          <div className="detail-info-grid">
            <div className="detail-info-item">
              <Globe size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Host</span>
                <span className="detail-info-value">{connection.host}</span>
              </div>
            </div>
            <div className="detail-info-item">
              <Server size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Port</span>
                <span className="detail-info-value">{connection.port}</span>
              </div>
            </div>
            <div className="detail-info-item">
              <Terminal size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Username</span>
                <span className="detail-info-value">{connection.username}</span>
              </div>
            </div>
            <div className="detail-info-item">
              <Key size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Auth Method</span>
                <span className="detail-info-value">
                  {connection.auth_method === "key" ? "SSH Key" : "Password"}
                </span>
              </div>
            </div>
            <div className="detail-info-item">
              <Wifi size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">IP Type</span>
                <span className="detail-info-value">
                  {getIpType(connection.host)}
                </span>
              </div>
            </div>
            {connection.detected_os && (
              <div className="detail-info-item">
                <Server size={14} className="detail-info-icon" />
                <div className="detail-info-content">
                  <span className="detail-info-label">OS</span>
                  <span className="detail-info-value">
                    {connection.detected_os}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Session Stats */}
        <div className="detail-section">
          <div className="detail-section-title">Session Stats</div>
          <div className="detail-info-grid">
            <div className="detail-info-item">
              <Clock size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Last Connected</span>
                <span className="detail-info-value">
                  {formatLastConnected(connection.last_connected)}
                </span>
              </div>
            </div>
            <div className="detail-info-item">
              <Activity size={14} className="detail-info-icon" />
              <div className="detail-info-content">
                <span className="detail-info-label">Total Connections</span>
                <span className="detail-info-value">
                  {connection.session_count || 0}
                </span>
              </div>
            </div>
            {connection.response_time_ms != null && (
              <div className="detail-info-item">
                <Zap size={14} className="detail-info-icon" />
                <div className="detail-info-content">
                  <span className="detail-info-label">Response Time</span>
                  <span className="detail-info-value">
                    {connection.response_time_ms}ms
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security */}
        {connection.host_fingerprint && (
          <div className="detail-section">
            <div className="detail-section-title">Security</div>
            <div className="detail-info-grid">
              <div className="detail-info-item">
                <Shield size={14} className="detail-info-icon" />
                <div className="detail-info-content">
                  <span className="detail-info-label">Host Fingerprint</span>
                  <span className="detail-info-value detail-fingerprint">
                    {connection.host_fingerprint}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        {connection.tags && connection.tags.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Tags</div>
            <div className="detail-tags">
              {connection.tags.map((tag) => (
                <span key={tag} className="detail-tag">
                  <Tag size={10} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="detail-actions">
          <button
            className="btn-primary btn-full"
            onClick={() => onConnect(connection)}
          >
            <Zap size={14} />
            Connect
          </button>
          <div className="detail-actions-row">
            <button
              className="btn-secondary btn-full"
              onClick={() => onEdit(connection)}
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              className="btn-danger btn-full"
              onClick={() => onDelete(connection)}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
