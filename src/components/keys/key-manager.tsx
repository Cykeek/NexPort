"use client";

import { useState, useEffect } from "react";
import { Key, Trash2, Copy, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { KeyActionDialog } from "./key-action-dialog";
import { useKeyStore, KeyInfo } from "@/stores/key-store";

export function KeyManager() {
  const { keys, deleteKey, loadKeys } = useKeyStore();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<KeyInfo | null>(null);
  const [editKey, setEditKey] = useState<KeyInfo | null>(null);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const copyPrivateKey = async (key: KeyInfo) => {
    const keyData = await useKeyStore.getState().getKeyData(key.id);
    if (keyData?.privateKey) {
      try {
        await navigator.clipboard.writeText(keyData.privateKey);
        toast.success("Private key copied");
      } catch {
        toast.error("Failed to copy to clipboard");
      }
    } else {
      toast.error("Could not retrieve private key");
    }
  };

  const confirmDelete = (key: KeyInfo) => {
    setKeyToDelete(key);
    setDeleteDialogOpen(true);
  };

  const executeDelete = () => {
    if (!keyToDelete) return;
    deleteKey(keyToDelete.id);
    toast.success("Key deleted");
    setDeleteDialogOpen(false);
    setKeyToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setKeyToDelete(null);
  };

  const openImportDialog = () => {
    setEditKey(null);
    setImportDialogOpen(true);
  };

  const openEditDialog = (key: KeyInfo) => {
    setEditKey(key);
    setImportDialogOpen(true);
  };

  return (
    <div className="keys-page">
      <div className="keys-header">
        <div className="keys-header-left">
          <h1 className="keys-header-title">SSH Keys</h1>
        </div>
        <div className="keys-header-right">
          <button className="btn-secondary" onClick={openImportDialog}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      {keys.length === 0 ? (
        <div className="keys-empty">
          <Key className="keys-empty-icon" size={48} />
          <div className="keys-empty-title">No SSH keys</div>
          <div className="keys-empty-desc">Generate or import a key to get started</div>
        </div>
      ) : (
        <div className="keys-grid">
          {keys.map((key) => (
            <div key={key.id} className="key-card">
              <div className="key-card-header">
                <div className="key-card-icon">
                  <Key size={18} />
                </div>
                <div className="key-card-info">
                  <div className="key-card-name">{key.name}</div>
                  <div className="key-card-meta">{key.keyType}</div>
                </div>
                <div className="key-card-actions">
                  <button className="key-action-btn" onClick={() => copyPrivateKey(key)} title="Copy private key">
                    <Copy size={14} />
                  </button>
                  <button className="key-action-btn" onClick={() => openEditDialog(key)} title="Edit key">
                    <Pencil size={14} />
                  </button>
                  <button className="key-action-btn danger" onClick={() => confirmDelete(key)} title="Delete key">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="key-card-fingerprint" title={key.fingerprint}>
                {key.fingerprint}
              </div>
            </div>
          ))}
        </div>
      )}

      <KeyActionDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen}
        editKey={editKey}
      />

      {deleteDialogOpen && keyToDelete && (
        <>
          <div className="modal-backdrop" onClick={cancelDelete} />
          <div className="modal">
            <div className="modal-dialog">
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">Delete Key</h2>
                  <p className="modal-subtitle">Are you sure you want to delete "{keyToDelete.name}"?</p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={cancelDelete}>Cancel</button>
                <button className="btn-primary" style={{ background: "var(--danger)" }} onClick={executeDelete}>Delete</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
