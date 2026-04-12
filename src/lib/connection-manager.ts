import type { ConnectionProfile } from "@/types/connection";
import { connectionApi } from "@/lib/tauri-api";

export type { HostStatus } from "@/stores/connection-store";

export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  connectionId: string;
}

export async function openSshTerminal(params: ConnectParams): Promise<boolean> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { message } = await import("@tauri-apps/plugin-dialog");
  const windowLabel = `terminal-${params.connectionId}`;

  const existing = await WebviewWindow.getByLabel(windowLabel);
  if (existing) {
    await message(`A terminal for ${params.username}@${params.host} is already running.`, {
      title: "Terminal Already Open",
    }).catch(() => {});
    return false;
  }

  const searchParams = new URLSearchParams({
    host: params.host,
    port: String(params.port),
    username: params.username,
    connectionId: params.connectionId,
  });
  const terminalWindow = new WebviewWindow(windowLabel, {
    url: `/terminal?${searchParams.toString()}`,
    title: `${params.username}@${params.host} - SSH Terminal`,
    width: 800,
    height: 600,
    decorations: false,
    center: true,
  });

  return new Promise<boolean>((resolve, reject) => {
    terminalWindow.once("tauri://created", () => resolve(true));
    terminalWindow.once("tauri://error", (e) => reject(e));
  });
}
