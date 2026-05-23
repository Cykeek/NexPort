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

};

// ---------------------------------------------------------------------------
// Connection Profile Commands
// ---------------------------------------------------------------------------

export type HostStatus = "online" | "offline" | "unknown";

interface HostCheckResult {
  status: HostStatus;
  response_time_ms: number | null;
}

export const connectionApi = {
  /** Check whether a host is reachable over TCP. Returns status and response time. */
  async checkHostStatus(
    host: string,
    port: number,
  ): Promise<{ status: HostStatus; responseTimeMs: number | null }> {
    const result = await invoke<HostCheckResult>("check_host_status", {
      host,
      port,
    });
    return { status: result.status, responseTimeMs: result.response_time_ms };
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

  /** Record a successful connection session (updates last_connected, session_count, fingerprint, response_time). */
  recordSession(
    id: string,
    fingerprint?: string,
    responseTimeMs?: number,
  ): Promise<ConnectionProfile> {
    return invoke("record_connection_session", {
      id,
      fingerprint: fingerprint ?? null,
      responseTimeMs: responseTimeMs ?? null,
    });
  },

};

// ---------------------------------------------------------------------------
// Network Meter Commands
// ---------------------------------------------------------------------------

export interface NetworkCounters {
  rxBytesTotal: number;
  txBytesTotal: number;
  interfaceCount: number;
}

interface NetworkCountersRaw {
  rx_bytes_total: number;
  tx_bytes_total: number;
  interface_count: number;
}

export const networkApi = {
  /** Returns cumulative RX/TX counters across non-loopback interfaces. */
  async getCounters(): Promise<NetworkCounters> {
    const raw = await invoke<NetworkCountersRaw>("get_network_counters");
    return {
      rxBytesTotal: raw.rx_bytes_total,
      txBytesTotal: raw.tx_bytes_total,
      interfaceCount: raw.interface_count,
    };
  },
};

// ---------------------------------------------------------------------------
// SFTP Commands
// ---------------------------------------------------------------------------

export interface SftpFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  modifiedAt: number | null;
}

interface LocalDirListingRaw {
  path: string;
  parentPath: string | null;
  entries: SftpFileEntry[];
}

interface RemoteDirListingRaw {
  path: string;
  entries: SftpFileEntry[];
}

export interface LocalDirListing {
  path: string;
  parentPath: string | null;
  entries: SftpFileEntry[];
}

export interface RemoteDirListing {
  path: string;
  entries: SftpFileEntry[];
}

export interface UploadResult {
  remotePath: string;
  bytesUploaded: number;
}

export interface DownloadResult {
  localPath: string;
  bytesDownloaded: number;
}

export interface TransferDirResult {
  itemsTransferred: number;
  totalBytes: number;
}

export interface TransferProgress {
  fileName: string;
  bytesSent: number;
  totalBytes: number;
  speed: number | null;
  diskSpeed?: number | null;
}

export interface DeleteProgress {
  fileName: string;
  itemsDeleted: number;
  totalItems: number;
  bytesProcessed: number;
  totalBytes: number;
  currentFileBytesProcessed: number;
  currentFileTotalBytes: number;
  speed: number | null;
  diskSpeed?: number | null;
  phase: "scanning" | "deleting";
}

export interface DriveInfo {
  name: string;
  mountPoint: string;
  totalSpace: number;
  availableSpace: number;
  fileSystem: string;
  isRemovable: boolean;
}

export interface RemoteFileStat {
  name: string;
  path: string;
  size: number | null;
  isDir: boolean;
  modifiedAt: number | null;
  accessedAt: number | null;
  permissions: number | null;
  uid: number | null;
  user: string | null;
  gid: number | null;
  group: string | null;
}

export const sftpApi = {
  connect(
    sessionId: string,
    connectionId: string,
    trustOnFirstUse = true,
  ): Promise<string> {
    return invoke("sftp_connect", { sessionId, connectionId, trustOnFirstUse });
  },

  disconnect(sessionId: string): Promise<void> {
    return invoke("sftp_disconnect", { sessionId });
  },

  async listLocalDrives(): Promise<DriveInfo[]> {
    return invoke<DriveInfo[]>("sftp_list_local_drives");
  },

  async listLocalDir(path?: string): Promise<LocalDirListing> {
    return invoke<LocalDirListing>("sftp_list_local_dir", {
      path: path ?? null,
    });
  },

  async listRemoteDir(
    sessionId: string,
    path?: string,
  ): Promise<RemoteDirListing> {
    return invoke<RemoteDirListing>("sftp_list_remote_dir", {
      sessionId,
      path: path ?? null,
    });
  },

  async getRemoteHome(sessionId: string): Promise<string> {
    return invoke<string>("sftp_get_remote_home", { sessionId });
  },

  async uploadFile(
    sessionId: string,
    localPath: string,
    remoteDir: string,
    overwrite = false,
  ): Promise<UploadResult> {
    return invoke<UploadResult>("sftp_upload_file", {
      sessionId,
      localPath,
      remoteDir,
      overwrite,
    });
  },

  cancelUpload(sessionId: string): Promise<void> {
    return invoke("sftp_cancel_upload", { sessionId });
  },

  cancelDownload(sessionId: string): Promise<void> {
    return invoke("sftp_cancel_download", { sessionId });
  },

  mkdirRemote(sessionId: string, path: string): Promise<void> {
    return invoke("sftp_mkdir_remote", { sessionId, path });
  },

  async downloadFile(
    sessionId: string,
    remotePath: string,
    localDir: string,
  ): Promise<{ localPath: string; bytesDownloaded: number }> {
    return invoke("sftp_download_file", { sessionId, remotePath, localDir });
  },

  async uploadDir(
    sessionId: string,
    localPath: string,
    remoteDir: string,
  ): Promise<{ itemsTransferred: number; totalBytes: number }> {
    return invoke("sftp_upload_dir", { sessionId, localPath, remoteDir });
  },

  async downloadDir(
    sessionId: string,
    remotePath: string,
    localDir: string,
  ): Promise<{ itemsTransferred: number; totalBytes: number }> {
    return invoke("sftp_download_dir", { sessionId, remotePath, localDir });
  },

  deleteRemotePath(sessionId: string, path: string, isDir: boolean): Promise<void> {
    return invoke("sftp_delete_remote_path", { sessionId, path, isDir });
  },

  cancelDelete(targetPath: string): Promise<void> {
    return invoke("sftp_cancel_delete", { targetPath });
  },

  deleteLocalPath(path: string, isDir: boolean): Promise<void> {
    return invoke("sftp_delete_local_path", { path, isDir });
  },

  renameRemote(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    return invoke("sftp_rename_remote", { sessionId, oldPath, newPath });
  },

  renameLocal(oldPath: string, newPath: string): Promise<void> {
    return invoke("sftp_rename_local", { oldPath, newPath });
  },

  async statRemote(sessionId: string, path: string): Promise<RemoteFileStat> {
    return invoke<RemoteFileStat>("sftp_stat_remote", { sessionId, path });
  },

  mkdirLocal(path: string): Promise<void> {
    return invoke("sftp_mkdir_local", { path });
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
  generate(
    name: string,
    keyType: string,
    passphrase?: string,
  ): Promise<KeyInfo> {
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
