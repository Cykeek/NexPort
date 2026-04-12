export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  key_id?: string;
  group?: string;
  status?: "online" | "offline" | "unknown";
  detected_os?: string;
  /** True if a password is stored for this connection (backend-encrypted indicator). */
  has_password?: boolean;
}
