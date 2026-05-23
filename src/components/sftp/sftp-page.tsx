"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Folder,
  File,
  Upload,
  Link2,
  Unplug,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FolderPlus,
  ChevronDown,
  ArrowRight,
  HardDrive,
  Trash2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  connectionApi,
  sftpApi,
  type SftpFileEntry,
  type DriveInfo,
  type TransferProgress,
  type DeleteProgress,
  type RemoteFileStat,
} from "@/lib/tauri-api";
import type { ConnectionProfile } from "@/types/connection";
import { WanderingEyes } from "@/components/ui/wandering-eyes";

const NAME_WIDTHS = ["55%", "70%", "45%", "60%"];

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="sftp-item--minimal"
          style={{ pointerEvents: "none" }}
        >
          <div className="skeleton-box" style={{ width: 14, height: 14, borderRadius: 4 }} />
          <div className="skeleton-box" style={{ width: NAME_WIDTHS[i % NAME_WIDTHS.length], height: 13, borderRadius: 4 }} />
          <div className="skeleton-box" style={{ width: 40, height: 12, borderRadius: 4, justifySelf: "end" }} />
          <div className="skeleton-box" style={{ width: 55, height: 12, borderRadius: 4, justifySelf: "end" }} />
        </div>
      ))}
    </>
  );
}

function formatBytes(value?: number | null): string {
  if (value == null) return "-";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRate(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "--";

  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"] as const;
  let nextValue = value;
  let unitIndex = 0;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const decimals = nextValue >= 100 ? 0 : nextValue >= 10 ? 1 : 2;
  const rounded = Number(nextValue.toFixed(decimals));

  return `${rounded} ${units[unitIndex]}`;
}

function parseBreadcrumbSegments(
  path: string,
  type: "local" | "remote",
  rootPath?: string,
): Array<{ label: string; path: string }> {
  const allSegments: Array<{ path: string; label: string }> = [];
  if (type === "local") {
    const raw = path.trim();
    if (!raw) return [{ label: "Local", path: "" }];

    const isWindowsStyle =
      /^[A-Za-z]:([\\/]|$)/.test(raw) || raw.startsWith("\\\\");
    if (isWindowsStyle) {
      const parts = raw.replace(/\//g, "\\").split(/\\+/).filter(Boolean);
      let currentPath = raw.startsWith("\\\\") ? "\\\\" : "";
      for (const part of parts) {
        const isDriveSegment =
          /^[A-Za-z]:$/.test(part) && currentPath.length === 0;
        if (isDriveSegment) {
          currentPath = `${part}\\`;
        } else if (currentPath === "\\\\") {
          currentPath = `\\\\${part}`;
        } else if (currentPath.endsWith("\\")) {
          currentPath = `${currentPath}${part}`;
        } else {
          currentPath = `${currentPath}\\${part}`;
        }
        allSegments.push({ label: part, path: currentPath });
      }
    } else {
      const normalized = raw.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);
      let currentPath = normalized.startsWith("/") ? "/" : "";
      if (currentPath === "/") {
        allSegments.push({ label: "/", path: "/" });
      }
      for (const part of parts) {
        if (currentPath === "/") {
          currentPath = `/${part}`;
        } else if (currentPath) {
          currentPath = `${currentPath}/${part}`;
        } else {
          currentPath = part;
        }
        allSegments.push({ label: part, path: currentPath });
      }
    }
  } else {
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
      allSegments.push({ label: part, path: currentPath });
    }
  }

  if (!rootPath) {
    const rootLabel = type === "local" ? "Local" : "Remote";
    return [{ label: rootLabel, path: "" }, ...allSegments];
  }

  const pathDrive = path.match(/^([A-Za-z]):/)?.[1]?.toUpperCase();
  const rootPathDrive = rootPath.match(/^([A-Za-z]):/)?.[1]?.toUpperCase();
  if (pathDrive && rootPathDrive && pathDrive !== rootPathDrive) {
    const rootLabel = type === "local" ? "Local" : "Remote";
    return [{ label: rootLabel, path: "" }, ...allSegments];
  }

  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  const startIdx = allSegments.findIndex((s) => {
    const sp = s.path.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
    return sp === normalizedRoot;
  });

  if (startIdx === -1) {
    return [{ label: "Home", path: rootPath }, ...allSegments];
  }

  const filtered = allSegments.slice(startIdx + 1);
  return [{ label: "Home", path: rootPath }, ...filtered];
}

function getDriveLetter(path: string): string {
  const match = path && path.match(/^([A-Za-z]):/);
  return match ? match[1].toUpperCase() : "";
}

const CONNECT_STEPS = [
  { label: "Resolving host", detail: "Looking up the remote server" },
  { label: "Establishing connection", detail: "TCP handshake" },
  { label: "Negotiating protocol", detail: "SSH key exchange" },
  { label: "Authenticating", detail: "Verifying credentials" },
  { label: "Initializing SFTP", detail: "Opening subsystem" },
  { label: "Loading directory", detail: "Fetching remote files" },
] as const;

type ContextPane = "local" | "remote";

interface SftpContextMenuState {
  pane: ContextPane;
  x: number;
  y: number;
  entry: SftpFileEntry | null;
}

interface PromptDialogState {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
}

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface PropertiesDialogState {
  entry: SftpFileEntry;
  stat: RemoteFileStat | null;
  loading: boolean;
}

interface TransferState {
  progress: TransferProgress | null;
  active: boolean;
  canceling: boolean;
  startTime: number;
  lastBytes: number;
  lastTime: number;
}

interface DeleteState {
  progress: DeleteProgress | null;
  active: boolean;
  canceling: boolean;
  startTime: number;
  lastBytes: number;
  lastTime: number;
  targetPath: string;
  deletionStarted: boolean;
}

function createTransferState(): TransferState {
  return {
    progress: null,
    active: false,
    canceling: false,
    startTime: 0,
    lastBytes: 0,
    lastTime: 0,
  };
}

function calcSpeed(
  current: TransferState,
  bytesSent: number,
  now: number,
  backendSpeed?: number,
): number {
  if (backendSpeed != null && backendSpeed > 0) return backendSpeed;
  const timeDelta = (now - current.lastTime) / 1000;
  if (timeDelta > 0 && current.lastTime > 0)
    return (bytesSent - current.lastBytes) / timeDelta;
  if (current.startTime > 0) {
    const elapsed = (now - current.startTime) / 1000;
    if (elapsed > 0) return bytesSent / elapsed;
  }
  return 0;
}

function setDragGhost(event: React.DragEvent, name: string) {
  const ghost = document.createElement("div");
  ghost.className = "sftp-drag-ghost";
  ghost.textContent = name;
  ghost.style.cssText = "position:absolute;top:-1000px;left:-1000px;";
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 20, 20);
  setTimeout(() => document.body.removeChild(ghost), 0);
}

const MinimalTransferBar = memo(function MinimalTransferBar({
  upload,
  download,
  onCancelUpload,
  onCancelDownload,
}: {
  upload: TransferState;
  download: TransferState;
  onCancelUpload: () => void;
  onCancelDownload: () => void;
}) {
  const active =
    upload.active && upload.progress
      ? upload
      : download.active && download.progress
        ? download
        : null;
  const isUpload = active === upload;

  if (!active || !active.progress) {
    return null;
  }

  const { fileName, bytesSent, totalBytes, speed, diskSpeed } = active.progress;
  const pct =
    totalBytes > 0
      ? Math.min(100, Math.round((bytesSent / totalBytes) * 100))
      : 0;
  const speedStr = speed && speed > 0 ? formatBytes(speed) + "/s" : "--";
  const diskSpeedStr = diskSpeed ? formatRate(diskSpeed) : null;
  const isCanceling = active.canceling;

  return (
    <div className="sftp-status-bar-minimal">
      <div className="sftp-status-group">
        <div className="sftp-status-indicator active" />
        <span className="sftp-status-label">
          {isUpload ? "Uploading" : "Downloading"}
        </span>
        <span className="sftp-status-count">{pct}%</span>
      </div>
      <span className="sftp-status-filename" title={fileName}>
        {fileName}
      </span>
      <div className="sftp-status-progress-mini">
        <div
          className="sftp-status-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="sftp-status-meta">
        <span className="sftp-status-size">
          {formatBytes(bytesSent)} / {formatBytes(totalBytes)}
        </span>
        <span className="sftp-status-speed">
          {isUpload ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          <span>{speedStr}</span>
          {diskSpeedStr && (
            <span className="sftp-status-disk"> | Disk: {diskSpeedStr}</span>
          )}
        </span>
      </div>
      <button
        className="sftp-status-cancel-btn"
        onClick={isUpload ? onCancelUpload : onCancelDownload}
        disabled={isCanceling}
      >
        {isCanceling ? "Canceling..." : "Cancel"}
      </button>
    </div>
  );
});

const DeleteProgressBar = memo(function DeleteProgressBar({
  state,
  onCancel,
}: {
  state: DeleteState;
  onCancel: () => void;
}) {
  const maxFoundRef = useRef(0);
  const smoothedRef = useRef(0);

  if (!state.active || !state.progress) {
    return null;
  }

  const {
    fileName,
    itemsDeleted,
    totalItems,
    currentFileBytesProcessed,
    currentFileTotalBytes,
    phase,
    diskSpeed,
  } = state.progress;
  const isScanning = phase === "scanning";
  const safeCurrentTotal = Math.max(1, currentFileTotalBytes || 0);
  const filePct = isScanning
    ? 0
    : Math.min(
        100,
        Math.round(((currentFileBytesProcessed || 0) / safeCurrentTotal) * 100),
      );
  if (diskSpeed != null && diskSpeed > 0) {
    smoothedRef.current = smoothedRef.current * 0.7 + diskSpeed * 0.3;
  } else {
    smoothedRef.current *= 0.9;
  }
  const speed = smoothedRef.current > 0.5 ? smoothedRef.current : state.progress.speed;
  const speedText = speed && speed > 0 ? formatRate(speed) : null;
  const isCanceling = state.canceling;
  if (isScanning) {
    if (itemsDeleted === 0) maxFoundRef.current = 0;
    else if (itemsDeleted > maxFoundRef.current) maxFoundRef.current = itemsDeleted;
  }
  const effectiveTotal = totalItems > 0 ? totalItems : maxFoundRef.current;
  const statusText = isScanning
    ? `${itemsDeleted} items found`
    : effectiveTotal > 0
      ? `${effectiveTotal} items found / ${Math.min(itemsDeleted + 1, effectiveTotal)} file deleting`
      : `${itemsDeleted} items deleted`;

  return (
    <div
      className={`sftp-status-bar-minimal ${isScanning ? "scanning" : "deleting"}`}
    >
      <div className="sftp-status-group">
        <div
          className={`sftp-status-indicator ${isScanning ? "scanning" : "deleting"}`}
        />
        <span className="sftp-status-label">
          {isScanning ? "Scanning" : "Deleting"}
        </span>
        <span className="sftp-status-count">{statusText}</span>
      </div>
      {isScanning ? (
        <div className="sftp-status-ticker" title={fileName}>
          <div className="sftp-status-ticker-column">
            <span key={fileName} className="sftp-status-ticker-row sftp-status-ticker-row--enter">
              Found: {fileName}
            </span>
          </div>
        </div>
      ) : (
        <>
          <span className="sftp-status-filename" title={fileName}>
            {fileName}
          </span>
          <div className="sftp-status-progress-mini">
            <div
              className="sftp-status-progress-fill"
              style={{ width: `${filePct}%` }}
            />
          </div>
          {speedText && <span className="sftp-status-speed">{speedText}</span>}
        </>
      )}
      <button
        className="sftp-status-cancel-btn"
        onClick={onCancel}
        disabled={isCanceling}
      >
        {isCanceling ? "Canceling..." : "Cancel"}
      </button>
    </div>
  );
});

function SftpPromptDialog({
  state,
  onClose,
}: {
  state: PromptDialogState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(state.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus and select text on mount
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      state.onSubmit(trimmed);
      onClose();
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="prompt-dialog-title">
        <div className="modal-dialog modal-dialog--sm">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h2 className="modal-title" id="prompt-dialog-title">{state.title}</h2>
            </div>
            <div className="modal-body">
              <input
                ref={inputRef}
                className="form-input"
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={state.placeholder}
                aria-label={state.title}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!value.trim()}
              >
                OK
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function SftpConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmDialogState;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-desc">
        <div className="modal-dialog modal-dialog--sm">
          <div className="modal-header">
            <div>
              <h2 className="modal-title" id="confirm-dialog-title">{state.title}</h2>
              <p className="modal-subtitle" id="confirm-dialog-desc">{state.description}</p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className={state.danger ? "btn-danger" : "btn-primary"}
              onClick={() => {
                state.onConfirm();
                onClose();
              }}
            >
              {state.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function useTransferListener(
  event: string,
  setter: React.Dispatch<React.SetStateAction<TransferState>>,
) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    let rafId = 0;
    let pending: TransferProgress | null = null;

    const flush = () => {
      if (!pending || !mounted) return;
      const { fileName, bytesSent, totalBytes, speed, diskSpeed } = pending;
      const now = performance.now();
      setter((prev) => {
        const effectiveSpeed = speed ?? calcSpeed(prev, bytesSent, now);
        return {
          ...prev,
          progress: { fileName, bytesSent, totalBytes, speed: effectiveSpeed, diskSpeed },
          lastBytes: bytesSent,
          lastTime: now,
        };
      });
      pending = null;
    };

    const scheduleFlush = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        flush();
      });
    };

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!mounted) return;
        unlisten = await listen<TransferProgress>(event, (ev) => {
          pending = ev.payload;
          scheduleFlush();
        });
      } catch {
        /* Not in Tauri */
      }
    })();
    return () => {
      mounted = false;
      if (unlisten) unlisten();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [event, setter]);
}

function useDeleteListener(
  setter: React.Dispatch<React.SetStateAction<DeleteState>>,
) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    let rafId = 0;
    let pending: DeleteProgress | null = null;

    const flush = () => {
      if (!pending || !mounted) return;
      const {
        fileName,
        itemsDeleted,
        totalItems,
        bytesProcessed,
        totalBytes,
        currentFileBytesProcessed,
        currentFileTotalBytes,
        speed,
        diskSpeed,
        phase,
      } = pending;
      const now = performance.now();
      setter((prev) => {
        if (!prev.active) return prev;
        const isTransitioning = phase === "deleting" && !prev.deletionStarted;
        const timeDelta = (now - prev.lastTime) / 1000;
        const effectiveSpeed =
          speed ??
          (timeDelta > 0 && prev.lastTime > 0
            ? (bytesProcessed - prev.lastBytes) / timeDelta
            : null);
        return {
          ...prev,
          progress: {
            fileName,
            itemsDeleted,
            totalItems,
            bytesProcessed,
            totalBytes,
            currentFileBytesProcessed,
            currentFileTotalBytes,
            speed: effectiveSpeed,
            diskSpeed,
            phase,
          },
          lastBytes: isTransitioning ? 0 : bytesProcessed,
          lastTime: isTransitioning ? now : now,
          deletionStarted: phase === "deleting" || prev.deletionStarted,
        };
      });
      pending = null;
    };

    const scheduleFlush = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        flush();
      });
    };

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!mounted) return;
        unlisten = await listen<DeleteProgress>(
          "sftp-delete-progress",
          (ev) => {
            pending = ev.payload;
            scheduleFlush();
          },
        );
      } catch {
        /* Not in Tauri */
      }
    })();
    return () => {
      mounted = false;
      if (unlisten) unlisten();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [setter]);
}

export function SftpPage() {
  const [connections, setConnections] = useState<ConnectionProfile[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectingSessionId, setConnectingSessionId] = useState<string | null>(
    null,
  );
  const sessionIdRef = useRef<string | null>(null);
  const connectingSessionIdRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStep, setConnectionStep] = useState(0);

  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [connectionDropdownOpen, setConnectionDropdownOpen] = useState(false);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [showDriveSelector, setShowDriveSelector] = useState(false);

  const [localPath, setLocalPath] = useState<string>("");
  const [localRoot, setLocalRoot] = useState<string>("");
  const [localEntries, setLocalEntries] = useState<SftpFileEntry[]>([]);
  const [selectedLocalFile, setSelectedLocalFile] = useState<string | null>(
    null,
  );
  const [localLoading, setLocalLoading] = useState(false);

  const [remotePath, setRemotePath] = useState<string>(".");
  const [remoteRoot, setRemoteRoot] = useState<string>("");
  const [remoteEntries, setRemoteEntries] = useState<SftpFileEntry[]>([]);
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(
    null,
  );
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState<SftpFileEntry | null>(null);
  const [dragOverRemote, setDragOverRemote] = useState(false);
  const [dragOverLocal, setDragOverLocal] = useState(false);
  const [draggingFrom, setDraggingFrom] = useState<"local" | "remote" | null>(
    null,
  );
  const dragCounterRef = useRef(0);
  const localDragCounterRef = useRef(0);

  const [upload, setUpload] = useState<TransferState>(createTransferState);
  const [download, setDownload] = useState<TransferState>(createTransferState);
  const [deleteOp, setDeleteOp] = useState<DeleteState>({
    progress: null,
    active: false,
    canceling: false,
    startTime: 0,
    lastBytes: 0,
    lastTime: 0,
    targetPath: "",
    deletionStarted: false,
  });

  const connectionStepInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const connectAttemptRef = useRef(0);
  const canceledConnectAttemptRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<SftpContextMenuState | null>(
    null,
  );
  const [promptDialog, setPromptDialog] = useState<PromptDialogState | null>(
    null,
  );
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );
  const [sortColumn, setSortColumn] = useState<"name" | "size" | "date">(
    "name",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [propertiesDialog, setPropertiesDialog] =
    useState<PropertiesDialogState | null>(null);

  const handleSort = useCallback(
    (column: "name" | "size" | "date") => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection("asc");
      }
    },
    [sortColumn],
  );

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId),
    [connections, selectedConnectionId],
  );

  const filteredLocalEntries = useMemo(() => {
    let entries = showHiddenFiles
      ? localEntries
      : localEntries.filter((e) => !e.name.startsWith("."));
    return [...entries].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "name") cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortColumn === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortColumn === "date") cmp = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [localEntries, showHiddenFiles, sortColumn, sortDirection]);
  const filteredRemoteEntries = useMemo(() => {
    let entries = showHiddenFiles
      ? remoteEntries
      : remoteEntries.filter((e) => !e.name.startsWith("."));
    return [...entries].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "name") cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      else if (sortColumn === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortColumn === "date") cmp = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [remoteEntries, showHiddenFiles, sortColumn, sortDirection]);

  const loadConnections = useCallback(async () => {
    try {
      const items = await connectionApi.loadAll();
      setConnections(items);
      if (!selectedConnectionId && items.length > 0) {
        setSelectedConnectionId(items[0].id);
      }
    } catch (error) {
      toast.error("Failed to load saved connections", {
        description: String(error),
      });
    }
  }, [selectedConnectionId]);

  const loadDrives = useCallback(async () => {
    try {
      const driveList = await sftpApi.listLocalDrives();
      setDrives(driveList);
    } catch (error) {
      toast.error("Failed to load drives", { description: String(error) });
    }
  }, []);

  const loadLocalDir = useCallback(async (path?: string) => {
    if (!path) {
      setLocalLoading(true);
      try {
        const listing = await sftpApi.listLocalDir();
        setLocalPath(listing.path);
        setLocalEntries(listing.entries);
        setSelectedLocalFile(null);
        if (!localRoot) setLocalRoot(listing.path);
      } catch (error) {
        toast.error("Failed to load local directory", {
          description: String(error),
        });
      } finally {
        setLocalLoading(false);
      }
      return;
    }
    if (localRoot) {
      const pathDrive = getDriveLetter(path);
      const rootDrive = getDriveLetter(localRoot);
      const sameDrive = !pathDrive && !rootDrive
        ? true
        : !!pathDrive && !!rootDrive && pathDrive === rootDrive;
      if (sameDrive) {
        const normPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
        const normRoot = localRoot.replace(/\\/g, "/").replace(/\/+$/, "");
        if (!normPath.toLowerCase().startsWith(normRoot.toLowerCase())) {
          toast.info("Cannot navigate above your home folder");
          void loadLocalDir();
          return;
        }
      }
    }
    setLocalLoading(true);
    try {
      const listing = await sftpApi.listLocalDir(path);
      setLocalPath(listing.path);
      setLocalEntries(listing.entries);
      setSelectedLocalFile(null);
      if (!localRoot) setLocalRoot(listing.path);
    } catch (error) {
      toast.error("Failed to load local directory", {
        description: String(error),
      });
    } finally {
      setLocalLoading(false);
    }
  }, [localRoot]);

  const loadRemoteDir = useCallback(
    async (path?: string) => {
      if (!sessionId) return;
      if (path && remoteRoot) {
        const normPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
        const normRoot = remoteRoot.replace(/\\/g, "/").replace(/\/+$/, "");
        if (!normPath.startsWith(normRoot + "/") && normPath !== normRoot) {
          toast.info("Cannot navigate above your home folder");
          void loadRemoteDir();
          return;
        }
      }
      setRemoteLoading(true);
      try {
        const listing = await sftpApi.listRemoteDir(
          sessionId,
          path ?? remotePath,
        );
        setRemotePath(listing.path);
        setRemoteEntries(listing.entries);
        setSelectedRemotePath(null);
        setRemoteError(null);
      } catch (error) {
        setRemoteError(String(error));
        setRemoteEntries([]);
        toast.error("Failed to load remote directory", {
          description: String(error),
        });
      } finally {
        setRemoteLoading(false);
      }
    },
    [sessionId, remotePath, remoteRoot],
  );

  const disconnect = useCallback(async () => {
    const targetSessionId = sessionId ?? connectingSessionId;
    if (!targetSessionId) return;

    if (connecting) {
      canceledConnectAttemptRef.current = connectAttemptRef.current;
      setConnecting(false);
    }

    if (connectionStepInterval.current) {
      clearInterval(connectionStepInterval.current);
      connectionStepInterval.current = null;
    }

    try {
      await sftpApi.disconnect(targetSessionId);
    } catch {
      // best effort cleanup
    } finally {
      setConnected(false);
      setSessionId(null);
      setConnectingSessionId(null);
      setRemoteEntries([]);
      setSelectedRemotePath(null);
      setRemotePath(".");
      setRemoteError(null);
    }
  }, [sessionId, connectingSessionId, connecting]);

  const resolveInitialRemoteListing = useCallback(
    async (
      activeSessionId: string,
      username?: string,
    ): Promise<{ path: string; entries: SftpFileEntry[] }> => {
      const candidates: string[] = [];

      try {
        const homePath = await sftpApi.getRemoteHome(activeSessionId);
        if (homePath) {
          candidates.push(homePath);
        }
      } catch (error) {
        toast.warning("Could not resolve remote home directory", {
          description: String(error),
        });
      }

      if (username && username.trim()) {
        candidates.push(`/home/${username.trim()}`);
      }
      candidates.push("/");

      const uniqueCandidates = [...new Set(candidates)];
      let lastError: unknown = null;

      for (const candidate of uniqueCandidates) {
        try {
          return await sftpApi.listRemoteDir(activeSessionId, candidate);
        } catch (error) {
          lastError = error;
        }
      }

      throw new Error(
        lastError
          ? String(lastError)
          : "Unable to list any initial remote directory",
      );
    },
    [],
  );

  useEffect(() => {
    void loadConnections();
    void loadLocalDir();
    void loadDrives();
  }, [loadConnections, loadLocalDir, loadDrives]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    connectingSessionIdRef.current = connectingSessionId;
  }, [connectingSessionId]);

  useEffect(() => {
    return () => {
      if (sessionIdRef.current) void sftpApi.disconnect(sessionIdRef.current);
      if (connectingSessionIdRef.current)
        void sftpApi.disconnect(connectingSessionIdRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (connectionStepInterval.current)
        clearInterval(connectionStepInterval.current);
    };
  }, []);

  useTransferListener("sftp-upload-progress", setUpload);
  useTransferListener("sftp-download-progress", setDownload);
  useDeleteListener(setDeleteOp);

  const connect = async () => {
    if (!selectedConnectionId) {
      toast.warning("Choose a connection first");
      return;
    }
    if (connecting || connected) return;

    const attemptId = ++connectAttemptRef.current;
    canceledConnectAttemptRef.current = null;
    setConnecting(true);
    setRemoteError(null);
    setRemoteEntries([]);
    setSelectedRemotePath(null);
    setConnectionStep(0);

    // Animate through progress steps at a natural pace.
    connectionStepInterval.current = setInterval(() => {
      setConnectionStep((prev) => {
        if (prev >= CONNECT_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 600);

    const nextSession = crypto.randomUUID();
    setConnectingSessionId(nextSession);
    try {
      await sftpApi.connect(nextSession, selectedConnectionId, true);
      const isCanceledAttempt = canceledConnectAttemptRef.current === attemptId;
      const isLatestAttempt = connectAttemptRef.current === attemptId;
      if (isCanceledAttempt || !isLatestAttempt) {
        try {
          await sftpApi.disconnect(nextSession);
        } catch {
          // best effort cleanup
        }
        return;
      }

      setSessionId(nextSession);
      setConnected(true);
      toast.success("SFTP connected", {
        description: selectedConnection?.name ?? "Connected",
      });

      // Resolve a stable initial directory and ensure remote pane is never blank.
      setRemoteLoading(true);
      try {
        const listing = await resolveInitialRemoteListing(
          nextSession,
          selectedConnection?.username,
        );
        setRemotePath(listing.path);
        setRemoteEntries(listing.entries);
        setRemoteError(null);
        try {
          const home = await sftpApi.getRemoteHome(nextSession);
          setRemoteRoot(home);
        } catch {
          setRemoteRoot(listing.path);
        }
      } catch {
        setRemotePath("/");
        setRemoteEntries([]);
        setRemoteError(
          "Connected, but failed to load an initial remote directory.",
        );
      } finally {
        setRemoteLoading(false);
      }
    } catch (error) {
      const isCanceledAttempt = canceledConnectAttemptRef.current === attemptId;
      const isLatestAttempt = connectAttemptRef.current === attemptId;
      if (isCanceledAttempt || !isLatestAttempt) {
        return;
      }
      toast.error("Failed to establish SFTP connection", {
        description: String(error),
      });
    } finally {
      if (connectionStepInterval.current) {
        clearInterval(connectionStepInterval.current);
        connectionStepInterval.current = null;
      }
      if (connectAttemptRef.current === attemptId) {
        setConnecting(false);
        setConnectingSessionId(null);
      }
    }
  };

  const uploadLocalFile = async (
    localFilePath: string,
    isDir = false,
    fileSize = 0,
  ) => {
    if (!sessionId || !connected) {
      toast.warning("Connect to a server first");
      return;
    }
    const fileName =
      localFilePath.replace(/[/\\]/g, "/").split("/").pop() ?? localFilePath;
    const remoteTarget =
      remotePath === "." || remotePath === "/"
        ? fileName
        : `${remotePath.replace(/\/$/, "")}/${fileName}`;
    const now = performance.now();
    setUpload({
      ...createTransferState(),
      active: true,
      progress: { fileName, bytesSent: 0, totalBytes: fileSize, speed: 0 },
      startTime: now,
      lastBytes: 0,
      lastTime: now,
    });
    try {
      if (isDir) {
        const result = await sftpApi.uploadDir(
          sessionId,
          localFilePath,
          remotePath,
        );
        toast.success("Folder uploaded", {
          description: `${result.itemsTransferred} files (${formatBytes(result.totalBytes)})`,
        });
      } else {
        const result = await sftpApi.uploadFile(
          sessionId,
          localFilePath,
          remotePath,
          false,
        );
        toast.success("Uploaded", { description: result.remotePath });
      }
      await loadRemoteDir(remotePath);
    } catch (error) {
      const message = String(error);
      if (message.toLowerCase().includes("upload canceled")) {
        try {
          await sftpApi.deleteRemotePath(sessionId, remoteTarget, isDir);
        } catch {
          /* cleanup best effort */
        }
        toast.message("Upload canceled");
        await loadRemoteDir(remotePath);
      } else {
        try {
          await sftpApi.deleteRemotePath(sessionId, remoteTarget, isDir);
        } catch {
          /* cleanup best effort */
        }
        toast.error("Upload failed", { description: message });
      }
    } finally {
      setUpload((prev) => ({
        ...prev,
        active: false,
        canceling: false,
        progress: null,
      }));
    }
  };

  const downloadRemoteFile = async (remoteFilePath: string, isDir = false) => {
    if (!sessionId || !connected || download.active) {
      toast.warning("Not connected to server");
      return;
    }
    const fileName =
      remoteFilePath.replace(/[/\\]/g, "/").split("/").pop() ?? remoteFilePath;
    const localTarget =
      localPath.endsWith("\\") || localPath.endsWith("/")
        ? `${localPath}${fileName}`
        : `${localPath}\\${fileName}`;
    const now = performance.now();
    setDownload({
      ...createTransferState(),
      active: true,
      progress: { fileName, bytesSent: 0, totalBytes: 0, speed: 0 },
      startTime: now,
      lastBytes: 0,
      lastTime: now,
    });
    try {
      if (isDir) {
        const result = await sftpApi.downloadDir(
          sessionId,
          remoteFilePath,
          localPath,
        );
        toast.success("Folder downloaded", {
          description: `${result.itemsTransferred} files (${formatBytes(result.totalBytes)})`,
        });
      } else {
        const result = await sftpApi.downloadFile(
          sessionId,
          remoteFilePath,
          localPath,
        );
        toast.success("Downloaded", { description: result.localPath });
      }
      await loadLocalDir(localPath);
    } catch (error) {
      const message = String(error);
      if (message.toLowerCase().includes("download canceled")) {
        try {
          await sftpApi.deleteLocalPath(localTarget, isDir);
        } catch {
          /* cleanup best effort */
        }
        toast.message("Download canceled");
        await loadLocalDir(localPath);
      } else {
        try {
          await sftpApi.deleteLocalPath(localTarget, isDir);
        } catch {
          /* cleanup best effort */
        }
        toast.error("Download failed", { description: message });
      }
    } finally {
      setDownload((prev) => ({
        ...prev,
        active: false,
        canceling: false,
        progress: null,
      }));
    }
  };

  const cancelTransfer = async (type: "upload" | "download") => {
    const setter = type === "upload" ? setUpload : setDownload;
    const cancelApi =
      type === "upload" ? sftpApi.cancelUpload : sftpApi.cancelDownload;
    setter((prev) => {
      if (!prev.active || prev.canceling) return prev;
      return {
        ...prev,
        canceling: true,
        progress: prev.progress ? { ...prev.progress, speed: 0 } : null,
      };
    });
    try {
      await cancelApi(sessionId!);
    } catch {
      /* cleanup handled by finally in upload/download functions */
    }
  };

  const deleteEntry = async (entry: SftpFileEntry, pane: ContextPane) => {
    setConfirmDialog({
      title: `Delete ${entry.isDir ? "folder" : "file"}`,
      description: `Are you sure you want to delete "${entry.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        const targetPath = entry.path;
        const now = performance.now();
        setDeleteOp({
          progress: {
            fileName: entry.name,
            itemsDeleted: 0,
            totalItems: 0,
            bytesProcessed: 0,
            totalBytes: entry.size ?? 0,
            currentFileBytesProcessed: 0,
            currentFileTotalBytes: 1,
            speed: 0,
            phase: "scanning",
          },
          active: true,
          canceling: false,
          startTime: now,
          lastBytes: 0,
          lastTime: now,
          targetPath,
          deletionStarted: false,
        });

        try {
          if (pane === "remote") {
            await sftpApi.deleteRemotePath(sessionId!, entry.path, entry.isDir);
            if (selectedRemotePath === entry.path) setSelectedRemotePath(null);
            await loadRemoteDir(remotePath);
          } else {
            await sftpApi.deleteLocalPath(entry.path, entry.isDir);
            if (selectedLocalFile === entry.path) setSelectedLocalFile(null);
            await loadLocalDir(localPath);
          }
          toast.success(`${entry.isDir ? "Folder" : "File"} deleted`);
        } catch (error) {
          const message = String(error);
          if (!message.toLowerCase().includes("canceled")) {
            toast.error("Delete failed", { description: message });
          } else {
            toast.message("Delete canceled");
            if (pane === "remote") {
              await loadRemoteDir(remotePath);
            } else {
              await loadLocalDir(localPath);
            }
          }
        } finally {
          setDeleteOp((prev) => ({
            ...prev,
            active: false,
            canceling: false,
            progress: null,
          }));
        }
      },
    });
  };

  const cancelDelete = async () => {
    if (!deleteOp.targetPath || deleteOp.canceling) return;
    setDeleteOp((prev) => ({
      ...prev,
      canceling: true,
      progress: prev.progress ? { ...prev.progress, speed: 0 } : null,
    }));
    try {
      await sftpApi.cancelDelete(deleteOp.targetPath);
    } catch {
      /* cleanup handled by finally in deleteEntry */
    }
  };

  const createRemoteDir = async () => {
    if (!sessionId) return;

    setPromptDialog({
      title: "New Folder",
      placeholder: "Folder name",
      onSubmit: async (name) => {
        try {
          const target =
            remotePath === "." || remotePath === "/"
              ? name
              : `${remotePath.replace(/\/$/, "")}/${name}`;
          await sftpApi.mkdirRemote(sessionId, target);
          toast.success("Folder created");
          await loadRemoteDir(remotePath);
        } catch (error) {
          toast.error("Create folder failed", { description: String(error) });
        }
      },
    });
  };

  const createLocalDir = async () => {
    setPromptDialog({
      title: "New Folder",
      placeholder: "Folder name",
      onSubmit: async (name) => {
        try {
          const target = `${localPath.replace(/[/\\]$/, "")}/${name}`;
          await sftpApi.mkdirLocal(target);
          toast.success("Folder created");
          await loadLocalDir(localPath);
        } catch (error) {
          toast.error("Create folder failed", { description: String(error) });
        }
      },
    });
  };

  const renameEntry = (
    entry: SftpFileEntry,
    pane: "local" | "remote",
  ) => {
    setPromptDialog({
      title: "Rename",
      placeholder: "New name",
      defaultValue: entry.name,
      onSubmit: async (newName) => {
        if (newName === entry.name) return;
        try {
          const dir = pane === "local"
            ? localPath.replace(/[/\\]$/, "")
            : remotePath === "." || remotePath === "/"
              ? ""
              : remotePath.replace(/\/$/, "");
          const oldFull = pane === "local"
            ? entry.path
            : dir ? `${dir}/${entry.name}` : entry.name;
          const newFull = pane === "local"
            ? `${dir}/${newName}`
            : dir ? `${dir}/${newName}` : newName;
          if (pane === "local") {
            await sftpApi.renameLocal(oldFull, newFull);
            await loadLocalDir(localPath);
          } else {
            if (!sessionId) return;
            await sftpApi.renameRemote(sessionId, oldFull, newFull);
            await loadRemoteDir(remotePath);
          }
          toast.success("Renamed successfully");
        } catch (error) {
          toast.error("Rename failed", { description: String(error) });
        }
      },
    });
  };

  const showProperties = async (
    entry: SftpFileEntry,
  ) => {
    if (!sessionId) return;
    setPropertiesDialog({ entry, stat: null, loading: true });
    try {
      const stat = await sftpApi.statRemote(sessionId, entry.path);
      setPropertiesDialog({ entry, stat, loading: false });
    } catch (error) {
      setPropertiesDialog(null);
      toast.error("Failed to load properties", { description: String(error) });
    }
  };

  const selectDrive = useCallback((mountPoint: string) => {
    setShowDriveSelector(false);
    if (!localRoot) {
      void loadLocalDir();
      return;
    }
    const mountDrive = getDriveLetter(mountPoint);
    const rootDrive = getDriveLetter(localRoot);
    if (mountDrive && rootDrive && mountDrive === rootDrive) {
      void loadLocalDir(localRoot);
    } else {
      void loadLocalDir(mountPoint);
    }
  }, [localRoot, loadLocalDir]);

  const openContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    pane: ContextPane,
    entry: SftpFileEntry | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - 232);
    const y = Math.min(event.clientY, window.innerHeight - 140);
    setContextMenu({ pane, x: Math.max(8, x), y: Math.max(8, y), entry });
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    const closeOnPointer = () => closeContextMenu();
    window.addEventListener("keydown", closeOnEsc);
    window.addEventListener("mousedown", closeOnPointer);
    window.addEventListener("scroll", closeOnPointer, true);

    // Auto-focus first menu item
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLButtonElement>('[role="menuitem"]:not(.sftp-context-menu-item--disabled)');
      first?.focus();
    });

    return () => {
      window.removeEventListener("keydown", closeOnEsc);
      window.removeEventListener("mousedown", closeOnPointer);
      window.removeEventListener("scroll", closeOnPointer, true);
    };
  }, [contextMenu, closeContextMenu]);

  useEffect(() => {
    if (!propertiesDialog) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPropertiesDialog(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [propertiesDialog]);

  const localBreadcrumbSegments = parseBreadcrumbSegments(localPath, "local", localRoot);
  const remoteBreadcrumbSegments = parseBreadcrumbSegments(
    remotePath,
    "remote",
    remoteRoot,
  );

  return (
    <div className="sftp-page--minimal">
      {/* Header */}
      <div className="sftp-page-header--minimal">
        <h1 className="sftp-page-title--minimal">NexPort</h1>
        <div className="sftp-connect-row">
          {!connected && !connecting && (
            <>
              <div className="dropdown-wrapper">
                <button
                  className="dropdown-trigger sftp-connection-select"
                  onClick={() =>
                    setConnectionDropdownOpen(!connectionDropdownOpen)
                  }
                >
                  <Link2 size={12} />
                  <span className="sftp-connection-label">
                    {selectedConnection
                      ? `${selectedConnection.name} (${selectedConnection.username}@${selectedConnection.host}:${selectedConnection.port})`
                      : "Select connection..."}
                  </span>
                  <ChevronDown size={11} />
                </button>
                {connectionDropdownOpen && (
                  <>
                    <div
                      className="dropdown-backdrop"
                      onClick={() => setConnectionDropdownOpen(false)}
                    />
                    <div className="dropdown-menu sftp-connection-dropdown">
                      {connections.length === 0 ? (
                        <div className="sftp-drive-empty">
                          No saved connections
                        </div>
                      ) : (
                        connections.map((conn) => (
                          <button
                            key={conn.id}
                            className={`dropdown-item ${selectedConnectionId === conn.id ? "active" : ""}`}
                            onClick={() => {
                              setSelectedConnectionId(conn.id);
                              setConnectionDropdownOpen(false);
                            }}
                          >
                            <span className="sftp-conn-dot" />
                            <span className="sftp-conn-label">{conn.name}</span>
                            <span className="dropdown-hint">
                              {conn.username}@{conn.host}:{conn.port}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
              <button
                className="btn-primary"
                onClick={connect}
                disabled={!selectedConnectionId || connecting}
              >
                <Link2 size={12} /> Connect
              </button>
            </>
          )}
          {connected && (
            <>
              <div className="dropdown-trigger sftp-connection-select sftp-connection-select--connected">
                <span className="sftp-conn-dot sftp-conn-dot--active" />
                <span className="sftp-connection-label">
                  {selectedConnection
                    ? `${selectedConnection.name} (${selectedConnection.username}@${selectedConnection.host}:${selectedConnection.port})`
                    : "Connected"}
                </span>
              </div>
              <button
className="btn-danger"
                onClick={() => void disconnect()}
              >
                <Unplug size={12} /> Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Breadcrumb Bar */}
      <div className={`sftp-breadcrumb-bar ${connecting || connected ? "" : "sftp-breadcrumb-bar--single"}`}>
        <div className="sftp-breadcrumb sftp-breadcrumb--local">
          <button
            className="dropdown-trigger"
            onClick={() => setShowHiddenFiles(!showHiddenFiles)}
            title={showHiddenFiles ? "Hide hidden files" : "Show hidden files"}
            aria-label={showHiddenFiles ? "Hide hidden files" : "Show hidden files"}
          >
            {showHiddenFiles ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <div className="dropdown-wrapper">
            <button
              className="dropdown-trigger"
              onClick={() => setShowDriveSelector(!showDriveSelector)}
              title="Select local drive"
              aria-label="Select local drive"
            >
              <HardDrive size={12} />
              {getDriveLetter(localPath) && (
                <span className="sftp-drive-name">{getDriveLetter(localPath)}:</span>
              )}
              <span className={`sftp-drive-chevron ${showDriveSelector ? "open" : ""}`}>
                <ChevronDown size={11} />
              </span>
            </button>
            {showDriveSelector && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowDriveSelector(false)} />
                <div className="dropdown-menu sftp-drive-dropdown">
                  {drives.length === 0 ? (
                    <div className="sftp-drive-empty">No drives found</div>
                  ) : (
                    drives.map((d) => (
                      <button
                        key={d.mountPoint}
                        className={`dropdown-item ${getDriveLetter(localPath) === getDriveLetter(d.mountPoint) ? "active" : ""}`}
                        onClick={() => selectDrive(d.mountPoint)}
                      >
                        <span className="sftp-drive-icon"><HardDrive size={12} /></span>
                        <span className="sftp-drive-name">{d.mountPoint}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <div className="sftp-breadcrumb-trail">
            {localBreadcrumbSegments.map((seg, idx) => (
              <span key={`local-${idx}`}>
                {idx > 0 && <span className="sftp-breadcrumb-sep">/</span>}
                <span
                  className={`sftp-breadcrumb-segment ${idx === localBreadcrumbSegments.length - 1 ? "sftp-breadcrumb-segment--current" : ""}`}
                  tabIndex={idx < localBreadcrumbSegments.length - 1 ? 0 : -1}
                  role={idx < localBreadcrumbSegments.length - 1 ? "button" : undefined}
                  onClick={() => seg.path && void loadLocalDir(seg.path)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && seg.path) {
                      e.preventDefault();
                      void loadLocalDir(seg.path);
                    }
                  }}
                >
                  {idx === 0 ? seg.label : seg.label}
                </span>
              </span>
            ))}
          </div>
        </div>
        {(connecting || connected) && (
          <div className="sftp-breadcrumb">
            <div className="sftp-breadcrumb-trail">
            {remoteBreadcrumbSegments.map((seg, idx) => (
              <span key={`remote-${idx}`}>
                  {idx > 0 && <span className="sftp-breadcrumb-sep">/</span>}
                  <span
                    className={`sftp-breadcrumb-segment ${idx === remoteBreadcrumbSegments.length - 1 ? "sftp-breadcrumb-segment--current" : ""}`}
                    tabIndex={idx < remoteBreadcrumbSegments.length - 1 ? 0 : -1}
                    role={idx < remoteBreadcrumbSegments.length - 1 ? "button" : undefined}
                    onClick={() => sessionId && void loadRemoteDir(seg.path)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && seg.path && sessionId) {
                        e.preventDefault();
                        void loadRemoteDir(seg.path);
                      }
                    }}
                  >
                    {idx === 0 ? seg.label : seg.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div
        className={`sftp-grid--minimal ${connected || connecting ? "" : "sftp-grid--single"}`}
      >
        {/* Local Pane */}
        <section
          className={`sftp-pane--minimal ${dragOverLocal && draggingFrom === "remote" ? "sftp-pane--drop-active" : ""}`}
          onContextMenu={(event) => openContextMenu(event, "local", null)}
          onDragOver={(event) => {
            if (draggingFrom === "remote") {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragEnter={(event) => {
            if (draggingFrom === "remote") {
              event.preventDefault();
              localDragCounterRef.current++;
              setDragOverLocal(true);
            }
          }}
          onDragLeave={() => {
            localDragCounterRef.current--;
            if (localDragCounterRef.current <= 0) {
              setDragOverLocal(false);
              localDragCounterRef.current = 0;
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOverLocal(false);
            localDragCounterRef.current = 0;
            const remoteFilePath = event.dataTransfer.getData(
              "application/x-sftp-remote",
            );
            const isDir =
              event.dataTransfer.getData("application/x-sftp-isdir") === "true";
            if (remoteFilePath) {
              setDraggingFile(null);
              setDraggingFrom(null);
              void downloadRemoteFile(remoteFilePath, isDir);
            }
          }}
        >
          <div className="sftp-list--minimal">
            <div className="sftp-list-header">
              <span />
              <span
                className="sftp-list-header-sortable"
                onClick={() => handleSort("name")}
                role="columnheader"
                aria-sort={sortColumn === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Name
                  {sortColumn === "name" ? (
                    sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                  ) : (
                    <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                  )}
                </span>
              </span>
              <span
                className="sftp-list-header-sortable"
                onClick={() => handleSort("size")}
                role="columnheader"
                aria-sort={sortColumn === "size" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Size
                  {sortColumn === "size" ? (
                    sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                  ) : (
                    <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                  )}
                </span>
              </span>
              <span
                className="sftp-list-header-sortable"
                onClick={() => handleSort("date")}
                role="columnheader"
                aria-sort={sortColumn === "date" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Date modified
                  {sortColumn === "date" ? (
                    sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                  ) : (
                    <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                  )}
                </span>
              </span>
            </div>
            {localLoading ? (
              <SkeletonRows />
            ) : filteredLocalEntries.length === 0 ? (
              <div className="sftp-empty--minimal">
                {localEntries.length > 0
                  ? "All files are hidden"
                  : "No files in this folder"}
              </div>
            ) : (
              filteredLocalEntries.map((entry, idx) => (
                <div
                  key={entry.path}
                  role="button"
                  tabIndex={0}
                  className={`sftp-item--minimal ${selectedLocalFile === entry.path ? "active" : ""} ${draggingFile?.path === entry.path ? "sftp-item--dragging" : ""}`}
                  onClick={() => setSelectedLocalFile(entry.path)}
                  onDoubleClick={() =>
                    entry.isDir && void loadLocalDir(entry.path)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (entry.isDir) void loadLocalDir(entry.path);
                    }
                  }}
                  draggable={connected}
                  onDragStart={(event) => {
                    setDraggingFile(entry);
                    setDraggingFrom("local");
                    event.dataTransfer.setData("text/plain", entry.path);
                    event.dataTransfer.setData(
                      "application/x-sftp-local",
                      entry.path,
                    );
                    event.dataTransfer.setData(
                      "application/x-sftp-isdir",
                      entry.isDir ? "true" : "false",
                    );
                    event.dataTransfer.setData(
                      "application/x-sftp-size",
                      String(entry.size ?? 0),
                    );
                    event.dataTransfer.effectAllowed = "copy";
                    setDragGhost(event, entry.name);
                  }}
                  onDragEnd={() => {
                    setDraggingFile(null);
                    setDraggingFrom(null);
                    dragCounterRef.current = 0;
                    localDragCounterRef.current = 0;
                  }}
                  onContextMenu={(event) => {
                    setSelectedLocalFile(entry.path);
                    openContextMenu(event, "local", entry);
                  }}
                >
                  <span className="sftp-item-icon--minimal">
                    {entry.isDir ? <Folder size={14} /> : <File size={14} />}
                  </span>
                  <span className="sftp-item-name--minimal">{entry.name}</span>
                  <span className="sftp-item-size--minimal">
                    {entry.isDir ? "-" : formatBytes(entry.size)}
                  </span>
                  <span className="sftp-item-date--minimal">
                    {entry.modifiedAt
                      ? new Date(entry.modifiedAt * 1000).toLocaleDateString()
                      : "-"}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Local drop overlay */}
          {dragOverLocal && draggingFrom === "remote" && (
            <div className="sftp-drop-overlay">
              <div className="sftp-drop-overlay-content">
                <div className="sftp-drop-overlay-icon sftp-drop-overlay-icon--download">
                  <ArrowDown size={32} />
                </div>
                <div className="sftp-drop-overlay-text">
                  Drop to download to <strong>{localPath}</strong>
                </div>
                {draggingFile && (
                  <div className="sftp-drop-overlay-file">
                    <File size={14} /> {draggingFile.name}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Remote Pane */}
        {(connecting || connected) && (
          <section
            className={`sftp-pane--minimal sftp-pane--remote-enter ${dragOverRemote && draggingFrom === "local" ? "sftp-pane--drop-active" : ""}`}
            onContextMenu={(event) => openContextMenu(event, "remote", null)}
            onDragOver={(event) => {
              if (draggingFrom === "local") {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDragEnter={(event) => {
              if (draggingFrom === "local") {
                event.preventDefault();
                dragCounterRef.current++;
                setDragOverRemote(true);
              }
            }}
            onDragLeave={() => {
              dragCounterRef.current--;
              if (dragCounterRef.current <= 0) {
                setDragOverRemote(false);
                dragCounterRef.current = 0;
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverRemote(false);
              dragCounterRef.current = 0;
              setDraggingFile(null);
              setDraggingFrom(null);
              const localFilePath = event.dataTransfer.getData(
                "application/x-sftp-local",
              );
              const isDir =
                event.dataTransfer.getData("application/x-sftp-isdir") ===
                "true";
              const fileSize = Number(
                event.dataTransfer.getData("application/x-sftp-size") || "0",
              );
              if (localFilePath) {
                void uploadLocalFile(localFilePath, isDir, fileSize);
              }
            }}
          >
            {connecting && !connected ? (
              <div className="sftp-connecting">
                <WanderingEyes
                  className="sftp-connecting-eyes"
                  pupilColor="var(--accent)"
                  eyeColor="var(--text-muted)"
                />
                <div className="sftp-connecting-status">
                  Connecting to {selectedConnection?.host ?? "server"}:
                  {selectedConnection?.port ?? 22}
                </div>
                <div className="sftp-connecting-step">
                  {CONNECT_STEPS[connectionStep]?.label}
                  {CONNECT_STEPS[connectionStep]?.detail && (
                    <span className="sftp-connecting-detail">
                      {" "}
                      — {CONNECT_STEPS[connectionStep].detail}
                    </span>
                  )}
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => void disconnect()}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="sftp-list--minimal">
                  <div className="sftp-list-header">
                  <span />
                  <span
                    className="sftp-list-header-sortable"
                    onClick={() => handleSort("name")}
                    role="columnheader"
                    aria-sort={sortColumn === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Name
                      {sortColumn === "name" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      ) : (
                        <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  </span>
                  <span
                    className="sftp-list-header-sortable"
                    onClick={() => handleSort("size")}
                    role="columnheader"
                    aria-sort={sortColumn === "size" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Size
                      {sortColumn === "size" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      ) : (
                        <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  </span>
                  <span
                    className="sftp-list-header-sortable"
                    onClick={() => handleSort("date")}
                    role="columnheader"
                    aria-sort={sortColumn === "date" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Date modified
                      {sortColumn === "date" ? (
                        sortDirection === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      ) : (
                        <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  </span>
                </div>
                {remoteLoading ? (
                  <SkeletonRows />
                ) : remoteError ? (
                  <div className="sftp-empty--minimal sftp-empty--error">
                    <span>{remoteError}</span>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => void loadRemoteDir(remotePath)}
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredRemoteEntries.length === 0 ? (
                  <div className="sftp-empty--minimal">
                    {remoteEntries.length > 0
                      ? "All files are hidden"
                      : "No files in this directory"}
                  </div>
                ) : (
                  filteredRemoteEntries.map((entry) => (
                    <div
                      key={entry.path}
                      role="button"
                      tabIndex={0}
                      className={`sftp-item--minimal ${selectedRemotePath === entry.path ? "active" : ""}`}
                      onClick={() => setSelectedRemotePath(entry.path)}
                      onDoubleClick={() =>
                        entry.isDir && void loadRemoteDir(entry.path)
                      }
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && entry.isDir) {
                          e.preventDefault();
                          void loadRemoteDir(entry.path);
                        }
                      }}
                      draggable
                      onDragStart={(event) => {
                        setDraggingFile(entry);
                        setDraggingFrom("remote");
                        event.dataTransfer.setData("text/plain", entry.path);
                        event.dataTransfer.setData(
                          "application/x-sftp-remote",
                          entry.path,
                        );
                        event.dataTransfer.setData(
                          "application/x-sftp-isdir",
                          entry.isDir ? "true" : "false",
                        );
                        event.dataTransfer.setData(
                          "application/x-sftp-size",
                          String(entry.size ?? 0),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                        setDragGhost(event, entry.name);
                      }}
                      onDragEnd={() => {
                        setDraggingFile(null);
                        setDraggingFrom(null);
                        dragCounterRef.current = 0;
                        localDragCounterRef.current = 0;
                      }}
                      onContextMenu={(event) => {
                        setSelectedRemotePath(entry.path);
                        openContextMenu(event, "remote", entry);
                      }}
                    >
                      <span className="sftp-item-icon--minimal">
                        {entry.isDir ? (
                          <Folder size={14} />
                        ) : (
                          <File size={14} />
                        )}
                      </span>
                      <span className="sftp-item-name--minimal">
                        {entry.name}
                      </span>
                      <span className="sftp-item-size--minimal">
                        {entry.isDir ? "-" : formatBytes(entry.size)}
                      </span>
                      <span className="sftp-item-date--minimal">
                        {entry.modifiedAt
                          ? new Date(entry.modifiedAt * 1000).toLocaleDateString()
                          : "-"}
                      </span>
                    </div>
                  ))
                )}

                {/* Remote drop overlay */}
                {dragOverRemote && draggingFrom === "local" && (
                  <div className="sftp-drop-overlay">
                    <div className="sftp-drop-overlay-content">
                      <div className="sftp-drop-overlay-icon">
                        <Upload size={32} />
                      </div>
                      <div className="sftp-drop-overlay-text">
                        Drop to upload to <strong>{remotePath}</strong>
                      </div>
                      {draggingFile && (
                        <div className="sftp-drop-overlay-file">
                          <File size={14} /> {draggingFile.name}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
            )}
          </section>
        )}
      </div>

      {/* Bottom Transfer Bar */}
      <MinimalTransferBar
        upload={upload}
        download={download}
        onCancelUpload={() => cancelTransfer("upload")}
        onCancelDownload={() => cancelTransfer("download")}
      />
      <DeleteProgressBar state={deleteOp} onCancel={cancelDelete} />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="sftp-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          aria-label="File actions"
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(e) => {
            const items = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(.sftp-context-menu-item--disabled)');
            const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = items[(currentIndex + 1) % items.length];
              next?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const prev = items[(currentIndex - 1 + items.length) % items.length];
              prev?.focus();
            }
          }}
        >
          {contextMenu.entry && (
            <button
              type="button"
              className="sftp-context-menu-item"
              role="menuitem"
              onClick={() => {
                closeContextMenu();
                if (contextMenu.entry) renameEntry(contextMenu.entry, contextMenu.pane);
              }}
            >
              <Pencil size={14} /> Rename
            </button>
          )}
          {contextMenu.entry && (
            <button
              type="button"
              className={`sftp-context-menu-item sftp-context-menu-item--danger ${deleteOp.active ? "sftp-context-menu-item--disabled" : ""}`}
              role="menuitem"
              disabled={deleteOp.active}
              onClick={() => {
                closeContextMenu();
                if (contextMenu.entry && !deleteOp.active)
                  void deleteEntry(contextMenu.entry, contextMenu.pane);
              }}
            >
              <Trash2 size={14} /> Delete{deleteOp.active ? " (in progress)" : ""}
            </button>
          )}
          <div className="sftp-context-menu-sep" />
          {contextMenu.entry && contextMenu.pane === "remote" && (
            <button
              type="button"
              className="sftp-context-menu-item"
              role="menuitem"
              onClick={() => {
                closeContextMenu();
                if (contextMenu.entry) void showProperties(contextMenu.entry);
              }}
            >
              <Info size={14} /> Properties
            </button>
          )}
          <button
            type="button"
            className="sftp-context-menu-item"
            role="menuitem"
            onClick={() => {
              closeContextMenu();
              if (contextMenu.pane === "remote") void loadRemoteDir(remotePath);
              else void loadLocalDir(localPath);
            }}
          >
            <ArrowRight size={14} /> Refresh
          </button>
          <div className="sftp-context-menu-sep" />
          <button
            type="button"
            className="sftp-context-menu-item"
            role="menuitem"
            onClick={() => {
              closeContextMenu();
              if (contextMenu.pane === "remote") void createRemoteDir();
              else void createLocalDir();
            }}
          >
            <FolderPlus size={14} /> New Folder
          </button>
        </div>
      )}

      {/* Prompt Dialog */}
      {promptDialog && (
        <SftpPromptDialog
          state={promptDialog}
          onClose={() => setPromptDialog(null)}
        />
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <SftpConfirmDialog
          state={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      {/* Properties Dialog */}
      {propertiesDialog && (
        <>
          <div
            className="modal-backdrop"
            onClick={() => setPropertiesDialog(null)}
          />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="properties-dialog-title"
          >
            <div className="modal-dialog modal-dialog--sm">
              <div className="modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className={`sftp-properties-icon ${propertiesDialog.entry.isDir ? "sftp-properties-icon--folder" : "sftp-properties-icon--file"}`}>
                    {propertiesDialog.entry.isDir ? <Folder size={14} /> : <File size={14} />}
                  </div>
                  <div>
                    <h2 className="modal-title" id="properties-dialog-title">{propertiesDialog.entry.name}</h2>
                    <p className="modal-subtitle">{propertiesDialog.entry.isDir ? "Folder" : "File"}</p>
                  </div>
                </div>
              </div>
              <div className="modal-body">
                {propertiesDialog.loading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
                    <Loader2 size={16} className="animate-spin" />
                    Loading properties...
                  </div>
                ) : propertiesDialog.stat ? (
                  <dl className="sftp-properties-list">
                    <dt>Size</dt>
                    <dd>{formatBytes(propertiesDialog.stat.size)}</dd>
                    <dt>Path</dt>
                    <dd>{propertiesDialog.stat.path}</dd>
                    {propertiesDialog.stat.modifiedAt != null && (
                      <>
                        <dt>Modified</dt>
                        <dd>{new Date(propertiesDialog.stat.modifiedAt * 1000).toLocaleString()}</dd>
                      </>
                    )}
                    {propertiesDialog.stat.accessedAt != null && (
                      <>
                        <dt>Accessed</dt>
                        <dd>{new Date(propertiesDialog.stat.accessedAt * 1000).toLocaleString()}</dd>
                      </>
                    )}
                    {propertiesDialog.stat.permissions != null && (
                      <>
                        <dt>Permissions</dt>
                        <dd>{propertiesDialog.stat.permissions.toString(8)}</dd>
                      </>
                    )}
                    {propertiesDialog.stat.uid != null && (
                      <>
                        <dt>Owner (UID)</dt>
                        <dd>{propertiesDialog.stat.user ?? String(propertiesDialog.stat.uid)}</dd>
                      </>
                    )}
                    {propertiesDialog.stat.gid != null && (
                      <>
                        <dt>Group (GID)</dt>
                        <dd>{propertiesDialog.stat.group ?? String(propertiesDialog.stat.gid)}</dd>
                      </>
                    )}
                  </dl>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPropertiesDialog(null)}
                  aria-label="Close properties"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
