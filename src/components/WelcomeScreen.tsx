import { Icons } from "./Icons";

interface WelcomeScreenProps {
    onNewConnection: () => void;
}

export function WelcomeScreen({ onNewConnection }: WelcomeScreenProps) {
    return (
        <div className="welcome-screen">
            <img src="/safar-logo.svg" alt="Safar" className="welcome-logo" />
            <h1 className="welcome-title">Safar</h1>
            <p className="welcome-tagline">Every Connection is a Journey</p>

            <div className="welcome-actions">
                <button className="btn btn-primary" onClick={onNewConnection}>
                    <Icons.Plus />
                    New Connection
                </button>
                {/* <button className="btn btn-secondary" onClick={onImport}>
                    <Icons.Folder />
                    Import Sessions
                </button> */}
            </div>

            <div className="welcome-features">
                <div className="feature-card">
                    <div className="feature-icon">
                        <Icons.Terminal />
                    </div>
                    <div className="feature-title">SSH Terminal</div>
                    <div className="feature-desc">Full xterm-256color support</div>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">
                        <Icons.Folder />
                    </div>
                    <div className="feature-title">File Transfer</div>
                    <div className="feature-desc">SFTP & SCP built-in</div>
                </div>
                <div className="feature-card">
                    <div className="feature-icon">
                        <Icons.Shield />
                    </div>
                    <div className="feature-title">Secure</div>
                    <div className="feature-desc">OS keychain storage</div>
                </div>
            </div>
        </div>
    );
}
