import { create } from "zustand";
import { ConnectionProfile } from "@/types/connection";
import { connectionApi } from "@/lib/tauri-api";
import { CONNECTION_CONFIG } from "@/config/constants";

export type HostStatus = "online" | "offline" | "unknown";

/** Maximum concurrent host status checks to avoid burst traffic. */
const MAX_CONCURRENT_CHECKS = 3;

interface Semaphore {
  queue: (() => void)[];
  available: number;
  acquire(): Promise<void>;
  release(): void;
}

function createSemaphore(limit: number): Semaphore {
  const queue: (() => void)[] = [];
  let available = limit;
  return {
    queue,
    available,
    acquire() {
      if (available > 0) {
        available--;
        return Promise.resolve();
      }
      return new Promise((resolve) => queue.push(resolve));
    },
    release() {
      available++;
      const next = queue.shift();
      if (next) next();
    },
  };
}

export interface ConnectionState {
  connections: ConnectionProfile[];
  statuses: Record<string, HostStatus>;
  isLoading: boolean;
  search: string;
  /** Filtered connections based on search term. */
  filtered: ConnectionProfile[];

  loadConnections: () => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setSearch: (value: string) => void;
  /** Start the periodic host status polling. */
  startPolling: () => void;
  /** Stop the periodic host status polling. */
  stopPolling: () => void;
  /** Force an immediate status check. */
  checkStatuses: () => Promise<void>;
}

/** Store interval ID so we can clear it from anywhere. */
let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  statuses: {},
  isLoading: false,
  search: "",
  filtered: [],

  loadConnections: async () => {
    set({ isLoading: true });
    try {
      const data = await connectionApi.loadAll();
      set({ connections: data });
    } catch (error) {
      console.error("Failed to load connections:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  deleteConnection: async (id: string) => {
    await connectionApi.delete(id);
    set((state) => {
      const newStatuses = { ...state.statuses };
      delete newStatuses[id];
      return {
        connections: state.connections.filter((c) => c.id !== id),
        statuses: newStatuses,
      };
    });
  },

  setSearch: (value: string) => {
    set({ search: value });
  },

  checkStatuses: async () => {
    const { connections } = get();
    if (connections.length === 0) return;

    const semaphore = createSemaphore(MAX_CONCURRENT_CHECKS);
    const newStatuses: Record<string, HostStatus> = {};

    await Promise.all(
      connections.map((conn) =>
        (async () => {
          await semaphore.acquire();
          try {
            const result = await connectionApi.checkHostStatus(conn.host, conn.port);
            newStatuses[conn.id] = result.status;
          } catch {
            newStatuses[conn.id] = "unknown";
          } finally {
            semaphore.release();
          }
        })()
      )
    );

    set({ statuses: newStatuses });
  },

  startPolling: () => {
    // Stop any existing interval first.
    get().stopPolling();

    // Run immediately, then on interval.
    get().checkStatuses();
    pollInterval = setInterval(() => {
      get().checkStatuses();
    }, CONNECTION_CONFIG.statusCheckIntervalMs);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },
}));

/** Computed: filtered connections based on search — derived outside store to avoid circular deps. */
export function getFilteredConnections(connections: ConnectionProfile[], search: string): ConnectionProfile[] {
  const term = search.toLowerCase();
  return connections.filter(
    (c) => c.name.toLowerCase().includes(term) || c.host.toLowerCase().includes(term)
  );
}
