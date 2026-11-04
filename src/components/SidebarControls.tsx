import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

// Map for VT / standard SSH control sequences
const VT_CONTROL_SEQUENCES: Record<string, string> = {
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

// Map for HP NonStop 6530 function keys (SOH <keycode> CR)
const HP6530_CONTROL_SEQUENCES: Record<string, string> = {
    "Ctrl+C": "\x03",
    "Up": "\x1bA",
    "Down": "\x1bB",
    "F1": "\x01@\r", "F2": "\x01A\r", "F3": "\x01B\r", "F4": "\x01C\r",
    "F5": "\x01D\r", "F6": "\x01E\r", "F7": "\x01F\r", "F8": "\x01G\r",
    "F9": "\x01H\r", "F10": "\x01I\r", "F11": "\x01J\r", "F12": "\x01K\r",
    "F13": "\x01L\r", "F14": "\x01M\r", "F15": "\x01N\r", "F16": "\x01O\r",

    "S-F1": "\x01`\r", "S-F2": "\x01a\r", "S-F3": "\x01b\r", "S-F4": "\x01c\r",
    "S-F5": "\x01d\r", "S-F6": "\x01e\r", "S-F7": "\x01f\r", "S-F8": "\x01g\r",
    "S-F9": "\x01h\r", "S-F10": "\x01i\r", "S-F11": "\x01j\r", "S-F12": "\x01k\r",
    "S-F13": "\x01l\r", "S-F14": "\x01m\r", "S-F15": "\x01n\r", "S-F16": "\x01o\r",
};

interface SidebarControlsProps {
    sessionId: string | null;
    protocol?: "ssh" | "telnet";
    is6530?: boolean;
}

export function SidebarControls({ sessionId, protocol = "ssh", is6530 = false }: SidebarControlsProps) {
    const sequences = is6530 ? HP6530_CONTROL_SEQUENCES : VT_CONTROL_SEQUENCES;

    const handleSendSequence = async (data: string) => {
        if (!sessionId) {
            toast.error("No active session. Select a connected session first.");
            return;
        }
        try {
            const cmd = protocol === "telnet" ? "telnet_send" : "ssh_send";
            await invoke(cmd, { sessionId, data });
        } catch (err) {
            toast.error(`Failed to send control sequence: ${err}`);
        }
    };

    return (
        <div style={{ height: "100%", padding: "var(--space-2)", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{
                paddingBottom: "8px", borderBottom: "1px solid var(--border-color)",
                fontWeight: 600, fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
                <span>Terminal Controls</span>
                {is6530 && (
                    <span style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                        background: "rgba(96, 165, 250, 0.15)", color: "#60a5fa", border: "1px solid rgba(96, 165, 250, 0.3)"
                    }}>
                        TN6530
                    </span>
                )}
            </div>

            {/* Standard Controls */}
            <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Core</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {["Ctrl+C", "Up", "Down"].map(key => (
                        <button
                            key={key}
                            onClick={() => handleSendSequence(sequences[key])}
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
                            onClick={() => handleSendSequence(sequences[key])}
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
                            onClick={() => handleSendSequence(sequences[key])}
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
