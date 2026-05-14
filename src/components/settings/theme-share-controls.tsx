"use client";

import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAppearanceStore } from "@/stores/appearance-store";

const MAX_IMPORT_SIZE_BYTES = 10 * 1024; // 10 KB

async function exportPreferences() {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");

  const filePath = await save({
    title: "Export Appearance Preferences",
    defaultPath: "nexport-appearance.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!filePath) return; // User cancelled — no-op

  const prefs = useAppearanceStore.getState().getPreferences();
  const json = JSON.stringify(prefs, null, 2);
  await writeTextFile(filePath, json);

  toast.success("Appearance preferences exported successfully");
}

async function importPreferences() {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");

  const filePath = await open({
    title: "Import Appearance Preferences",
    filters: [{ name: "JSON", extensions: ["json"] }],
    multiple: false,
    directory: false,
  });

  if (!filePath) return; // User cancelled — no-op

  let contents: string;
  try {
    contents = await readTextFile(filePath as string);
  } catch {
    toast.error("Could not read the selected file");
    return;
  }

  // Validate: empty file
  if (!contents || contents.trim().length === 0) {
    toast.error("Invalid file: the selected file is empty");
    return;
  }

  // Validate: file size (10 KB limit)
  const sizeBytes = new TextEncoder().encode(contents).length;
  if (sizeBytes > MAX_IMPORT_SIZE_BYTES) {
    toast.error("Invalid file: the selected file exceeds the 10 KB size limit");
    return;
  }

  // Validate: JSON parsing
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    toast.error("Invalid file: the selected file is not valid JSON");
    return;
  }

  // Apply via store
  const result = useAppearanceStore.getState().importPreferences(parsed);

  if (result.resetFields.length > 0) {
    toast.warning(
      `Imported with defaults for: ${result.resetFields.join(", ")}`
    );
  } else {
    toast.success("Appearance preferences imported successfully");
  }
}

export function ThemeShareControls() {
  const handleExport = async () => {
    try {
      await exportPreferences();
    } catch {
      toast.error("Failed to export preferences");
    }
  };

  const handleImport = async () => {
    try {
      await importPreferences();
    } catch {
      toast.error("Failed to import preferences");
    }
  };

  return (
    <div className="theme-share-controls">
      <button className="theme-share-btn" onClick={handleExport}>
        <Download size={16} />
        Export
      </button>
      <button className="theme-share-btn" onClick={handleImport}>
        <Upload size={16} />
        Import
      </button>
    </div>
  );
}
