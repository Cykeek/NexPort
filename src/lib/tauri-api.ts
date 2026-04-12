/**
 * Type-safe wrappers for Tauri IPC commands.
 * 
 * Instead of raw `invoke("command_name", { ... })` calls,
 * use these typed functions which guarantee correct signatures at compile time.
 */

import { invoke } from "@tauri-apps/api/core";
import type { ConnectionProfile } from "@/types/connection";
import type { KeyInfo, KeyData } from "@/stores/key-store";

// ---------------------------------------------------------------------------
// SSH Terminal Commands
// ---------------------------------------------------------------------------

export interface SshConnectParams {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  password?: string | null;
  keyData?: string | null;
  connectionId?: string | null;
  trustOnFirstUse?: boolean;
}

export const sshApi = {
  /** Establish an SSH session and return its session ID. */
  connect(params: SshConnectParams): Promise<string> {
    return invoke("ssh_connect", { ...params });
  },

  /** Disconnect an active SSH session. */
  disconnect(sessionId: string): Promise<void> {
    return invoke("ssh_disconnect", { sessionId });
  },

  /** Check whether a session still exists in the backend map. */
  isConnected(sessionId: string): Promise<boolean> {
    return invoke("ssh_is_connected", { sessionId });
  },

  /** Resize the terminal of an active session. */
  resize(sessionId: string, cols: number, rows: number): Promise<void> {
    return invoke("ssh_resize", { sessionId, cols, rows });
  },

  /** Send keystroke data to the remote shell. */
  write(sessionId: string, data: string): Promise<void> {
    return invoke("ssh_write", { sessionId, data });
  },

  /** Read output from the remote shell (returns up to timeoutMs). */
  read(sessionId: string, timeoutMs?: number): Promise<string> {
    return invoke("ssh_read", { sessionId, timeoutMs });
  },

  /** Detect the OS of a saved connection via a temporary SSH session. */
  detectOs(connectionId: string): Promise<string> {
    return invoke("ssh_detect_os", { connectionId });
  },

  /** List all known host keys (TOFU entries). */
  listKnownHosts(): Promise<KnownHostEntry[]> {
    return invoke("list_known_hosts");
  },
};

/** A known SSH host key entry from the backend's known_hosts file. */
export interface KnownHostEntry {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// Connection Profile Commands
// ---------------------------------------------------------------------------

export type HostStatus = "online" | "offline" | "unknown";

export const connectionApi = {
  /** Check whether a host is reachable over TCP. */
  checkHostStatus(host: string, port: number): Promise<HostStatus> {
    return invoke("check_host_status", { host, port });
  },

  /** Save (create or update) a connection profile. */
  save(profile: ConnectionProfile): Promise<void> {
    return invoke("save_connection", { profile: { ...profile } });
  },

  /** Load all saved connection profiles. */
  loadAll(): Promise<ConnectionProfile[]> {
    return invoke("get_connections");
  },

  /** Delete a saved connection profile. */
  delete(id: string): Promise<void> {
    return invoke("delete_connection", { id });
  },

  /** Update the detected OS for a saved connection. */
  updateOs(id: string, os: string): Promise<void> {
    return invoke("update_connection_os", { id, os });
  },
};

// ---------------------------------------------------------------------------
// SSH Key Commands
// ---------------------------------------------------------------------------

export const keyApi = {
  /** List all stored SSH keys (metadata only — no private key data). */
  list(): Promise<KeyInfo[]> {
    return invoke("list_keys");
  },

  /** Generate a new SSH key pair (ed25519 or rsa). */
  generate(name: string, keyType: string, passphrase?: string): Promise<KeyInfo> {
    return invoke("generate_key", { name, keyType, passphrase });
  },

  /** Import an existing private key from its PEM text. */
  import(name: string, keyData: string): Promise<KeyInfo> {
    return invoke("import_key", { name, keyData });
  },

  /** Update the display name of a stored key. */
  updateName(id: string, name: string): Promise<void> {
    return invoke("update_key", { id, name });
  },

  /** Replace the stored private key material. */
  updateKeyData(id: string, name: string, keyData: string): Promise<void> {
    return invoke("update_key_with_new_key", { id, name, keyData });
  },

  /** Delete a stored SSH key. */
  delete(id: string): Promise<void> {
    return invoke("delete_key", { id });
  },

  /** Retrieve full key data including the decrypted private key. */
  getData(id: string): Promise<KeyData | null> {
    return invoke("get_key_data", { id });
  },
};
