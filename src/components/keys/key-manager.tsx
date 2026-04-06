"use client";

import { useState, useEffect } from "react";
import { Key, Trash2, Copy, Upload, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { KeyActionDialog } from "./key-action-dialog";
import { useKeyStore, KeyInfo } from "@/stores/key-store";

interface GenerateKeyDialogProps {
  onClose: () => void;
  onGenerate: (name: string, keyType: string) => Promise<void>;
}

function GenerateKeyDialog({ onClose, onGenerate }: GenerateKeyDialogProps) {
  const [name, setName] = useState("");
  const [keyType, setKeyType] = useState("ed25519");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await onGenerate(name, keyType);
    } catch (err) {
      toast.error("Failed to generate key", { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-dialog">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">Generate Key</h2>
              <p className="modal-subtitle">Create a new SSH key pair</p>
            </div>
            <button className="modal-close" onClick={onClose}><X size={14} /></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-key"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Key Type</label>
                <select 
                  className="form-input"
                  value={keyType}
                  onChange={(e) => setKeyType(e.target.value)}
                >
                  <option value="ed25519">ED25519 (Recommended)</option>
                  <option value="rsa">RSA</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Generating..." : "Generate"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export function KeyManager() {
  const { keys, deleteKey, loadKeys, saveKey } = useKeyStore();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
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

  const openGenerateDialog = () => {
    setGenerateDialogOpen(true);
  };

  const handleGenerate = async (name: string, keyType: string) => {
    await saveKey(name, keyType);
    toast.success("Key generated");
    setGenerateDialogOpen(false);
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
          <button className="btn-secondary" onClick={openGenerateDialog}>
            <Plus size={14} /> Generate
          </button>
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

      {generateDialogOpen && (
        <GenerateKeyDialog 
          onClose={() => setGenerateDialogOpen(false)} 
          onGenerate={handleGenerate} 
        />
      )}

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
