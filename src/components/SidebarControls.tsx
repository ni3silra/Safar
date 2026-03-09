import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

// Map for common control sequences
const CONTROL_SEQUENCES: Record<string, string> = {
    "Ctrl+C": "\x03",
    "Up": "\x1b[A",
    "Down": "\x1b[B",
    "F1": "\x1bOP", "F2": "\x1bOQ", "F3": "\x1bOR", "F4": "\x1bOS",
    "F5": "\x1b[15~", "F6": "\x1b[17~", "F7": "\x1b[18~", "F8": "\x1b[19~",
    "F9": "\x1b[20~", "F10": "\x1b[21~", "F11": "\x1b[23~", "F12": "\x1b[24~",
    "F13": "\x1b[25~", "F14": "\x1b[26~", "F15": "\x1b[28~", "F16": "\x1b[29~",

    "S-F1": "\x1b[1;2P", "S-F2": "\x1b[1;2Q", "S-F3": "\x1b[1;2R", "S-F4": "\x1b[1;2S",
    "S-F5": "\x1b[15;2~", "S-F6": "\x1b[17;2~", "S-F7": "\x1b[18;2~", "S-F8": "\x1b[19;2~",
    "S-F9": "\x1b[20;2~", "S-F10": "\x1b[21;2~", "S-F11": "\x1b[23;2~", "S-F12": "\x1b[24;2~",
    "S-F13": "\x1b[25;2~", "S-F14": "\x1b[26;2~", "S-F15": "\x1b[28;2~", "S-F16": "\x1b[29;2~",
};

interface SidebarControlsProps {
    sessionId: string | null;
}

export function SidebarControls({ sessionId }: SidebarControlsProps) {
    const handleSendSequence = async (data: string) => {
        if (!sessionId) {
            toast.error("No active SSH session. Select a connected session first.");
            return;
        }
        try {
            await invoke("ssh_send", { sessionId, data });
        } catch (err) {
            toast.error(`Failed to send control sequence: ${err}`);
        }
    };

    return (
        <div style={{ height: "100%", padding: "var(--space-2)", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{
                paddingBottom: "8px", borderBottom: "1px solid var(--border-color)",
                fontWeight: 600, fontSize: "13px"
            }}>
                Terminal Controls
            </div>

            {/* Standard Controls */}
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Core</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {["Ctrl+C", "Up", "Down"].map(key => (
                        <button
                            key={key}
                            onClick={() => handleSendSequence(CONTROL_SEQUENCES[key])}
                            style={{
                                padding: "6px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                                color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "12px", cursor: "pointer",
                                transition: "all 0.15s ease"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-primary)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            </div>

            {/* F-Keys */}
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Function Keys</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px" }}>
                    {["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15", "F16"].map(key => (
                        <button
                            key={key}
                            onClick={() => handleSendSequence(CONTROL_SEQUENCES[key])}
                            style={{
                                padding: "4px", background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                                color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "11px", cursor: "pointer",
                                transition: "all 0.15s ease"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-primary)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            </div>

            {/* Shift F-Keys */}
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Shift + F-Keys</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px" }}>
                    {["S-F1", "S-F2", "S-F3", "S-F4", "S-F5", "S-F6", "S-F7", "S-F8", "S-F9", "S-F10", "S-F11", "S-F12", "S-F13", "S-F14", "S-F15", "S-F16"].map(key => (
                        <button
                            key={key}
                            onClick={() => handleSendSequence(CONTROL_SEQUENCES[key])}
                            style={{
                                padding: "4px", background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                                color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "11px", cursor: "pointer",
                                transition: "all 0.15s ease"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-primary)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                        >
                            {key.replace("S-", "")}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginTop: "10px", padding: "8px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: "11px" }}>
                <i>Note: To clear the active Block Buffer and terminal screen, use the inline 'Clear' button directly inside the terminal window's top header.</i>
            </div>
        </div>
    );
}
