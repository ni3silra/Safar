// Safar Copilot Types

export interface CopilotUser {
    login: string;
    name?: string | null;
    avatar_url?: string | null;
    html_url?: string | null;
    bio?: string | null;
}

export interface CopilotDeviceAuth {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}

export type AIProvider = "github" | "openai" | "groq" | "custom";

export interface CopilotAuthState {
    isAuthenticated: boolean;
    provider?: AIProvider;
    accessToken?: string;
    copilotToken?: string;
    apiKey?: string;
    customEndpoint?: string;
    customSystemPrompt?: string;
    isCopilotSubscriber?: boolean;
    endpoint?: string;
    user?: CopilotUser;
    // Corporate HTTP Proxy Configuration
    useProxy?: boolean;
    proxyHost?: string;
    proxyPort?: string;
    proxyAuthEnabled?: boolean;
    proxyLogin?: string;
    proxyPassword?: string;
    proxyUrl?: string;
    ignoreSslErrors?: boolean;
}

/**
 * Builds a standard HTTP proxy URL from proxy configuration fields.
 * If authentication is enabled and credentials are provided, user and password are URI-encoded.
 */
export function buildProxyUrl(auth?: Partial<CopilotAuthState> | null): string | undefined {
    if (!auth || !auth.useProxy) return undefined;
    const rawHost = auth.proxyHost?.trim();
    if (!rawHost) return undefined;

    // Strip any inadvertent scheme and trailing slashes
    const cleanHost = rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const port = auth.proxyPort?.trim() || "8080";

    if (auth.proxyAuthEnabled && auth.proxyLogin?.trim()) {
        const user = encodeURIComponent(auth.proxyLogin.trim());
        const pass = encodeURIComponent(auth.proxyPassword || "");
        return `http://${user}:${pass}@${cleanHost}:${port}`;
    }

    return `http://${cleanHost}:${port}`;
}

export interface CopilotMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    terminalContextSnippet?: string;
    executedCommand?: string;
    commandOutput?: string;
}

export interface CopilotModelInfo {
    id: string;
    name: string;
}

export type CopilotModel =
    | "auto"
    | "gpt-4o"
    | "claude-3.5-sonnet"
    | "gpt-4o-mini"
    | "gpt-4"
    | "o1-mini"
    | "llama-3.3-70b-versatile"
    | "llama-3.1-8b-instant"
    | string;

