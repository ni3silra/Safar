import { Icons } from "./Icons";

interface DeleteConfirmationModalProps {
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    description?: string;
    itemName?: string;
    sessionName?: string;
}

export function DeleteConfirmationModal({
    onClose,
    onConfirm,
    title,
    description,
    itemName,
    sessionName
}: DeleteConfirmationModalProps) {
    const displayTitle = title || "Delete Session?";
    const name = itemName || sessionName || "this item";

    return (
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "400px", padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "24px", textAlign: "center" }}>
                    <div style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "rgba(248, 81, 73, 0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px auto",
                        color: "var(--accent-error)"
                    }}>
                        <Icons.Trash style={{ width: 24, height: 24 }} />
                    </div>

                    <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                        {displayTitle}
                    </h3>

                    <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                        {description ? (
                            description
                        ) : (
                            <>
                                Are you sure you want to delete <b>{name}</b>? <br />
                                This action cannot be undone.
                            </>
                        )}
                    </p>
                </div>

                <div className="modal-footer" style={{ borderTop: "1px solid var(--border-subtle)", padding: "16px", background: "var(--bg-secondary)" }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        style={{ flex: 1 }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        style={{
                            flex: 1,
                            background: "var(--accent-error)",
                            borderColor: "var(--accent-error)",
                            color: "white"
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
