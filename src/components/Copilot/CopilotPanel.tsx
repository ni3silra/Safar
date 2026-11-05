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
    CopilotModelInfo,
    buildProxyUrl,
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
    const [settingSystemPrompt, setSettingSystemPrompt] = useState(auth.customSystemPrompt || "");
    const [isTestingConnection, setIsTestingConnection] = useState(false);

    // Corporate HTTP Proxy settings
    const [settingUseProxy, setSettingUseProxy] = useState(auth.useProxy ?? false);
    const [settingProxyHost, setSettingProxyHost] = useState(auth.proxyHost || "");
    const [settingProxyPort, setSettingProxyPort] = useState(auth.proxyPort || "8080");
    const [settingProxyAuthEnabled, setSettingProxyAuthEnabled] = useState(auth.proxyAuthEnabled ?? false);
    const [settingProxyLogin, setSettingProxyLogin] = useState(auth.proxyLogin || "");
    const [settingProxyPassword, setSettingProxyPassword] = useState(auth.proxyPassword || "");
    const [settingIgnoreSsl, setSettingIgnoreSsl] = useState(auth.ignoreSslErrors ?? false);

    // Manual PAT Option on login screen
    const [showManualToken, setShowManualToken] = useState(false);
    const [manualTokenInput, setManualTokenInput] = useState("");

    // Chat State
    const [model, setModel] = useState<CopilotModel>(() => {
        try {
            const saved = (localStorage.getItem(MODEL_STORAGE_KEY) as CopilotModel) || "auto";
            return saved || "auto";
        } catch {
            return "auto";
        }
    });

    const [availableModels, setAvailableModels] = useState<CopilotModelInfo[]>([]);

    const [messages, setMessages] = useState<CopilotMessage[]>([]);

    const [inputPrompt, setInputPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [includeTerminalContext, setIncludeTerminalContext] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const getProxyParams = (targetAuth: Partial<CopilotAuthState>) => ({
        proxy: targetAuth.useProxy && targetAuth.proxyHost ? buildProxyUrl(targetAuth) : undefined,
        proxyUser: targetAuth.useProxy && targetAuth.proxyAuthEnabled ? targetAuth.proxyLogin : undefined,
        proxyPass: targetAuth.useProxy && targetAuth.proxyAuthEnabled ? targetAuth.proxyPassword : undefined,
        ignoreSsl: targetAuth.ignoreSslErrors ?? false,
    });

    // Dynamic model discovery from GitHub Copilot or AI provider
    useEffect(() => {
        if (!auth.isAuthenticated) {
            setAvailableModels([]);
            return;
        }

        const activeToken =
            auth.provider === "openai" || auth.provider === "groq" || auth.provider === "custom"
                ? auth.apiKey || ""
                : auth.copilotToken || auth.accessToken || "";

        if (!activeToken) return;

        invoke("copilot_get_models", {
            token: activeToken,
            endpoint: auth.endpoint || "",
            ...getProxyParams(auth),
        })
            .then((res: any) => {
                if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
                    setAvailableModels(res.data);
                }
            })
            .catch(() => {});
    }, [
        auth.isAuthenticated,
        auth.provider,
        auth.copilotToken,
        auth.accessToken,
        auth.apiKey,
        auth.endpoint,
        auth.useProxy,
        auth.proxyHost,
        auth.proxyPort,
        auth.proxyAuthEnabled,
        auth.proxyLogin,
        auth.proxyPassword,
        auth.ignoreSslErrors,
    ]);

    // Auto-scroll messages
    useEffect(() => {
        if (typeof messagesEndRef.current?.scrollIntoView === "function") {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    // Save auth changes
    useEffect(() => {
        if (auth.isAuthenticated || auth.useProxy || auth.apiKey) {
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
            setSettingSystemPrompt(auth.customSystemPrompt || "");
            setSettingUseProxy(auth.useProxy ?? false);
            setSettingProxyHost(auth.proxyHost || "");
            setSettingProxyPort(auth.proxyPort || "8080");
            setSettingProxyAuthEnabled(auth.proxyAuthEnabled ?? false);
            setSettingProxyLogin(auth.proxyLogin || "");
            setSettingProxyPassword(auth.proxyPassword || "");
            setSettingIgnoreSsl(auth.ignoreSslErrors ?? false);
        }
    }, [showSettings, auth]);

    // ─── GitHub Device Flow Authentication ───

    const startDeviceAuth = async () => {
        try {
            setIsPolling(true);
            const resp: any = await invoke("copilot_device_code", {
                useCliClient: false,
                ...getProxyParams(auth),
            });
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
                    ...getProxyParams(auth),
                });

                if (resp.success && resp.data) {
                    const status = resp.data.status;
                    if (status === "success" && resp.data.access_token) {
                        const accessToken = resp.data.access_token;
                        // Fetch user profile
                        const userResp: any = await invoke("copilot_get_user", {
                            accessToken,
                            ...getProxyParams(auth),
                        });
                        const user = userResp.success ? userResp.data : { login: "github-user" };

                        // Fetch Copilot session token
                        const tokenResp: any = await invoke("copilot_get_token", {
                            accessToken,
                            ...getProxyParams(auth),
                        });
                        const hasCopilot = tokenResp.success && tokenResp.data?.is_copilot_token;

                        setAuth((prev) => ({
                            ...prev,
                            isAuthenticated: true,
                            provider: "github",
                            accessToken,
                            copilotToken: hasCopilot ? tokenResp.data.token : "",
                            isCopilotSubscriber: !!hasCopilot,
                            endpoint: hasCopilot ? tokenResp.data.endpoint : "https://api.githubcopilot.com",
                            user,
                        }));

                        setDeviceAuth(null);
                        setIsPolling(false);

                        if (hasCopilot) {
                            toast.success(`Connected to GitHub Copilot as @${user.login}!`);
                        } else {
                            toast.warning(
                                `Signed in as @${user.login}, but GitHub Copilot is not active on this account. You can enter an OpenAI or Groq key in Settings.`
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
                setAuth((prev) => ({
                    ...prev,
                    isAuthenticated: true,
                    provider: "openai",
                    apiKey: token,
                    endpoint: "https://api.openai.com/v1",
                    user: { login: "openai-user" },
                }));
                setModel("gpt-4o");
                setShowManualToken(false);
                setManualTokenInput("");
                toast.success("Connected to OpenAI successfully!");
                return;
            } else if (token.startsWith("gsk_")) {
                setAuth((prev) => ({
                    ...prev,
                    isAuthenticated: true,
                    provider: "groq",
                    apiKey: token,
                    endpoint: "https://api.groq.com/openai/v1",
                    user: { login: "groq-user" },
                }));
                setModel("llama-3.3-70b-versatile");
                setShowManualToken(false);
                setManualTokenInput("");
                toast.success("Connected to Groq AI successfully!");
                return;
            }

            const userResp: any = await invoke("copilot_get_user", {
                accessToken: token,
                ...getProxyParams(auth),
            });
            const user = userResp.success ? userResp.data : { login: "user" };

            const tokenResp: any = await invoke("copilot_get_token", {
                accessToken: token,
                ...getProxyParams(auth),
            });
            const hasCopilot = tokenResp.success && tokenResp.data?.is_copilot_token;

            setAuth((prev) => ({
                ...prev,
                isAuthenticated: true,
                provider: "github",
                accessToken: token,
                copilotToken: hasCopilot ? tokenResp.data.token : token,
                isCopilotSubscriber: !!hasCopilot,
                endpoint: hasCopilot ? tokenResp.data.endpoint : "https://api.githubcopilot.com",
                user,
            }));

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
        setAuth((prev) => ({
            isAuthenticated: false,
            provider: "github",
            // Preserve proxy configuration across sign-out
            useProxy: prev.useProxy,
            proxyHost: prev.proxyHost,
            proxyPort: prev.proxyPort,
            proxyAuthEnabled: prev.proxyAuthEnabled,
            proxyLogin: prev.proxyLogin,
            proxyPassword: prev.proxyPassword,
            proxyUrl: prev.proxyUrl,
            ignoreSslErrors: prev.ignoreSslErrors,
        }));
        setDeviceAuth(null);
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        setIsPolling(false);
        toast.info("Signed out of GitHub Copilot");
    };

    const handleNewChat = () => {
        setMessages([]);
        setInputPrompt("");
        toast.info("Started new Copilot chat");
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

            const testProxy = buildProxyUrl({
                useProxy: settingUseProxy,
                proxyHost: settingProxyHost,
                proxyPort: settingProxyPort,
                proxyAuthEnabled: settingProxyAuthEnabled,
                proxyLogin: settingProxyLogin,
                proxyPassword: settingProxyPassword,
            });
            const testProxyUser = settingUseProxy && settingProxyAuthEnabled ? settingProxyLogin.trim() : undefined;
            const testProxyPass = settingUseProxy && settingProxyAuthEnabled ? settingProxyPassword : undefined;
            const testIgnoreSsl = settingIgnoreSsl;

            const resp: any = await invoke("copilot_chat", {
                token: tokenToTest,
                model: modelToTest,
                messages: [{ role: "user", content: "Ping: Respond with 'Safar AI Connected'." }],
                endpoint: endpointToTest,
                proxy: testProxy,
                proxyUser: testProxyUser,
                proxyPass: testProxyPass,
                ignoreSsl: testIgnoreSsl,
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

        const proxyConfig = {
            useProxy: settingUseProxy,
            proxyHost: settingProxyHost.trim(),
            proxyPort: settingProxyPort.trim() || "8080",
            proxyAuthEnabled: settingProxyAuthEnabled,
            proxyLogin: settingProxyLogin.trim(),
            proxyPassword: settingProxyPassword,
            ignoreSslErrors: settingIgnoreSsl,
        };

        const computedProxyUrl = buildProxyUrl(proxyConfig);

        setAuth({
            ...auth,
            isAuthenticated: isAuthed,
            provider: settingProvider,
            apiKey: settingApiKey.trim(),
            customEndpoint: settingEndpoint.trim(),
            customSystemPrompt: settingSystemPrompt.trim(),
            endpoint: resolvedEndpoint,
            ...proxyConfig,
            proxyUrl: computedProxyUrl,
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

    const handleSendMessage = async (promptText?: string, maxLines: number = 50) => {
        const query = (promptText || inputPrompt).trim();
        if (!query || isLoading) return;

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

        const terminalOutput = includeTerminalContext ? getTerminalOutput(maxLines) : "";

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
            const defaultBasePrompt = `You are Safar Copilot, an expert AI terminal assistant and Linux/Unix system administrator communicating with a user connected to a remote server via SSH.
When suggesting terminal commands to fix problems, inspect logs, or configure services:
1. Always format executable terminal commands in markdown code blocks (\`\`\`bash ... \`\`\`).
2. Provide concise, accurate, and safe shell commands.
3. If terminal output is provided, analyze the errors and status shown in that terminal output carefully.`;

            const basePrompt = auth.customSystemPrompt?.trim() || defaultBasePrompt;

            const systemPrompt = `${basePrompt}${
                terminalOutput
                    ? `\n\nCURRENT TERMINAL BUFFER & RECENT OUTPUT:\n\`\`\`\n${terminalOutput}\n\`\`\`\n`
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
                ...getProxyParams(auth),
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

            const execResp: any = await invoke("ssh_execute", {
                sessionId,
                command,
            });

            const output = execResp.success ? execResp.data || "(No output returned)" : `Error: ${execResp.error}`;

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
        <div className="copilot-panel copilot-idea-theme">
            {/* JetBrains IDEA Tool Window Header */}
            <div className="copilot-header">
                <div className="copilot-header-brand">
                    <div className="copilot-sparkle-badge" title="GitHub Copilot">
                        <Icons.Sparkles style={{ width: 14, height: 14 }} />
                    </div>
                    <span className="copilot-title-text">GitHub Copilot</span>
                    <span className="copilot-chat-pill">Chat</span>
                </div>

                <div className="copilot-header-actions">
                    {auth.isAuthenticated && (
                        <>
                            {/* New Chat Button */}
                            <button
                                className="copilot-header-btn"
                                onClick={handleNewChat}
                                title="New Chat (Clear session)"
                            >
                                <Icons.Plus style={{ width: 13, height: 13 }} />
                            </button>

                            {/* Warning Indicator on Icon (instead of full chat banner) */}
                            {hasNoCopilotPlan && (
                                <button
                                    className="copilot-header-warning-btn"
                                    onClick={() => setShowSettings(true)}
                                    title={`Copilot subscription not found for @${auth.user?.login || "user"}. Click to configure an OpenAI or Groq API key in Settings.`}
                                >
                                    <Icons.AlertTriangle style={{ width: 13, height: 13, color: "#facc15" }} />
                                </button>
                            )}

                            {/* Settings Button */}
                            <button
                                className="copilot-header-btn"
                                onClick={() => setShowSettings(true)}
                                title="AI Settings & API Keys"
                            >
                                <Icons.Settings style={{ width: 13, height: 13 }} />
                            </button>

                            {/* User Pill */}
                            <div
                                className={`copilot-user-pill ${hasNoCopilotPlan ? "has-warning" : ""}`}
                                title={
                                    hasNoCopilotPlan
                                        ? `Copilot subscription not detected for @${auth.user?.login || "user"}. Click to configure API key.`
                                        : `Signed in as @${auth.user?.login || "user"}`
                                }
                                onClick={hasNoCopilotPlan ? () => setShowSettings(true) : undefined}
                                style={hasNoCopilotPlan ? { cursor: "pointer" } : undefined}
                            >
                                {hasNoCopilotPlan ? (
                                    <Icons.AlertTriangle style={{ width: 11, height: 11, color: "#facc15", flexShrink: 0 }} />
                                ) : auth.user?.avatar_url ? (
                                    <img
                                        src={auth.user.avatar_url}
                                        alt="Avatar"
                                        className="copilot-user-avatar"
                                    />
                                ) : null}
                                <span>@{auth.user?.login || "user"}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSignOut();
                                    }}
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
                                    <Icons.X style={{ width: 9, height: 9 }} />
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
                            <Icons.Settings style={{ width: 13, height: 13 }} />
                        </button>
                    )}

                    {/* Close Panel Button */}
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

                            {/* System Prompt Override */}
                            <div style={{ marginTop: "12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <label className="copilot-field-label" style={{ margin: 0 }}>
                                        System Prompt Override{" "}
                                        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                                            (Optional)
                                        </span>
                                    </label>
                                    {settingSystemPrompt && (
                                        <button
                                            type="button"
                                            onClick={() => setSettingSystemPrompt("")}
                                            style={{
                                                background: "transparent",
                                                border: "none",
                                                color: "#60a5fa",
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                padding: 0,
                                            }}
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    className="copilot-field-input"
                                    rows={4}
                                    placeholder="Leave blank to use default Safar assistant prompt, or enter custom instructions..."
                                    value={settingSystemPrompt}
                                    onChange={(e) => setSettingSystemPrompt(e.target.value)}
                                    style={{
                                        resize: "vertical",
                                        fontFamily: "inherit",
                                        fontSize: "12px",
                                        lineHeight: 1.45,
                                        minHeight: "70px",
                                    }}
                                />
                                <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "4px" }}>
                                    Overrides the base persona instructions while preserving attached terminal buffers.
                                </div>
                            </div>

                            {/* Customize HTTP proxy (Corporate Proxy Configuration) */}
                            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border-default)" }}>
                                <label
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        fontSize: "12.5px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        color: "var(--text-primary)",
                                        marginBottom: settingUseProxy ? "12px" : "4px",
                                        userSelect: "none",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={settingUseProxy}
                                        onChange={(e) => setSettingUseProxy(e.target.checked)}
                                        style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                                    />
                                    <span>Customize HTTP proxy</span>
                                </label>

                                {settingUseProxy && (
                                    <div style={{ paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {/* Host name */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <label
                                                style={{
                                                    width: "90px",
                                                    fontSize: "12px",
                                                    color: "var(--text-secondary)",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                Host name:
                                            </label>
                                            <input
                                                type="text"
                                                className="copilot-field-input"
                                                placeholder="sp-surf-proxy.intranet.db.com"
                                                value={settingProxyHost}
                                                onChange={(e) => setSettingProxyHost(e.target.value)}
                                                style={{ flex: 1, fontFamily: "monospace", fontSize: "12px" }}
                                            />
                                        </div>

                                        {/* Port number */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <label
                                                style={{
                                                    width: "90px",
                                                    fontSize: "12px",
                                                    color: "var(--text-secondary)",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                Port number:
                                            </label>
                                            <input
                                                type="text"
                                                className="copilot-field-input"
                                                placeholder="8080"
                                                value={settingProxyPort}
                                                onChange={(e) => setSettingProxyPort(e.target.value)}
                                                style={{ width: "100px", fontFamily: "monospace", fontSize: "12px" }}
                                            />
                                        </div>

                                        {/* Proxy authentication */}
                                        <div style={{ marginTop: "2px" }}>
                                            <label
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px",
                                                    fontSize: "12px",
                                                    fontWeight: 500,
                                                    cursor: "pointer",
                                                    color: "var(--text-primary)",
                                                    marginBottom: settingProxyAuthEnabled ? "8px" : "2px",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={settingProxyAuthEnabled}
                                                    onChange={(e) => setSettingProxyAuthEnabled(e.target.checked)}
                                                    style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                                                />
                                                <span>Proxy authentication</span>
                                            </label>

                                            {settingProxyAuthEnabled && (
                                                <div style={{ paddingLeft: "22px", display: "flex", flexDirection: "column", gap: "8px" }}>
                                                    {/* Login */}
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                        <label
                                                            style={{
                                                                width: "70px",
                                                                fontSize: "12px",
                                                                color: "var(--text-secondary)",
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            Login:
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="copilot-field-input"
                                                            placeholder="nitin-b.silra@db.com"
                                                            value={settingProxyLogin}
                                                            onChange={(e) => setSettingProxyLogin(e.target.value)}
                                                            style={{ flex: 1, fontSize: "12px" }}
                                                        />
                                                    </div>

                                                    {/* Password */}
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                        <label
                                                            style={{
                                                                width: "70px",
                                                                fontSize: "12px",
                                                                color: "var(--text-secondary)",
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            Password:
                                                        </label>
                                                        <input
                                                            type="password"
                                                            className="copilot-field-input"
                                                            placeholder="••••••••••••••••"
                                                            value={settingProxyPassword}
                                                            onChange={(e) => setSettingProxyPassword(e.target.value)}
                                                            style={{ flex: 1, fontSize: "12px" }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Corporate / Self-Signed SSL Inspection */}
                                        <div style={{ marginTop: "4px" }}>
                                            <label
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: "8px",
                                                    fontSize: "12px",
                                                    cursor: "pointer",
                                                    color: "var(--text-primary)",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={settingIgnoreSsl}
                                                    onChange={(e) => setSettingIgnoreSsl(e.target.checked)}
                                                    style={{ width: "14px", height: "14px", marginTop: "2px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                                                />
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>Accept corporate / self-signed TLS certificates</span>
                                                    <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.35 }}>
                                                        Bypasses certificate validation if corporate proxy uses TLS inspection.
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
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
                                {auth.useProxy && auth.proxyHost && (
                                    <div
                                        style={{
                                            margin: "0 0 14px 0",
                                            padding: "6px 12px",
                                            borderRadius: "6px",
                                            background: "rgba(56, 189, 248, 0.1)",
                                            border: "1px solid rgba(56, 189, 248, 0.25)",
                                            fontSize: "11px",
                                            color: "#38bdf8",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            width: "100%",
                                            boxSizing: "border-box",
                                        }}
                                    >
                                        <span style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#38bdf8", display: "inline-block", flexShrink: 0 }}></span>
                                            Proxy: {auth.proxyHost}:{auth.proxyPort || "8080"}
                                        </span>
                                        <button
                                            onClick={() => setShowSettings(true)}
                                            style={{
                                                background: "transparent",
                                                border: "none",
                                                color: "#38bdf8",
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                textDecoration: "underline",
                                                padding: 0,
                                                marginLeft: "8px",
                                                flexShrink: 0,
                                            }}
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}

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
                    {/* Chat Messages List or JetBrains IDEA Welcome State */}
                    <div className="copilot-messages-list">
                        {messages.length === 0 ? (
                            /* JetBrains IDEA Copilot Welcome Empty State */
                            <div className="copilot-idea-welcome">
                                <div className="copilot-idea-emblem">
                                    <Icons.Sparkles style={{ width: 28, height: 28 }} />
                                </div>
                                <h2 className="copilot-idea-heading">How can Copilot help you?</h2>
                                <p className="copilot-idea-subheading">
                                    Your AI pair programmer for this remote SSH connection. Ask questions about your
                                    server, diagnose errors, or run commands directly into your terminal.
                                </p>

                                {/* JetBrains Action Cards (HP NonStop & OSS/Unix Terminal Analysis) */}
                                <div className="copilot-idea-cards-grid">
                                    <button
                                        className="copilot-idea-card"
                                        onClick={() =>
                                            handleSendMessage(
                                                "Act as an expert HP NonStop (Tandem) System Administrator and Guardian/TACL specialist. Analyze the last 50 lines of the terminal buffer: diagnose any Guardian errors, EMS events, file system issues, or process states, and recommend exact TACL / NonStop commands to resolve them.",
                                                50
                                            )
                                        }
                                    >
                                        <div className="copilot-idea-card-icon">⚡</div>
                                        <div className="copilot-idea-card-text">
                                            <div className="copilot-idea-card-title">HP NS Expert Terminal Analysis</div>
                                            <div className="copilot-idea-card-desc">
                                                Analyze TACL commands, Guardian processes, EMS event logs & NonStop system states (Last 50 lines)
                                            </div>
                                        </div>
                                    </button>

                                    <button
                                        className="copilot-idea-card"
                                        onClick={() =>
                                            handleSendMessage(
                                                "Act as an expert Unix / Linux / Open System Services (OSS) Administrator. Analyze the last 50 lines of the terminal buffer: diagnose any command failures, shell errors, permissions, or system issues, and recommend exact terminal commands to resolve them.",
                                                50
                                            )
                                        }
                                    >
                                        <div className="copilot-idea-card-icon">🐧</div>
                                        <div className="copilot-idea-card-text">
                                            <div className="copilot-idea-card-title">OSS / Unix Terminal Analysis</div>
                                            <div className="copilot-idea-card-desc">
                                                Diagnose POSIX shell, OSS commands, systemd services, CPU/RAM & error logs (Last 50 lines)
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            messages.map((message) => (
                                <CopilotMessageItem
                                    key={message.id}
                                    message={message}
                                    userAvatarUrl={auth.user?.avatar_url}
                                    userLogin={auth.user?.login}
                                    onRunCommand={(cmd) => {
                                        onRunCommand(cmd);
                                        toast.success(`Sent to terminal: ${cmd}`);
                                    }}
                                    onRunAndAnalyze={handleRunAndAnalyze}
                                />
                            ))
                        )}

                        {isLoading && (
                            <div className="copilot-message assistant">
                                <div className="copilot-msg-meta">
                                    <div className="copilot-msg-author">
                                        <div className="copilot-msg-avatar copilot-icon">
                                            <Icons.Sparkles style={{ width: 12, height: 12 }} />
                                        </div>
                                        <span className="copilot-msg-name">GitHub Copilot</span>
                                    </div>
                                </div>
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

                    {/* JetBrains IDEA Style Prompt Input Area */}
                    <div className="copilot-idea-input-section">
                        <div className="copilot-idea-input-box">
                            {/* Input Tools & Context Chip Bar */}
                            <div className="copilot-idea-tools-bar">
                                <label
                                    className={`copilot-idea-chip ${
                                        includeTerminalContext ? "active" : ""
                                    }`}
                                    title="Toggle attaching last 50 lines of remote terminal buffer to query"
                                >
                                    <input
                                        type="checkbox"
                                        checked={includeTerminalContext}
                                        onChange={(e) => setIncludeTerminalContext(e.target.checked)}
                                        style={{ display: "none" }}
                                    />
                                    <span className="copilot-chip-indicator" />
                                    <Icons.Terminal style={{ width: 11, height: 11 }} />
                                    <span>Terminal Context (Last 50 Lines)</span>
                                </label>

                                {messages.length > 0 && (
                                    <button
                                        className="copilot-idea-btn-clear"
                                        onClick={handleNewChat}
                                        title="Clear chat history"
                                    >
                                        <Icons.Trash style={{ width: 11, height: 11 }} />
                                        <span>Clear</span>
                                    </button>
                                )}
                            </div>

                            {/* Textarea */}
                            <textarea
                                ref={textareaRef}
                                className="copilot-idea-textarea"
                                placeholder="Ask Copilot about your terminal, commands, or errors..."
                                value={inputPrompt}
                                rows={1}
                                onChange={(e) => {
                                    setInputPrompt(e.target.value);
                                    // Auto grow
                                    e.target.style.height = "auto";
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                            />

                            {/* Input Bottom Bar with Model Selector on Left, Hint & Send on Right */}
                            <div className="copilot-idea-submit-bar">
                                <div className="copilot-idea-submit-left">
                                    {/* Model Selector Dropdown with Auto fallback and dynamic models */}
                                    <select
                                        className="copilot-model-select"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value as CopilotModel)}
                                        title="Select AI Model"
                                    >
                                        <option value="auto">Auto</option>
                                        {auth.provider === "groq" ? (
                                            <>
                                                <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                                                <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
                                            </>
                                        ) : auth.provider === "openai" ? (
                                            <>
                                                {availableModels.length > 0 ? (
                                                    availableModels
                                                        .filter(
                                                            (m) =>
                                                                m.id.includes("gpt") ||
                                                                m.id.includes("o1") ||
                                                                m.id.includes("o3")
                                                        )
                                                        .map((m) => (
                                                            <option key={m.id} value={m.id}>
                                                                {m.name || m.id}
                                                            </option>
                                                        ))
                                                ) : (
                                                    <>
                                                        <option value="gpt-4o">GPT-4o</option>
                                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                                        <option value="o1-mini">o1-mini</option>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {availableModels.length > 0 ? (
                                                    availableModels.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name || m.id}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <>
                                                        <option value="gpt-4o">GPT-4o</option>
                                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                                        <option value="gpt-4">GPT-4</option>
                                                        <option value="o1-mini">o1-mini</option>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="copilot-idea-submit-right">
                                    <span className="copilot-idea-keyhint">
                                        ⏎ Send • Shift+⏎ New Line
                                    </span>

                                    <button
                                        className="copilot-idea-send-btn"
                                        onClick={() => handleSendMessage()}
                                        disabled={!inputPrompt.trim() || isLoading}
                                        title="Send query to Copilot"
                                    >
                                        <Icons.Send style={{ width: 13, height: 13 }} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Footnote Disclaimer */}
                        <div className="copilot-idea-disclaimer">
                            AI responses may be inaccurate. Always verify terminal commands before execution.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
