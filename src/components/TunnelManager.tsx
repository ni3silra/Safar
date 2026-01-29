import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from 'sonner';

interface TunnelManagerProps {
    sessionId: string;
}

import { Icons } from "./Icons";

export function TunnelManager({ sessionId }: TunnelManagerProps) {
    const [tunnels, setTunnels] = useState<number[]>([]);

    // New tunnel form
    const [localPort, setLocalPort] = useState("");
    const [remoteHost, setRemoteHost] = useState("localhost");
    const [remotePort, setRemotePort] = useState("");

    const refreshTunnels = async () => {
        try {
            const response = await invoke<any>("ssh_list_tunnels", { sessionId });
            // Handle both direct array and CommandResponse format
            const activePorts = Array.isArray(response) ? response : (response?.data || []);

            if (Array.isArray(activePorts)) {
                setTunnels([...activePorts].sort((a, b) => a - b));
            } else {
                setTunnels([]);
            }
        } catch (err) {
            toast.error("Failed to list tunnels");
            setTunnels([]);
        }
    };

    useEffect(() => {
        refreshTunnels();
        // Poll every 5s just in case
        const interval = setInterval(refreshTunnels, 5000);
        return () => clearInterval(interval);
    }, [sessionId]);

    const handleStartTunnel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!localPort || !remoteHost || !remotePort) return;

        try {
            const lPort = parseInt(localPort);
            const rPort = parseInt(remotePort);

            if (isNaN(lPort) || isNaN(rPort)) {
                toast.error("Ports must be numbers");
                return;
            }

            await invoke("ssh_forward_local", {
                sessionId,
                localPort: lPort,
                remoteHost,
                remotePort: rPort
            });

            toast.success(`Tunnel started: Local ${lPort} -> ${remoteHost}:${rPort}`);
            setLocalPort("");
            setRemoteHost("localhost");
            setRemotePort("");
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to start tunnel: ${err}`);
        }
    };

    const handleStopTunnel = async (port: number) => {
        try {
            await invoke("ssh_stop_forward", { sessionId, localPort: port });
            toast.success(`Tunnel on port ${port} stopped`);
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to stop tunnel: ${err}`);
        }
    };

    return (
        <div style={{ padding: "20px", height: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Port Forwarding</h3>
                    <span style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        fontWeight: "bold",
                        background: "var(--accent-warning)",
                        color: "#000",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        letterSpacing: "0.5px"
                    }}>
                        Experimental
                    </span>
                </div>
                <button className="icon-btn" onClick={refreshTunnels} data-tooltip="Refresh">
                    <Icons.Refresh />
                </button>
            </div>

            {/* Add New Tunnel */}
            <form onSubmit={handleStartTunnel} style={{
                display: "flex",
                gap: "10px",
                alignItems: "end",
                background: "var(--bg-secondary)",
                padding: "12px",
                borderRadius: "6px"
            }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Local Port
                    </label>
                    <input
                        type="number"
                        className="input"
                        placeholder="8080"
                        value={localPort}
                        onChange={(e) => setLocalPort(e.target.value)}
                    />
                </div>
                <div style={{ paddingBottom: "10px", color: "var(--text-muted)" }}>→</div>
                <div style={{ flex: 2 }}>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Remote Host
                    </label>
                    <input
                        type="text"
                        className="input"
                        placeholder="localhost"
                        value={remoteHost}
                        onChange={(e) => setRemoteHost(e.target.value)}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>
                        Remote Port
                    </label>
                    <input
                        type="number"
                        className="input"
                        placeholder="80"
                        value={remotePort}
                        onChange={(e) => setRemotePort(e.target.value)}
                    />
                </div>
                <div>
                    <button type="submit" className="btn btn-primary" style={{ height: "36px" }}>
                        <Icons.Plus /> Start
                    </button>
                </div>
            </form>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ textAlign: "left", fontSize: "12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                            <th style={{ padding: "8px" }}>Local Port</th>
                            <th style={{ padding: "8px" }}>Status</th>
                            <th style={{ padding: "8px", textAlign: "right" }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tunnels.length === 0 ? (
                            <tr>
                                <td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                                    No active tunnels
                                </td>
                            </tr>
                        ) : (
                            tunnels.map(port => (
                                <tr key={port} style={{ borderBottom: "1px solid var(--bg-secondary)" }}>
                                    <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>{port}</td>
                                    <td style={{ padding: "12px 8px" }}>
                                        <span style={{
                                            fontSize: "12px",
                                            padding: "2px 8px",
                                            borderRadius: "10px",
                                            background: "rgba(16, 185, 129, 0.1)",
                                            color: "#10b981"
                                        }}>
                                            Active
                                        </span>
                                    </td>
                                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                        <button
                                            className="icon-btn"
                                            onClick={() => handleStopTunnel(port)}
                                            style={{ color: "var(--col-red)" }}
                                            title="Stop Tunnel"
                                        >
                                            <Icons.Trash />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
