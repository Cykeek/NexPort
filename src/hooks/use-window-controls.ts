import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef } from "react";

export function useWindowControls() {
  const handleMinimize = useCallback(async () => {
    const win = getCurrentWindow();
    await win.minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    const win = getCurrentWindow();
    await win.toggleMaximize();
  }, []);

  const handleClose = useCallback(async () => {
    const win = getCurrentWindow();
    // Before closing the main window, close all terminal windows so their
    // terminal pages can run their cleanup (disconnect SSH sessions).
    const allWindows = await WebviewWindow.getAll();
    for (const w of allWindows) {
      if (w.label.startsWith("terminal-")) {
        await w.close().catch(() => {});
      }
    }
    await win.close();
  }, []);

  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;
      if (target.closest('[data-tab="true"]')) return;
      const win = getCurrentWindow();
      win.startDragging();
    };

    el.addEventListener("pointerdown", onPointerDown);
    return () => el.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return { handleMinimize, handleMaximize, handleClose, dragRef };
}
