export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  encrypted_password?: string;
  key_id?: string;
  group?: string;
  status?: "online" | "offline" | "unknown";
  detected_os?: string;
}
