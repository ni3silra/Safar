import React, { useState } from "react";
import { CopilotMessage } from "./types";
import { Icons } from "../Icons";

interface CopilotMessageItemProps {
    message: CopilotMessage;
    onRunCommand: (command: string) => void;
    onRunAndAnalyze: (command: string) => void;
}

export const CopilotMessageItem: React.FC<CopilotMessageItemProps> = ({
    message,
    onRunCommand,
    onRunAndAnalyze,
}) => {
    const isUser = message.role === "user";

    // Parse message content for markdown code blocks (e.g. ```bash ... ```)
    const renderContent = (content: string) => {
        const parts = content.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            if (part.startsWith("```") && part.endsWith("```")) {
                const lines = part.slice(3, -3).trim().split("\n");
                let lang = lines[0].trim();
                let codeLines = lines;

                // Check if first line is a language tag
                if (/^[a-zA-Z0-9_-]+$/.test(lang)) {
                    codeLines = lines.slice(1);
                } else {
                    lang = "bash";
                }

                const code = codeLines.join("\n").trim();
                const isExecutable = !isUser && (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh" || lang === "cmd" || code.startsWith("$ ") || code.length > 0);

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

            // Normal text with line breaks
            return (
                <div key={index} style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>
                    {part}
                </div>
            );
        });
    };

    return (
        <div className={`copilot-message ${message.role}`}>
            {message.terminalContextSnippet && (
                <span className="copilot-terminal-context-tag" title="Recent terminal buffer was attached as context">
                    <Icons.Terminal style={{ width: 10, height: 10 }} /> Terminal Context Attached
                </span>
            )}
            <div className="copilot-message-bubble">
                {renderContent(message.content)}
            </div>
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
                <span className="copilot-command-lang">{lang || "bash"}</span>
                <div className="copilot-command-actions">
                    {isExecutable && (
                        <>
                            <button
                                className="copilot-btn-run"
                                onClick={() => onRunCommand(code)}
                                title="Type & execute directly in the interactive SSH terminal"
                            >
                                <Icons.Play style={{ width: 10, height: 10 }} /> Run in Terminal
                            </button>
                            <button
                                className="copilot-btn-analyze"
                                onClick={() => onRunAndAnalyze(code)}
                                title="Execute on server, capture output, and ask Copilot to analyze"
                            >
                                <Icons.Zap style={{ width: 11, height: 11 }} /> Run & Analyze
                            </button>
                        </>
                    )}
                    <button className="copilot-btn-copy" onClick={handleCopy} title="Copy command">
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

