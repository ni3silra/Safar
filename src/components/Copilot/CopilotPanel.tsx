import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Icons } from "../Icons";
import {
    AIProvider,
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
            const savedStr = localStorage.getItem(STORAGE_KEY);
            if (!savedStr) return { isAuthenticated: false, provider: "github" };
            const saved: CopilotAuthState = JSON.parse(savedStr);
            if (!saved.provider) saved.provider = "github";
            // Scrub deprecated / unresolvable endpoints
            if (
                saved.endpoint &&
                (saved.endpoint.includes("models.inference.ai.azure.com") ||
                    saved.endpoint.includes("models.github.ai") ||
                    saved.endpoint.includes("azure.com"))
            ) {
                if (saved.provider === "openai") saved.endpoint = "https://api.openai.com/v1";
                else if (saved.provider === "groq") saved.endpoint = "https://api.groq.com/openai/v1";
                else saved.endpoint = "https://api.githubcopilot.com";
            }
            return saved;
        } catch {
            return { isAuthenticated: false, provider: "github" };
        }
    });

    // Device Auth in Progress
    const [deviceAuth, setDeviceAuth] = useState<CopilotDeviceAuth | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Settings Modal
    const [showSettings, setShowSettings] = useState(false);
    const [settingProvider, setSettingProvider] = useState<AIProvider>(auth.provider || "github");
    const [settingApiKey, setSettingApiKey] = useState(auth.apiKey || "");
    const [settingEndpoint, setSettingEndpoint] = useState(auth.customEndpoint || "");
    const [isTestingConnection, setIsTestingConnection] = useState(false);

    // Manual PAT Option on login screen
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

    // Synchronize settings modal inputs with auth state when opening settings
    useEffect(() => {
        if (showSettings) {
            setSettingProvider(auth.provider || "github");
            setSettingApiKey(auth.apiKey || "");
            setSettingEndpoint(auth.customEndpoint || "");
        }
    }, [showSettings, auth]);

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
                        const hasCopilot = tokenResp.success && tokenResp.data?.is_copilot_token;

                        setAuth({
                            isAuthenticated: true,
                            provider: "github",
                            accessToken,
                            copilotToken: hasCopilot ? tokenResp.data.token : "",
                            isCopilotSubscriber: !!hasCopilot,
                            endpoint: hasCopilot ? tokenResp.data.endpoint : "https://api.githubcopilot.com",
                            user,
                        });

                        setDeviceAuth(null);
                        setIsPolling(false);

                        if (hasCopilot) {
                            toast.success(`Successfully connected to Copilot as @${user.login}!`);
                        } else {
                            toast.warning(
                                `Signed in as @${user.login}, but GitHub Copilot is not enabled on this account. You can enter an OpenAI or Groq key in Settings.`
                            );
                        }
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
            if (token.startsWith("sk-")) {
                // OpenAI API Key
                setAuth({
                    isAuthenticated: true,
                    provider: "openai",
                    apiKey: token,
                    endpoint: "https://api.openai.com/v1",
                    user: { login: "openai-user" },
                });
                setModel("gpt-4o");
                setShowManualToken(false);
                setManualTokenInput("");
                toast.success("Connected to OpenAI successfully!");
                return;
            } else if (token.startsWith("gsk_")) {
                // Groq API Key
                setAuth({
                    isAuthenticated: true,
                    provider: "groq",
                    apiKey: token,
                    endpoint: "https://api.groq.com/openai/v1",
                    user: { login: "groq-user" },
                });
                setModel("llama-3.3-70b-versatile");
                setShowManualToken(false);
                setManualTokenInput("");
                toast.success("Connected to Groq AI successfully!");
                return;
            }

            // Otherwise treat as GitHub Personal Access Token or Copilot session token
            const userResp: any = await invoke("copilot_get_user", { accessToken: token });
            const user = userResp.success ? userResp.data : { login: "user" };

            const tokenResp: any = await invoke("copilot_get_token", { accessToken: token });
            const hasCopilot = tokenResp.success && tokenResp.data?.is_copilot_token;

            setAuth({
                isAuthenticated: true,
                provider: "github",
                accessToken: token,
                copilotToken: hasCopilot ? tokenResp.data.token : token,
                isCopilotSubscriber: !!hasCopilot,
                endpoint: hasCopilot ? tokenResp.data.endpoint : "https://api.githubcopilot.com",
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
        setAuth({ isAuthenticated: false, provider: "github" });
        setDeviceAuth(null);
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        setIsPolling(false);
        toast.info("Signed out of Safar Copilot");
    };

    // ─── Test Connection & Settings ───

    const handleTestConnection = async () => {
        setIsTestingConnection(true);
        try {
            let tokenToTest = "";
            let endpointToTest = "";
            let modelToTest = model;

            if (settingProvider === "github") {
                tokenToTest = auth.copilotToken || auth.accessToken || "";
                endpointToTest = "https://api.githubcopilot.com";
            } else if (settingProvider === "openai") {
                tokenToTest = settingApiKey.trim();
                endpointToTest = settingEndpoint.trim() || "https://api.openai.com/v1";
                modelToTest = "gpt-4o-mini";
            } else if (settingProvider === "groq") {
                tokenToTest = settingApiKey.trim();
                endpointToTest = settingEndpoint.trim() || "https://api.groq.com/openai/v1";
                modelToTest = "llama-3.3-70b-versatile";
            } else {
                tokenToTest = settingApiKey.trim();
                endpointToTest = settingEndpoint.trim();
            }

            if (!tokenToTest) {
                toast.error("Please enter an API key or log in with GitHub first.");
                setIsTestingConnection(false);
                return;
            }

            const resp: any = await invoke("copilot_chat", {
                token: tokenToTest,
                model: modelToTest,
                messages: [{ role: "user", content: "Ping: Respond with 'Safar AI Connected'." }],
                endpoint: endpointToTest,
            });

            if (resp.success) {
                toast.success("AI connection verified successfully!");
            } else {
                toast.error(`Connection test failed: ${resp.error}`);
            }
        } catch (err: any) {
            toast.error(err.message || String(err));
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleSaveSettings = () => {
        const isAuthed =
            settingProvider === "github" ? auth.isAuthenticated : !!settingApiKey.trim();

        const resolvedEndpoint =
            settingProvider === "openai"
                ? settingEndpoint.trim() || "https://api.openai.com/v1"
                : settingProvider === "groq"
                ? settingEndpoint.trim() || "https://api.groq.com/openai/v1"
                : settingProvider === "custom"
                ? settingEndpoint.trim()
                : "https://api.githubcopilot.com";

        setAuth({
            ...auth,
            isAuthenticated: isAuthed,
            provider: settingProvider,
            apiKey: settingApiKey.trim(),
            customEndpoint: settingEndpoint.trim(),
            endpoint: resolvedEndpoint,
            user:
                auth.user || {
                    login: settingProvider === "openai" ? "openai" : settingProvider === "groq" ? "groq" : "custom-ai",
                },
        });

        if (settingProvider === "groq" && !model.includes("llama")) {
            setModel("llama-3.3-70b-versatile");
        } else if (settingProvider === "openai" && model.includes("claude")) {
            setModel("gpt-4o");
        }

        setShowSettings(false);
        toast.success("AI settings saved!");
    };

    // ─── Sending AI Queries ───

    const handleSendMessage = async (promptText?: string) => {
        const query = (promptText || inputPrompt).trim();
        if (!query || isLoading) return;

        // Determine token to use
        let activeToken = "";
        let activeEndpoint = auth.endpoint || "";

        if (auth.provider === "openai" || auth.provider === "groq" || auth.provider === "custom") {
            activeToken = auth.apiKey || "";
        } else {
            activeToken = auth.copilotToken || auth.accessToken || "";
        }

        if (!activeToken) {
            toast.error("Please configure an API key or log in to GitHub Copilot.");
            setShowSettings(true);
            return;
        }

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

            const resp: any = await invoke("copilot_chat", {
                token: activeToken,
                model,
                messages: chatMessages,
                endpoint: activeEndpoint,
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

            const output = execResp.success ? execResp.data || "(No output returned)" : `Error: ${execResp.error}`;

            // Add execution note and output to chat
            const userAnalysisPrompt = `I executed the following command on the server:\n\`\`\`bash\n${command}\n\`\`\`\n\nCommand output received from remote server:\n\`\`\`\n${output}\n\`\`\`\n\nPlease analyze this result and tell me what it means and what action I should take next.`;

            await handleSendMessage(userAnalysisPrompt);
        } catch (err: any) {
            toast.error("Execution failed: " + (err.message || String(err)));
            setIsLoading(false);
        }
    };

    const hasNoCopilotPlan =
        auth.isAuthenticated &&
        auth.provider === "github" &&
        !auth.isCopilotSubscriber &&
        !auth.apiKey;

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
                                {auth.provider === "groq" ? (
                                    <>
                                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                                        <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
                                    </>
                                ) : auth.provider === "openai" ? (
                                    <>
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        <option value="o1-mini">o1-mini</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        <option value="o1-mini">o1-mini</option>
                                    </>
                                )}
                            </select>

                            <button
                                className="copilot-header-btn"
                                onClick={() => setShowSettings(true)}
                                title="AI Settings & API Keys"
                            >
                                <Icons.Settings style={{ width: 14, height: 14 }} />
                            </button>

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

                    {!auth.isAuthenticated && (
                        <button
                            className="copilot-header-btn"
                            onClick={() => setShowSettings(true)}
                            title="AI Settings & API Keys"
                        >
                            <Icons.Settings style={{ width: 14, height: 14 }} />
                        </button>
                    )}

                    <button
                        className="copilot-header-btn"
                        onClick={onClose}
                        title="Close Copilot Panel [Ctrl+Shift+I]"
                    >
                        <Icons.X style={{ width: 13, height: 13 }} />
                    </button>
                </div>
            </div>

            {/* AI Settings Modal */}
            {showSettings && (
                <div className="copilot-settings-overlay">
                    <div className="copilot-settings-modal">
                        <div className="copilot-settings-header">
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Icons.Settings style={{ width: 14, height: 14 }} />
                                AI Provider & Key Settings
                            </span>
                            <button
                                onClick={() => setShowSettings(false)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--text-muted)",
                                    cursor: "pointer",
                                }}
                            >
                                <Icons.X style={{ width: 12, height: 12 }} />
                            </button>
                        </div>

                        <div className="copilot-settings-body">
                            <div>
                                <label className="copilot-field-label">AI Service Provider</label>
                                <select
                                    className="copilot-field-select"
                                    value={settingProvider}
                                    onChange={(e) => setSettingProvider(e.target.value as AIProvider)}
                                >
                                    <option value="github">GitHub Copilot (OAuth URL Login)</option>
                                    <option value="openai">OpenAI (GPT-4o, GPT-4o Mini)</option>
                                    <option value="groq">Groq (Ultra-fast, Free API)</option>
                                    <option value="custom">Custom OpenAI-Compatible (Ollama, etc.)</option>
                                </select>
                            </div>

                            {settingProvider === "github" ? (
                                <div
                                    style={{
                                        padding: "10px",
                                        borderRadius: "6px",
                                        background: "var(--bg-primary)",
                                        border: "1px solid var(--border-default)",
                                        fontSize: "12px",
                                        color: "var(--text-secondary)",
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {auth.isAuthenticated && auth.user ? (
                                        <div>
                                            Signed in as <strong>@{auth.user.login}</strong>.
                                            <div style={{ marginTop: "4px" }}>
                                                Copilot Subscription:{" "}
                                                <strong
                                                    style={{
                                                        color: auth.isCopilotSubscriber ? "#4ade80" : "#f87171",
                                                    }}
                                                >
                                                    {auth.isCopilotSubscriber ? "Active" : "Not Found"}
                                                </strong>
                                            </div>
                                            {!auth.isCopilotSubscriber && (
                                                <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                                                    If your GitHub account does not have a Copilot subscription, switch to
                                                    OpenAI, Groq (free), or Custom above.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            Use GitHub Device Flow to sign in with your GitHub account.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="copilot-field-label">
                                            {settingProvider === "openai"
                                                ? "OpenAI API Key (sk-...)"
                                                : settingProvider === "groq"
                                                ? "Groq API Key (gsk_...)"
                                                : "API Key / Bearer Token"}
                                        </label>
                                        <input
                                            type="password"
                                            className="copilot-field-input"
                                            placeholder={
                                                settingProvider === "openai"
                                                    ? "sk-proj-..."
                                                    : settingProvider === "groq"
                                                    ? "gsk_..."
                                                    : "API Token or Key"
                                            }
                                            value={settingApiKey}
                                            onChange={(e) => setSettingApiKey(e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="copilot-field-label">
                                            Endpoint URL{" "}
                                            <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                                                (Optional)
                                            </span>
                                        </label>
                                        <input
                                            type="text"
                                            className="copilot-field-input"
                                            placeholder={
                                                settingProvider === "openai"
                                                    ? "https://api.openai.com/v1"
                                                    : settingProvider === "groq"
                                                    ? "https://api.groq.com/openai/v1"
                                                    : "http://localhost:11434/v1"
                                            }
                                            value={settingEndpoint}
                                            onChange={(e) => setSettingEndpoint(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="copilot-settings-footer">
                            <button
                                onClick={handleTestConnection}
                                disabled={isTestingConnection}
                                style={{
                                    background: "transparent",
                                    border: "1px solid var(--border-default)",
                                    color: "var(--text-primary)",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                }}
                            >
                                {isTestingConnection ? "Testing..." : "Test Connection"}
                            </button>

                            <button
                                onClick={handleSaveSettings}
                                style={{
                                    background: "var(--accent-primary)",
                                    border: "none",
                                    color: "white",
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                            ? "Hide Key Input"
                                            : "Or enter OpenAI / Groq / Custom API Key"}
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
                                            placeholder="Paste OpenAI (sk-...) or Groq (gsk_...) Key"
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
                                            Connect API Key
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
                    {/* Notice if GitHub account has no active Copilot subscription */}
                    {hasNoCopilotPlan && (
                        <div className="copilot-banner-warning">
                            <div>
                                ⚠️ <strong>Copilot Subscription Not Found</strong> for @{auth.user?.login}.
                                GitHub Copilot requires a paid subscription. You can add a free Groq key or OpenAI key
                                to chat with AI and analyze terminal commands.
                            </div>
                            <button
                                className="copilot-banner-btn"
                                onClick={() => setShowSettings(true)}
                            >
                                Configure API Key
                            </button>
                        </div>
                    )}

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
                                handleSendMessage(
                                    "Explain what is currently displayed in the terminal and if there are any errors."
                                )
                            }
                            title="Inspect recent terminal buffer and explain any errors"
                        >
                            🔍 Explain Terminal Error
                        </button>
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage(
                                    "Check server health: uptime, CPU load, memory usage, and free disk space."
                                )
                            }
                            title="Diagnose server health metrics"
                        >
                            🩺 Diagnose Health
                        </button>
                        <button
                            className="copilot-chip"
                            onClick={() =>
                                handleSendMessage(
                                    "Show me listening ports and running network services on this host."
                                )
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
