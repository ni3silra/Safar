import React, { useState } from "react";
import { CopilotMessage } from "./types";
import { Icons } from "../Icons";

interface CopilotMessageItemProps {
    message: CopilotMessage;
    userAvatarUrl?: string | null;
    userLogin?: string;
    onRunCommand: (command: string) => void;
    onRunAndAnalyze: (command: string) => void;
}

export const CopilotMessageItem: React.FC<CopilotMessageItemProps> = ({
    message,
    userAvatarUrl,
    userLogin,
    onRunCommand,
    onRunAndAnalyze,
}) => {
    const isUser = message.role === "user";

    const formatTime = (ts: number) => {
        try {
            return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };

    // Parse markdown text with bold (**text**), inline code (`code`), bullet lists, and paragraphs
    const renderMarkdownText = (text: string) => {
        const lines = text.split("\n");
        return lines.map((line, lIdx) => {
            const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
            const isHeading = line.trim().startsWith("### ") || line.trim().startsWith("## ") || line.trim().startsWith("# ");
            const content = isBullet ? line.trim().slice(2) : isHeading ? line.trim().replace(/^#+\s*/, "") : line;

            const segments = content.split(/(\*\*.*?\*\*|`.*?`)/g);

            const renderedSegments = segments.map((seg, sIdx) => {
                if (seg.startsWith("**") && seg.endsWith("**")) {
                    return (
                        <strong key={sIdx} style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {seg.slice(2, -2)}
                        </strong>
                    );
                } else if (seg.startsWith("`") && seg.endsWith("`")) {
                    return (
                        <code
                            key={sIdx}
                            style={{
                                background: "rgba(255, 255, 255, 0.08)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontFamily: "var(--font-mono, monospace)",
                                fontSize: "11.5px",
                                color: "#93c5fd",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                            }}
                        >
                            {seg.slice(1, -1)}
                        </code>
                    );
                }
                return seg;
            });

            if (isHeading) {
                return (
                    <div
                        key={lIdx}
                        style={{
                            fontWeight: 700,
                            fontSize: "14px",
                            margin: "8px 0 4px",
                            color: "var(--text-primary)",
                        }}
                    >
                        {renderedSegments}
                    </div>
                );
            }

            if (isBullet) {
                return (
                    <div key={lIdx} style={{ display: "flex", gap: "6px", margin: "3px 0 3px 8px", lineHeight: 1.5 }}>
                        <span style={{ color: "#60a5fa", userSelect: "none", fontSize: "14px", lineHeight: "18px" }}>•</span>
                        <div style={{ flex: 1 }}>{renderedSegments}</div>
                    </div>
                );
            }

            return (
                <div key={lIdx} style={{ minHeight: line.trim() ? "auto" : "8px", margin: "2px 0", lineHeight: 1.55 }}>
                    {renderedSegments}
                </div>
            );
        });
    };

    // Parse message content for markdown code blocks (e.g. ```bash ... ```)
    const renderContent = (content: string) => {
        const parts = content.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            if (part.startsWith("```") && part.endsWith("```")) {
                const lines = part.slice(3, -3).trim().split("\n");
                let lang = lines[0].trim();
                let codeLines = lines;

                if (/^[a-zA-Z0-9_-]+$/.test(lang)) {
                    codeLines = lines.slice(1);
                } else {
                    lang = "bash";
                }

                const code = codeLines.join("\n").trim();
                const isExecutable =
                    !isUser &&
                    (lang === "bash" ||
                        lang === "sh" ||
                        lang === "shell" ||
                        lang === "zsh" ||
                        lang === "cmd" ||
                        code.startsWith("$ ") ||
                        code.length > 0);

                return (
                    <CommandCodeBlock
                        key={index}
                        code={code.replace(/^\$ /, "")}
                        lang={lang || "bash"}
                        isExecutable={isExecutable}
                        onRunCommand={onRunCommand}
                        onRunAndAnalyze={onRunAndAnalyze}
                    />
                );
            }

            return <div key={index}>{renderMarkdownText(part)}</div>;
        });
    };

    return (
        <div className={`copilot-message ${message.role}`}>
            {/* JetBrains style Message Header */}
            <div className="copilot-msg-meta">
                <div className="copilot-msg-author">
                    {isUser ? (
                        userAvatarUrl ? (
                            <img src={userAvatarUrl} alt="Avatar" className="copilot-msg-avatar" />
                        ) : (
                            <div className="copilot-msg-avatar user-icon">
                                <span>{userLogin ? userLogin.slice(0, 2).toUpperCase() : "U"}</span>
                            </div>
                        )
                    ) : (
                        <div className="copilot-msg-avatar copilot-icon">
                            <Icons.Sparkles style={{ width: 12, height: 12 }} />
                        </div>
                    )}
                    <span className="copilot-msg-name">{isUser ? userLogin || "You" : "GitHub Copilot"}</span>
                </div>
                {message.timestamp && <span className="copilot-msg-time">{formatTime(message.timestamp)}</span>}
            </div>

            {/* Context tag if terminal output was attached */}
            {message.terminalContextSnippet && (
                <div className="copilot-terminal-context-tag" title="Attached last 50 lines of remote terminal buffer">
                    <span className="copilot-context-dot" />
                    <Icons.Terminal style={{ width: 11, height: 11 }} />
                    <span>Terminal Buffer (Last 50 Lines) Attached</span>
                </div>
            )}

            {/* Message Bubble */}
            <div className="copilot-message-bubble">{renderContent(message.content)}</div>
        </div>
    );
};

interface CommandCodeBlockProps {
    code: string;
    lang: string;
    isExecutable: boolean;
    onRunCommand: (code: string) => void;
    onRunAndAnalyze: (code: string) => void;
}

const CommandCodeBlock: React.FC<CommandCodeBlockProps> = ({
    code,
    lang,
    isExecutable,
    onRunCommand,
    onRunAndAnalyze,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="copilot-command-card">
            <div className="copilot-command-header">
                <div className="copilot-command-lang-wrap">
                    <span className="copilot-command-lang">{lang || "bash"}</span>
                </div>
                <div className="copilot-command-actions">
                    {isExecutable && (
                        <>
                            <button
                                className="copilot-btn-run"
                                onClick={() => onRunCommand(code)}
                                title="Run directly in the active SSH terminal session"
                            >
                                <Icons.Play style={{ width: 10, height: 10 }} /> Run in Terminal
                            </button>
                            <button
                                className="copilot-btn-analyze"
                                onClick={() => onRunAndAnalyze(code)}
                                title="Execute on remote host, capture output, and ask Copilot to analyze"
                            >
                                <Icons.Zap style={{ width: 11, height: 11 }} /> Run & Analyze
                            </button>
                        </>
                    )}
                    <button className="copilot-btn-copy" onClick={handleCopy} title="Copy command to clipboard">
                        {copied ? (
                            <>
                                <Icons.Check style={{ width: 11, height: 11, color: "#4ade80" }} /> Copied
                            </>
                        ) : (
                            <>
                                <Icons.Copy style={{ width: 11, height: 11 }} /> Copy
                            </>
                        )}
                    </button>
                </div>
            </div>
            <pre className="copilot-command-code">
                <code>{code}</code>
            </pre>
        </div>
    );
};
