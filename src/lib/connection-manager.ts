import { invoke } from "@tauri-apps/api/core";
import { ConnectionProfile } from "@/types/connection";

export type HostStatus = "online" | "offline" | "unknown";

export async function checkHostStatus(host: string, port: number): Promise<HostStatus> {
  return invoke<HostStatus>("check_host_status", { host, port });
}

export async function saveConnection(profile: ConnectionProfile): Promise<void> {
  await invoke("save_connection", { profile });
}

export async function loadConnections(): Promise<ConnectionProfile[]> {
  return invoke<ConnectionProfile[]>("get_connections");
}

export async function deleteConnection(id: string): Promise<void> {
  await invoke("delete_connection", { id });
}

export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  connectionId: string;
}

export async function openSshTerminal(params: ConnectParams): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const searchParams = new URLSearchParams({
    host: params.host,
    port: String(params.port),
    username: params.username,
    connectionId: params.connectionId,
  });
  const terminalWindow = new WebviewWindow(`terminal-${params.connectionId}`, {
    url: `/terminal?${searchParams.toString()}`,
    title: `${params.username}@${params.host} - SSH Terminal`,
    width: 800,
    height: 600,
    decorations: false,
    center: true,
  });

  return new Promise((resolve, reject) => {
    terminalWindow.once("tauri://created", () => resolve());
    terminalWindow.once("tauri://error", (e) => reject(e));
  });
}
