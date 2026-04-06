export interface TerminalSession {
  id: string;
  connectionId: string;
  name: string;
  host: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  cols: number;
  rows: number;
}
