"use client";

import { useState, useEffect } from "react";
import { Key, Trash2, Copy, Upload, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { KeyActionDialog } from "./key-action-dialog";
import { useKeyStore, KeyInfo } from "@/stores/key-store";
import BorderGlow from "@/components/ui/BorderGlow";
import { Dropdown } from "@/components/ui/dropdown";

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
                <Dropdown
                  value={keyType}
                  items={[
                    { value: "ed25519", label: "ED25519", hint: "Recommended" },
                    { value: "rsa", label: "RSA" },
                  ]}
                  onChange={(v) => v && setKeyType(String(v))}
                  fullWidth
                />
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
  const { keys, deleteKey, loadKeys, saveKey, isLoading } = useKeyStore();
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

  const executeDelete = async () => {
    if (!keyToDelete) return;
    try {
      await deleteKey(keyToDelete.id);
      toast.success("Key deleted");
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
    } catch {
      toast.error("Failed to delete key");
    }
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
    <div className="keys-page page-fade-in">
      <div className="keys-header">
        <div className="keys-header-left">
          <h1 className="keys-header-title">SSH Keys</h1>
        </div>
        <div className="keys-header-right">
          <button className="btn-secondary" onClick={openGenerateDialog}>
            <Plus size={14} /> Generate
          </button>
          <button className="btn-primary" onClick={openImportDialog}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="keys-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="keycard-skeleton">
              <div className="keycard-skeleton-header">
                <div className="skeleton-box" style={{ width: 40, height: 40, borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton-box" style={{ width: "60%", height: 14, borderRadius: 6, marginBottom: 8 }} />
                  <div className="skeleton-box" style={{ width: "35%", height: 12, borderRadius: 6 }} />
                </div>
              </div>
              <div className="skeleton-box" style={{ width: "100%", height: 12, borderRadius: 6, marginTop: 12 }} />
              <div className="skeleton-box" style={{ width: "80%", height: 12, borderRadius: 6, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="keys-empty">
          <Key className="keys-empty-icon" size={48} />
          <div className="keys-empty-title">No SSH keys</div>
          <div className="keys-empty-desc">Generate or import a key to get started</div>
        </div>
      ) : (
        <div className="keys-grid">
          {keys.map((key) => (
            <BorderGlow
              key={key.id}
              borderRadius={22}
              glowRadius={20}
              glowIntensity={0.6}
              edgeSensitivity={40}
              coneSpread={20}
              backgroundColor="var(--bg-elevated)"
              glowColor="245 60 70"
              colors={["#4F46E5", "#6366f1", "#818cf8"]}
              fillOpacity={0.3}
            >
              <div className="keycard">
                {/* Header: icon + name + type badge */}
                <div className="keycard-header">
                  <div className="keycard-icon">
                    <Key size={20} />
                  </div>
                  <div className="keycard-title">
                    <div className="keycard-name">{key.name}</div>
                    <span className="keycard-type-badge">{key.keyType.toUpperCase()}</span>
                  </div>
                </div>

                {/* Fingerprint box */}
                <div className="keycard-fingerprint-box">
                  <div className="keycard-fingerprint-content">
                    <span className="keycard-fingerprint-label">Fingerprint</span>
                    <span className="keycard-fingerprint-value" title={key.fingerprint}>
                      {key.fingerprint.length > 28 ? key.fingerprint.slice(0, 28) + "..." : key.fingerprint}
                    </span>
                  </div>
                </div>

                {/* Actions row */}
                <div className="keycard-footer">
                  <div className="keycard-actions">
                    <button className="btn-secondary btn-sm" onClick={() => copyPrivateKey(key)} title="Copy private key to clipboard">
                      <Copy size={13} /> Copy Key
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => openEditDialog(key)} title="Edit key">
                      <Pencil size={13} />
                    </button>
                    <button className="btn-secondary btn-sm btn-icon-danger" onClick={() => confirmDelete(key)} title="Delete key">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </BorderGlow>
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
                <button className="btn-danger" onClick={executeDelete}>Delete</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
