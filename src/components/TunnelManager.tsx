import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from 'sonner';

interface TunnelManagerProps {
    sessionId: string;
}

import { Icons } from "./Icons";

type ForwardingMode = 'local' | 'remote';

export function TunnelManager({ sessionId }: TunnelManagerProps) {
    const [activeTab, setActiveTab] = useState<ForwardingMode>('local');

    // Tunnels State
    const [localTunnels, setLocalTunnels] = useState<number[]>([]);
    const [remoteTunnels, setRemoteTunnels] = useState<number[]>([]);

    // Form State (Local)
    const [l2rLocalPort, setL2rLocalPort] = useState("");
    const [l2rRemoteHost, setL2rRemoteHost] = useState("localhost");
    const [l2rRemotePort, setL2rRemotePort] = useState("");

    // Form State (Remote)
    const [r2lRemotePort, setR2lRemotePort] = useState("");
    const [r2lLocalHost, setR2lLocalHost] = useState("localhost");
    const [r2lLocalPort, setR2lLocalPort] = useState("");

    const refreshTunnels = async () => {
        try {
            // Fetch Local Tunnels
            const lRes = await invoke<any>("ssh_list_tunnels", { sessionId });
            const lPorts = Array.isArray(lRes) ? lRes : (lRes?.data || []);
            setLocalTunnels(Array.isArray(lPorts) ? [...lPorts].sort((a, b) => a - b) : []);

            // Fetch Remote Tunnels
            const rRes = await invoke<any>("ssh_list_remote_tunnels", { sessionId });
            const rPorts = Array.isArray(rRes) ? rRes : (rRes?.data || []);
            setRemoteTunnels(Array.isArray(rPorts) ? [...rPorts].sort((a, b) => a - b) : []);
        } catch (err) {
            toast.error("Failed to refresh tunnels");
        }
    };

    useEffect(() => {
        refreshTunnels();
        const interval = setInterval(refreshTunnels, 5000);
        return () => clearInterval(interval);
    }, [sessionId]);

    const handleStartLocalTunnel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!l2rLocalPort || !l2rRemoteHost || !l2rRemotePort) return;

        try {
            const lPort = parseInt(l2rLocalPort);
            const rPort = parseInt(l2rRemotePort);

            if (isNaN(lPort) || isNaN(rPort)) {
                toast.error("Ports must be numbers");
                return;
            }

            await invoke("ssh_forward_local", {
                sessionId,
                localPort: lPort,
                remoteHost: l2rRemoteHost,
                remotePort: rPort
            });

            toast.success(`Local Tunnel started: ${lPort} -> ${l2rRemoteHost}:${rPort}`);
            setL2rLocalPort("");
            setL2rRemoteHost("localhost");
            setL2rRemotePort("");
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to start local tunnel: ${err}`);
        }
    };

    const handleStartRemoteTunnel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!r2lRemotePort || !r2lLocalHost || !r2lLocalPort) return;

        try {
            const rPort = parseInt(r2lRemotePort);
            const lPort = parseInt(r2lLocalPort);

            if (isNaN(rPort) || isNaN(lPort)) {
                toast.error("Ports must be numbers");
                return;
            }

            await invoke("ssh_forward_remote", {
                sessionId,
                remotePort: rPort,
                localHost: r2lLocalHost,
                localPort: lPort
            });

            toast.success(`Remote Tunnel started: ${rPort} -> ${r2lLocalHost}:${lPort}`);
            setR2lRemotePort("");
            setR2lLocalHost("localhost");
            setR2lLocalPort("");
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to start remote tunnel: ${err}`);
        }
    };

    const handleStopLocalTunnel = async (port: number) => {
        try {
            await invoke("ssh_stop_forward", { sessionId, localPort: port });
            toast.success(`Local Tunnel on port ${port} stopped`);
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to stop local tunnel: ${err}`);
        }
    };

    const handleStopRemoteTunnel = async (port: number) => {
        try {
            await invoke("ssh_stop_forward_remote", { sessionId, remotePort: port });
            toast.success(`Remote Tunnel on port ${port} stopped`);
            refreshTunnels();
        } catch (err) {
            toast.error(`Failed to stop remote tunnel: ${err}`);
        }
    };

    return (
        <div style={{ padding: "20px", height: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Port Forwarding</h3>
                </div>
                <button className="icon-btn" onClick={refreshTunnels} data-tooltip="Refresh">
                    <Icons.Refresh />
                </button>
            </div>

            {/* TABS */}
            <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
                <button
                    onClick={() => setActiveTab('local')}
                    style={{
                        padding: "8px 16px",
                        background: activeTab === 'local' ? "var(--bg-hover)" : "transparent",
                        border: "none",
                        color: activeTab === 'local' ? "var(--text-primary)" : "var(--text-muted)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: activeTab === 'local' ? 600 : 400
                    }}
                >
                    Local Forwarding
                </button>
                <button
                    onClick={() => setActiveTab('remote')}
                    style={{
                        padding: "8px 16px",
                        background: activeTab === 'remote' ? "var(--bg-hover)" : "transparent",
                        border: "none",
                        color: activeTab === 'remote' ? "var(--text-primary)" : "var(--text-muted)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: activeTab === 'remote' ? 600 : 400
                    }}
                >
                    Remote Forwarding (Reverse)
                </button>
            </div>

            {/* TAB CONTENT: LOCAL */}
            {activeTab === 'local' && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Local Forwarding (L2R)</strong>: Access a service running on the remote machine (or accessible by it) from your local machine.
                        <br /><em>Eg: Bind Local Port <strong>8080</strong> to access Remote Host <code>localhost:80</code></em>
                    </div>

                    <form onSubmit={handleStartLocalTunnel} style={{
                        display: "flex", gap: "10px", alignItems: "end", background: "var(--bg-secondary)", padding: "12px", borderRadius: "6px"
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Local Bind Port</label>
                            <input type="number" className="input" placeholder="8080" value={l2rLocalPort} onChange={(e) => setL2rLocalPort(e.target.value)} />
                        </div>
                        <div style={{ paddingBottom: "10px", color: "var(--text-muted)" }}>→</div>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Remote Host</label>
                            <input type="text" className="input" placeholder="localhost" value={l2rRemoteHost} onChange={(e) => setL2rRemoteHost(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Remote Port</label>
                            <input type="number" className="input" placeholder="80" value={l2rRemotePort} onChange={(e) => setL2rRemotePort(e.target.value)} />
                        </div>
                        <div>
                            <button type="submit" className="btn btn-primary" style={{ height: "36px" }}><Icons.Plus /> Start</button>
                        </div>
                    </form>

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
                                {localTunnels.length === 0 ? (
                                    <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>No active local tunnels</td></tr>
                                ) : (
                                    localTunnels.map(port => (
                                        <tr key={port} style={{ borderBottom: "1px solid var(--bg-secondary)" }}>
                                            <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>{port}</td>
                                            <td style={{ padding: "12px 8px" }}><span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>Active</span></td>
                                            <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                                <button className="icon-btn" onClick={() => handleStopLocalTunnel(port)} style={{ color: "var(--col-red)" }} title="Stop Tunnel"><Icons.Trash /></button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: REMOTE */}
            {activeTab === 'remote' && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Remote Forwarding (R2L)</strong>: Expose a service running on your local machine (or accessible by it) to the remote machine.
                        <br /><em>Eg: Bind Remote Port <strong>8080</strong> to expose Local Host <code>localhost:3000</code></em>
                    </div>

                    <form onSubmit={handleStartRemoteTunnel} style={{
                        display: "flex", gap: "10px", alignItems: "end", background: "var(--bg-secondary)", padding: "12px", borderRadius: "6px"
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Remote Bind Port</label>
                            <input type="number" className="input" placeholder="8080" value={r2lRemotePort} onChange={(e) => setR2lRemotePort(e.target.value)} />
                        </div>
                        <div style={{ paddingBottom: "10px", color: "var(--text-muted)" }}>→</div>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Local Host</label>
                            <input type="text" className="input" placeholder="localhost" value={r2lLocalHost} onChange={(e) => setR2lLocalHost(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-muted)" }}>Local Port</label>
                            <input type="number" className="input" placeholder="3000" value={r2lLocalPort} onChange={(e) => setR2lLocalPort(e.target.value)} />
                        </div>
                        <div>
                            <button type="submit" className="btn btn-primary" style={{ height: "36px" }}><Icons.Plus /> Start</button>
                        </div>
                    </form>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ textAlign: "left", fontSize: "12px", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                                    <th style={{ padding: "8px" }}>Remote Port</th>
                                    <th style={{ padding: "8px" }}>Status</th>
                                    <th style={{ padding: "8px", textAlign: "right" }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {remoteTunnels.length === 0 ? (
                                    <tr><td colSpan={3} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>No active remote tunnels</td></tr>
                                ) : (
                                    remoteTunnels.map(port => (
                                        <tr key={port} style={{ borderBottom: "1px solid var(--bg-secondary)" }}>
                                            <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>{port}</td>
                                            <td style={{ padding: "12px 8px" }}><span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>Active</span></td>
                                            <td style={{ padding: "12px 8px", textAlign: "right" }}>
                                                <button className="icon-btn" onClick={() => handleStopRemoteTunnel(port)} style={{ color: "var(--col-red)" }} title="Stop Tunnel"><Icons.Trash /></button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
