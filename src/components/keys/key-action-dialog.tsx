"use client";

import { useState, useEffect } from "react";
import { useKeyStore, KeyInfo } from "@/stores/key-store";
import { X } from "lucide-react";
import { toast } from "sonner";

interface KeyActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editKey?: KeyInfo | null;
}

export function KeyActionDialog({ open, onOpenChange, editKey }: KeyActionDialogProps) {
  const { importKey, updateKey } = useKeyStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", privateKey: "" });

  useEffect(() => {
    if (open) {
      setForm({ name: "", privateKey: "" });
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      if (editKey) {
        if (form.privateKey) {
          await useKeyStore.getState().updateKeyWithNewKey(editKey.id, form.name, form.privateKey);
          toast.success("Key updated with new credentials");
        } else {
          await useKeyStore.getState().updateKey(editKey.id, form.name);
          toast.success("Key updated");
        }
        setForm({ name: "", privateKey: "" });
        onOpenChange(false);
      } else {
        if (!form.privateKey) {
          toast.error("Private key is required");
          setIsSubmitting(false);
          return;
        }
        await importKey(form.name, form.privateKey);
        toast.success("Key imported");
        setForm({ name: "", privateKey: "" });
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(editKey ? "Failed to update key" : "Failed to import key", { description: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={() => onOpenChange(false)} />
      <div className="modal">
        <div className="modal-dialog">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{editKey ? "Edit Key" : "Import Key"}</h2>
              <p className="modal-subtitle">{editKey ? "Update the key name" : "Paste your private key content"}</p>
            </div>
            <button className="modal-close" onClick={() => onOpenChange(false)}><X size={14} /></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="id_rsa"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Private Key</label>
                <textarea
                  className="form-input form-textarea"
                  value={form.privateKey}
                  onChange={(e) => setForm((p) => ({ ...p, privateKey: e.target.value }))}
                  placeholder={editKey ? "Leave empty to keep existing key" : "Paste your private key here (OpenSSH format)"}
                  rows={8}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? (editKey ? "Saving..." : "Importing...") : (editKey ? "Save" : "Import")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
