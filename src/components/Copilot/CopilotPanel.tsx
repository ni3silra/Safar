import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Icons } from "../Icons";
import {
    CopilotAuthState,
    CopilotDeviceAuth,
    CopilotMessage,
    CopilotModel,
} from "./types";
import { CopilotMessageItem } from "./CopilotMessageItem";

interface CopilotPanelProps {
    sessionId: string;
    onClose: () => void;
    getTerminalOutput: (maxLines?: number) => string;
    onRunCommand: (command: string) => void;
    themeName?: string;
}

const STORAGE_KEY = "safar_copilot_auth";
const MODEL_STORAGE_KEY = "safar_copilot_model";

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
    sessionId,
    onClose,
    getTerminalOutput,
    onRunCommand,
}) => {
    // Auth State
    const [auth, setAuth] = useState<CopilotAuthState>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : { isAuthenticated: false };
        } catch {
            return { isAuthenticated: false };
        }
    });

    // Device Auth in Progress
    const [deviceAuth, setDeviceAuth] = useState<CopilotDeviceAuth | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Manual PAT / Custom Endpoint Option
    const [showManualToken, setShowManualToken] = useState(false);
    const [manualTokenInput, setManualTokenInput] = useState("");

    // Chat State
    const [model, setModel] = useState<CopilotModel>(() => {
        try {
            return (localStorage.getItem(MODEL_STORAGE_KEY) as CopilotModel) || "gpt-4o";
        } catch {
            return "gpt-4o";
        }
    });

    const [messages, setMessages] = useState<CopilotMessage[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "👋 **Welcome to Safar Copilot!**\n\nI'm your AI pair programmer for this remote SSH connection. I can analyze terminal output, diagnose errors, explain commands, and run shell commands directly into your terminal.\n\nTry clicking any quick action below or ask me anything about your server!",
            timestamp: Date.now(),
        },
    ]);

    const [inputPrompt, setInputPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [includeTerminalContext, setIncludeTerminalContext] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll messages
    useEffect(() => {
        if (typeof messagesEndRef.current?.scrollIntoView === "function") {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    // Save auth changes
    useEffect(() => {
        if (auth.isAuthenticated) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [auth]);

    // Save model changes
    useEffect(() => {
        localStorage.setItem(MODEL_STORAGE_KEY, model);
    }, [model]);

    // Clean up polling timer
    useEffect(() => {
        return () => {
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        };
    }, []);

    // ─── GitHub Device Flow Authentication ───

    const startDeviceAuth = async () => {
        try {
            setIsPolling(true);
            const resp: any = await invoke("copilot_device_code", { useCliClient: false });
            if (!resp.success || !resp.data) {
                toast.error(resp.error || "Failed to start GitHub device authorization");
                setIsPolling(false);
                return;
            }

            const data: CopilotDeviceAuth = resp.data;
            setDeviceAuth(data);

            // Copy user code to clipboard
            try {
                await navigator.clipboard.writeText(data.user_code);
                setCodeCopied(true);
                toast.success(`Code ${data.user_code} copied! Opening GitHub in browser...`);
            } catch {
                toast.info(`Your code is: ${data.user_code}`);
            }

            // Open verification URL
            try {
                await invoke("plugin:opener|open_url", { url: data.verification_uri });
            } catch {
                window.open(data.verification_uri, "_blank");
            }

            // Start polling
            pollAuth(data.device_code, data.interval || 5);
        } catch (err: any) {
            toast.error(err.message || String(err));
            setIsPolling(false);
        }
    };

    const pollAuth = (deviceCode: string, intervalSec: number) => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

        pollTimerRef.current = setTimeout(async () => {
            try {
                const resp: any = await invoke("copilot_poll_auth", {
                    deviceCode,
                    useCliClient: false,
                });

                if (resp.success && resp.data) {
                    const status = resp.data.status;
                    if (status === "success" && resp.data.access_token) {
                        const accessToken = resp.data.access_token;
                        // Fetch user profile
                        const userResp: any = await invoke("copilot_get_user", { accessToken });
                        const user = userResp.success ? userResp.data : { login: "github-user" };

                        // Fetch Copilot session token
                        const tokenResp: any = await invoke("copilot_get_token", { accessToken });
                        const tokenData = tokenResp.success ? tokenResp.data : null;

                        setAuth({
                            isAuthenticated: true,
                            accessToken,
                            copilotToken: tokenData?.token || accessToken,
                            isCopilotSubscriber: tokenData?.is_copilot_token ?? false,
                            endpoint: tokenData?.endpoint || "https://models.inference.ai.azure.com",
                            user,
                        });

                        setDeviceAuth(null);
                        setIsPolling(false);
                        toast.success(`Successfully signed in as @${user.login}!`);
                        return;
                    } else if (status === "pending") {
                        pollAuth(deviceCode, intervalSec);
                    } else if (status === "slow_down") {
                        const newInterval = resp.data.interval || intervalSec + 5;
                        pollAuth(deviceCode, newInterval);
                    } else if (status === "expired") {
                        toast.error("Device code expired. Please try signing in again.");
                        setDeviceAuth(null);
                        setIsPolling(false);
                    } else {
                        toast.error(resp.data.error || "Authentication failed");
                        setDeviceAuth(null);
                        setIsPolling(false);
                    }
                } else {
                    pollAuth(deviceCode, intervalSec);
                }
            } catch {
                pollAuth(deviceCode, intervalSec);
            }
        }, intervalSec * 1000);
    };

    const handleManualTokenSubmit = async () => {
        const token = manualTokenInput.trim();
        if (!token) return;

        try {
            setIsLoading(true);
            const userResp: any = await invoke("copilot_get_user", { accessToken: token });
            const user = userResp.success ? userResp.data : { login: "user" };

            const tokenResp: any = await invoke("copilot_get_token", { accessToken: token });
            const tokenData = tokenResp.success ? tokenResp.data : null;

            setAuth({
                isAuthenticated: true,
                accessToken: token,
                copilotToken: tokenData?.token || token,
                isCopilotSubscriber: tokenData?.is_copilot_token ?? false,
                endpoint: tokenData?.endpoint || "https://models.inference.ai.azure.com",
                user,
            });

            setShowManualToken(false);
            setManualTokenInput("");
            toast.success(`Connected as @${user.login}!`);
        } catch (err: any) {
            toast.error("Failed to connect with token: " + (err.message || String(err)));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = () => {
        setAuth({ isAuthenticated: false });
        setDeviceAuth(null);
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        setIsPolling(false);
        toast.info("Signed out of GitHub Copilot");
    };

    // ─── Sending AI Queries ───

    const handleSendMessage = async (promptText?: string) => {
        const query = (promptText || inputPrompt).trim();
        if (!query || isLoading) return;

        const terminalOutput = includeTerminalContext ? getTerminalOutput(60) : "";

        const userMsg: CopilotMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: query,
            timestamp: Date.now(),
            terminalContextSnippet: terminalOutput ? terminalOutput.slice(0, 300) : undefined,
        };

        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        if (!promptText) setInputPrompt("");
        setIsLoading(true);

        try {
            // Build system prompt with terminal context
            const systemPrompt = `You are Safar Copilot, an expert AI terminal assistant and Linux/Unix system administrator communicating with a user connected to a remote server via SSH.
When suggesting terminal commands to fix problems, inspect logs, or configure services:
1. Always format executable terminal commands in markdown code blocks (\`\`\`bash ... \`\`\`).
2. Provide concise, accurate, and safe shell commands.
3. If terminal output is provided, analyze the errors and status shown in that terminal output carefully.
${
    terminalOutput
        ? `\nCURRENT TERMINAL BUFFER & RECENT OUTPUT:\n\`\`\`\n${terminalOutput}\n\`\`\`\n`
        : ""
}`;

            const chatMessages = [
                { role: "system", content: systemPrompt },
                ...newMessages.slice(-6).map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            ];

            const activeToken = auth.copilotToken || auth.accessToken || "";

            const resp: any = await invoke("copilot_chat", {
                token: activeToken,
                model,
                messages: chatMessages,
                endpoint: auth.endpoint,
            });

            if (resp.success && resp.data) {
                const assistantMsg: CopilotMessage = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: resp.data,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
            } else {
                toast.error(resp.error || "Copilot query failed");
                const errorMsg: CopilotMessage = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: `⚠️ **Error communicating with Copilot:**\n\n${
                        resp.error || "Unknown error occurred"
                    }`,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, errorMsg]);
            }
        } catch (err: any) {
            toast.error(err.message || String(err));
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Run Command & Feed Back Output to AI ───

    const handleRunAndAnalyze = async (command: string) => {
        try {
            setIsLoading(true);
            toast.info(`Executing "${command}" on remote server...`);

            // Execute command via SSH one-shot channel
            const execResp: any = await invoke("ssh_execute", {
                sessionId,
                command,
            });

            const output = execResp.success ? (execResp.data || "(No output returned)") : `Error: ${execResp.error}`;

            // Add execution note and output to chat
            const userAnalysisPrompt = `I executed the following command on the server:\n\`\`\`bash\n${command}\n\`\`\`\n\nCommand output received from remote server:\n\`\`\`\n${output}\n\`\`\`\n\nPlease analyze this result and tell me what it means and what action I should take next.`;

            await handleSendMessage(userAnalysisPrompt);
        } catch (err: any) {
            toast.error("Execution failed: " + (err.message || String(err)));
            setIsLoading(false);
        }
    };

    return (
        <div className="copilot-panel">
            {/* Header */}
            <div className="copilot-header">
                <div className="copilot-header-brand">
                    <div className="copilot-sparkle-badge">
                        <Icons.Sparkles style={{ width: 14, height: 14 }} />
                    </div>
                    <span>Copilot</span>
                </div>

                <div className="copilot-header-actions">
                    {auth.isAuthenticated && (
                        <>
                            <select
                                className="copilot-model-select"
                                value={model}
                                onChange={(e) => setModel(e.target.value as CopilotModel)}
                                title="Select AI Model"
                            >
                                <option value="gpt-4o">GPT-4o</option>
                                <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                                <option value="gpt-4o-mini">GPT-4o Mini</option>
                                <option value="o1-mini">o1-mini</option>
                            </select>

                            <div
                                className="copilot-user-pill"
                                title={`Signed in as @${auth.user?.login || "user"}`}
                            >
                                {auth.user?.avatar_url && (
                                    <img
                                        src={auth.user.avatar_url}
                                        alt="Avatar"
                                        className="copilot-user-avatar"
                                    />
                                )}
                                <span>@{auth.user?.login || "user"}</span>
                                <button
                                    onClick={handleSignOut}
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                        padding: 0,
                                        display: "flex",
                                    }}
                                    title="Sign Out"
                                >
                                    <Icons.X style={{ width: 10, height: 10 }} />
                                </button>
                            </div>
                        </>
                    )}

                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            borderRadius: "4px",
                        }}
                        title="Close Copilot Panel [Ctrl+Shift+I]"
                    >
                        <Icons.X style={{ width: 13, height: 13 }} />
                    </button>
                </div>
            </div>

            {/* Authentication Screen if not logged in */}
            {!auth.isAuthenticated ? (
                <div className="copilot-auth-container">
                    <div className="copilot-auth-card">
                        <div className="copilot-auth-icon-wrap">
                            <Icons.Sparkles style={{ width: 28, height: 28 }} />
                        </div>
                        <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600 }}>
                            Sign in to GitHub Copilot
                        </h3>
                        <p
                            style={{
                                margin: "0 0 18px 0",
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                lineHeight: 1.5,
                            }}
                        >
                            Log in via standard URL device authentication just like GitHub Copilot in any IDE.
                        </p>

                        {!deviceAuth ? (
                            <>
                                <button
                                    onClick={startDeviceAuth}
                                    disabled={isPolling}
                                    style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "8px",
                                        padding: "10px 16px",
                                        background: "linear-gradient(135deg, #238636, #2ea043)",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontWeight: 600,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        boxShadow: "0 4px 12px rgba(35, 134, 54, 0.35)",
                                    }}
                                >
                                    <Icons.Copilot style={{ width: 16, height: 16 }} />
                                    Sign In with GitHub (URL Auth)
                                </button>

                                <div style={{ marginTop: "16px" }}>
                                    <button
                                        onClick={() => setShowManualToken(!showManualToken)}
                                        style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--text-muted)",
                                            fontSize: "11px",
                                            cursor: "pointer",
                                            textDecoration: "underline",
                                        }}
                                    >
                                        {showManualToken
                                            ? "Hide Token Input"
                                            : "Or use Personal Access Token / Custom Key"}
                                    </button>
                                </div>

                                {showManualToken && (
                                    <div
                                        style={{
                                            marginTop: "12px",
                                            width: "100%",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "8px",
                                        }}
                                    >
                                        <input
                                            type="password"
                                            placeholder="Paste GitHub Token (ghp_... or ghu_...)"
                                            value={manualTokenInput}
                                            onChange={(e) => setManualTokenInput(e.target.value)}
                                            style={{
                                                padding: "8px 10px",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-default)",
                                                background: "var(--bg-primary)",
                                                color: "var(--text-primary)",
                                                fontSize: "12px",
                                            }}
                                        />
                                        <button
                                            onClick={handleManualTokenSubmit}
                                            disabled={!manualTokenInput.trim() || isLoading}
                                            style={{
                                                padding: "8px",
                                                borderRadius: "6px",
                                                background: "var(--accent-primary)",
                                                color: "white",
                                                border: "none",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Connect Token
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="copilot-device-code-box">
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                    Enter this code at GitHub:
                                </span>
                                <div className="copilot-user-code">{deviceAuth.user_code}</div>

                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(deviceAuth.user_code);
                                        setCodeCopied(true);
                                        try {
                                            invoke("plugin:opener|open_url", { url: deviceAuth.verification_uri });
                                        } catch {
                                            window.open(deviceAuth.verification_uri, "_blank");
                                        }
                                        toast.success("Code copied! Opening GitHub...");
                                    }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        padding: "8px 14px",
                                        borderRadius: "6px",
                                        background: "var(--accent-primary)",
                                        color: "white",
                                        border: "none",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                    }}
                                >
                                    <Icons.ExternalLink style={{ width: 12, height: 12 }} />
                                    {codeCopied ? "Code Copied! Open GitHub Again" : "Copy Code & Open GitHub"}
                                </button>

                                <div className="copilot-device-poll-status">
                                    <Icons.Loader style={{ width: 14, height: 14 }} />
                                    <span>Waiting for your authorization in browser...</span>
                                </div>

                                <button
                                    onClick={() => {
                                        setDeviceAuth(null);
                                        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
                                        setIsPolling(false);
                                    }}
                                    style={{
                                        marginTop: "12px",
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Authenticated Chat View */
                <div className="copilot-chat-container">
                    <div className="copilot-messages-list">
                        {messages.map((message) => (
                            <CopilotMessageItem
                                key={message.id}
                                message={message}
                                onRunCommand={(cmd) => {
                                    onRunCommand(cmd);
                                    toast.success(`Sent to terminal: ${cmd}`);
                                }}
                                onRunAndAnalyze={handleRunAndAnalyze}
                            />
                        ))}

                        {isLoading && (
                            <div className="copilot-message assistant">
                                <div
                                    className="copilot-message-bubble"
                                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                                >
                                    <Icons.Loader style={{ width: 14, height: 14 }} />
                                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        Copilot is analyzing terminal output & reasoning...
                                    </span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Action Chips */}
                    <div className="copilot-chips-container">
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage("Explain what is currently displayed in the terminal and if there are any errors.")
                            }
                            title="Inspect recent terminal buffer and explain any errors"
                        >
                            🔍 Explain Terminal Error
                        </button>
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage("Check server health: uptime, CPU load, memory usage, and free disk space.")
                            }
                            title="Diagnose server health metrics"
                        >
                            🩺 Diagnose Health
                        </button>
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage("Show me listening ports and running network services on this host.")
                            }
                            title="List listening network ports"
                        >
                            🌐 Check Ports
                        </button>
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage("Find large files taking up disk space over 500MB.")
                            }
                            title="Find large disk usage files"
                        >
                            💾 Find Large Files
                        </button>
                    </div>

                    {/* Input Area */}
                    <div className="copilot-input-area">
                        <div className="copilot-context-bar">
                            <label className="copilot-context-toggle">
                                <input
                                    type="checkbox"
                                    checked={includeTerminalContext}
                                    onChange={(e) => setIncludeTerminalContext(e.target.checked)}
                                />
                                <span>Attach Terminal Output</span>
                            </label>

                            <button
                                onClick={() =>
                                    setMessages([
                                        {
                                            id: crypto.randomUUID(),
                                            role: "assistant",
                                            content: "Chat cleared. What can I help you with next?",
                                            timestamp: Date.now(),
                                        },
                                    ])
                                }
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--text-muted)",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}
                                title="Clear Chat History"
                            >
                                <Icons.Trash style={{ width: 11, height: 11 }} /> Clear
                            </button>
                        </div>

                        <div className="copilot-input-wrapper">
                            <textarea
                                ref={textareaRef}
                                className="copilot-textarea"
                                placeholder="Ask Copilot about your terminal, commands, or errors... (Enter to send)"
                                value={inputPrompt}
                                rows={1}
                                onChange={(e) => {
                                    setInputPrompt(e.target.value);
                                    // Auto grow
                                    e.target.style.height = "auto";
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                            />
                            <button
                                className="copilot-send-btn"
                                onClick={() => handleSendMessage()}
                                disabled={!inputPrompt.trim() || isLoading}
                                title="Send query to Copilot"
                            >
                                <Icons.Send />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
