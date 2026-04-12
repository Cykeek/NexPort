/**
 * Thin wrapper around the Zustand connection store that provides
 * a React-friendly API with computed filtered results and auto-starts polling.
 */
import { useEffect, useMemo } from "react";
import {
  useConnectionStore,
  getFilteredConnections,
  ConnectionState,
} from "@/stores/connection-store";

interface UseConnectionsReturn {
  connections: ConnectionState["connections"];
  statuses: ConnectionState["statuses"];
  isLoading: ConnectionState["isLoading"];
  search: ConnectionState["search"];
  setSearch: ConnectionState["setSearch"];
  filtered: ReturnType<typeof getFilteredConnections>;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useConnections(): UseConnectionsReturn {
  const connections = useConnectionStore((s) => s.connections);
  const statuses = useConnectionStore((s) => s.statuses);
  const isLoading = useConnectionStore((s) => s.isLoading);
  const search = useConnectionStore((s) => s.search);
  const setSearch = useConnectionStore((s) => s.setSearch);
  const loadConnections = useConnectionStore((s) => s.loadConnections);
  const deleteConnection = useConnectionStore((s) => s.deleteConnection);
  const startPolling = useConnectionStore((s) => s.startPolling);
  const stopPolling = useConnectionStore((s) => s.stopPolling);

  // Load connections on mount.
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Start/stop polling based on whether there are connections.
  useEffect(() => {
    if (connections.length > 0) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [connections.length, startPolling, stopPolling]);

  // Listen for manual refresh events (e.g. after OS detection).
  useEffect(() => {
    const handleRefresh = () => loadConnections();
    window.addEventListener("refresh-connections", handleRefresh);
    return () => window.removeEventListener("refresh-connections", handleRefresh);
  }, [loadConnections]);

  const filtered = useMemo(
    () => getFilteredConnections(connections, search),
    [connections, search]
  );

  return {
    connections,
    statuses,
    isLoading,
    search,
    setSearch,
    filtered,
    refresh: loadConnections,
    remove: deleteConnection,
  };
}
