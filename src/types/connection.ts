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
  /** Unix timestamp (seconds) of last successful connection. */
  last_connected?: string;
  /** Number of times this connection has been used. */
  session_count?: number;
  /** User-defined tags for categorization. */
  tags?: string[];
  /** SSH host key fingerprint (e.g. SHA256:...). */
  host_fingerprint?: string;
  /** Last measured TCP response time in milliseconds. */
  response_time_ms?: number;
}
