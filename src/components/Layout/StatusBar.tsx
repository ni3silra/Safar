interface StatusBarProps {
    statusMessage: string;
    connectionStatus: "disconnected" | "connecting" | "connected";
    version?: string;
}

export function StatusBar({ statusMessage, connectionStatus, version = "v0.3.0" }: StatusBarProps) {
    return (
        <div className="status-bar">
            <div className="status-bar-left">
                <div className="status-item">
                    <div className={`status-indicator ${connectionStatus}`} />
                    <span>{statusMessage}</span>
                </div>
            </div>
            <div className="status-bar-right">
                <span>{version}</span>
            </div>
        </div>
    );
}
