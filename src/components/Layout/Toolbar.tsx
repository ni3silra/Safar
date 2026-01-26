import { Icons } from "../Icons";

interface ToolbarProps {
    onNewConnection: () => void;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
    onOpenHelp: () => void;
    isDarkTheme: boolean;
}

export function Toolbar({
    onNewConnection,
    onToggleTheme,
    onOpenSettings,
    onOpenHelp,
    isDarkTheme
}: ToolbarProps) {
    return (
        <div className="toolbar">
            <div className="toolbar-group">
                <img src="/safar-logo.svg" alt="Safar" width="24" height="24" />
                <span style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>Safar</span>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-group">
                <button
                    className="btn btn-primary"
                    onClick={onNewConnection}
                    style={{ padding: "var(--space-1) var(--space-3)" }}
                >
                    <Icons.Plus />
                    <span>New Connection</span>
                </button>

                <button
                    className="icon-btn"
                    data-tooltip="Quick Connect (Ctrl+N)"
                    onClick={onNewConnection}
                >
                    <Icons.Zap />
                </button>
            </div>

            <div style={{ flex: 1 }} />

            <div className="toolbar-group">
                <button className="icon-btn" onClick={onToggleTheme} data-tooltip="Toggle Theme">
                    {isDarkTheme ? <Icons.Sun /> : <Icons.Moon />}
                </button>
                <button className="icon-btn" data-tooltip="Settings" onClick={onOpenSettings}>
                    <Icons.Settings />
                </button>
                <button className="icon-btn" data-tooltip="Help & About" onClick={onOpenHelp}>
                    <Icons.Help />
                </button>
            </div>
        </div>
    );
}
