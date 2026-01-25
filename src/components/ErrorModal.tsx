import { Icons } from "./Icons";

interface ErrorModalProps {
    onClose: () => void;
    title?: string;
    message: string;
}

export function ErrorModal({ onClose, title = "Error", message }: ErrorModalProps) {
    return (
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "400px" }}>
                <div className="modal-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                            background: "rgba(220, 38, 38, 0.1)",
                            padding: "8px",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>
                            <Icons.AlertTriangle style={{ width: 20, height: 20, color: "var(--accent-error)" }} />
                        </div>
                        <h2 className="modal-title" style={{ color: "var(--text-primary)" }}>{title}</h2>
                    </div>
                </div>

                <div className="modal-body">
                    <div style={{
                        background: "var(--bg-secondary)",
                        padding: "16px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        color: "var(--text-primary)",
                        maxHeight: "300px",
                        overflowY: "auto",
                        whiteSpace: "pre-wrap"
                    }}>
                        {message}
                    </div>
                </div>

                <div className="modal-footer">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        autoFocus
                    >
                        Close
                    </button>
                    {/* Add a 'Retry' or 'Copy' button if needed later */}
                </div>
            </div>
        </div>
    );
}
