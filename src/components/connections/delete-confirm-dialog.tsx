import { ConnectionProfile } from "@/types/connection";

interface DeleteConfirmDialogProps {
  connection: ConnectionProfile;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ connection, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal">
        <div className="modal-dialog">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">Delete Connection</h2>
              <p className="modal-subtitle">
                Are you sure you want to delete "{connection.name}"?
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="btn-primary"
              style={{ background: "var(--danger)" }}
              onClick={onConfirm}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
