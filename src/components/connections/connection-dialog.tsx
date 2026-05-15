"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useKeyStore } from "@/stores/key-store";
import { X } from "lucide-react";
import { toast } from "sonner";
import { SSH_DEFAULTS } from "@/config/constants";
import { ConnectionProfile } from "@/types/connection";

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConnection?: ConnectionProfile | null;
  onSuccess?: () => void;
}

export function ConnectionDialog({ open, onOpenChange, editConnection, onSuccess }: ConnectionDialogProps) {
  const { keys } = useKeyStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", host: "", port: String(SSH_DEFAULTS.port), username: "", authMethod: "password" as "password" | "key", password: "", keyId: "", group: "" });
  const hasExistingPassword = editConnection?.has_password ?? false;

  useEffect(() => {
    if (editConnection) {
      setForm({
        name: editConnection.name,
        host: editConnection.host,
        port: String(editConnection.port),
        username: editConnection.username,
        authMethod: editConnection.auth_method,
        password: "",
        keyId: editConnection.key_id || "",
        group: editConnection.group || "",
      });
    } else {
      setForm({ name: "", host: "", port: String(SSH_DEFAULTS.port), username: "", authMethod: "password", password: "", keyId: "", group: "" });
    }
  }, [editConnection, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.host || !form.username) return;
    setIsSubmitting(true);
    try {
      await invoke("save_connection", {
        profile: {
          id: editConnection?.id || crypto.randomUUID(),
          name: form.name,
          host: form.host,
          port: parseInt(form.port) || 22,
          username: form.username,
          auth_method: form.authMethod,
          key_id: form.authMethod === "key" ? form.keyId : undefined,
          // Only send password if user typed a new one.
          // When editing, undefined means "keep existing" on the backend.
          encrypted_password: form.password || undefined,
          group: form.group || undefined,
        },
      });

      toast.success(editConnection ? "Connection updated" : "Connection saved");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error("Failed to save", { description: String(err) });
    }
    finally { setIsSubmitting(false); }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={() => onOpenChange(false)} />
      <div className="modal">
        <div className="modal-dialog">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{editConnection ? "Edit Connection" : "New Connection"}</h2>
              <p className="modal-subtitle">{editConnection ? "Update SSH server details" : "Add a new SSH server"}</p>
            </div>
            <button className="modal-close" onClick={() => onOpenChange(false)}><X size={14} /></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="My Server" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Host</label>
                  <input className="form-input" type="text" value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} placeholder="192.168.1.100" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Port</label>
                  <input className="form-input" type="number" value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" type="text" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} placeholder="root" required />
              </div>
              <div className="form-group">
                <label className="form-label">Authentication</label>
                <div className="form-segmented">
                  {(["password", "key"] as const).map((m) => (
                    <button key={m} type="button" className={`form-segment ${form.authMethod === m ? "active" : ""}`} onClick={() => setForm((p) => ({ ...p, authMethod: m }))}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {form.authMethod === "password" && (
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder={hasExistingPassword ? "•••••••• (leave blank to keep existing)" : ""} />
                </div>
              )}
              {form.authMethod === "key" && (
                <div className="form-group">
                  <label className="form-label">Select Key</label>
                  {keys.length === 0 ? (
                    <div className="form-input form-empty-text">
                      No keys saved. Go to Keys section to add a key.
                    </div>
                  ) : (
                    <select 
                      className="form-input" 
                      value={form.keyId} 
                      onChange={(e) => setForm((p) => ({ ...p, keyId: e.target.value }))}
                      required
                    >
                      <option value="">Select a key...</option>
                      {keys.map((key) => (
                        <option key={key.id} value={key.id}>
                          {key.name} ({key.keyType})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
