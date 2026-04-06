import { useState, useEffect, useCallback, useRef } from "react";
import { ConnectionProfile } from "@/types/connection";
import { loadConnections, deleteConnection, checkHostStatus, HostStatus } from "@/lib/connection-manager";

interface UseConnectionsReturn {
  connections: ConnectionProfile[];
  statuses: Record<string, HostStatus>;
  isLoading: boolean;
  search: string;
  setSearch: (value: string) => void;
  filtered: ConnectionProfile[];
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HostStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadConnections();
      setConnections(data);
    } catch (error) {
      console.error("Failed to load connections:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkStatuses = useCallback(async () => {
    if (connections.length === 0) return;
    
    const newStatuses: Record<string, HostStatus> = {};
    await Promise.all(
      connections.map(async (conn) => {
        try {
          const status = await checkHostStatus(conn.host, conn.port);
          newStatuses[conn.id] = status;
        } catch {
          newStatuses[conn.id] = "unknown";
        }
      })
    );
    setStatuses(newStatuses);
  }, [connections]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRefresh = () => refresh();
    window.addEventListener("refresh-connections", handleRefresh);
    return () => window.removeEventListener("refresh-connections", handleRefresh);
  }, [refresh]);

  useEffect(() => {
    if (connections.length > 0) {
      checkStatuses();
      
      intervalRef.current = setInterval(() => {
        checkStatuses();
      }, 10000);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [connections.length, checkStatuses]);

  const remove = useCallback(async (id: string) => {
    await deleteConnection(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    setStatuses((prev) => {
      const newStatuses = { ...prev };
      delete newStatuses[id];
      return newStatuses;
    });
  }, []);

  const filtered = connections.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.host.toLowerCase().includes(search.toLowerCase())
  );

  return {
    connections,
    statuses,
    isLoading,
    search,
    setSearch,
    filtered,
    refresh,
    remove,
  };
}
