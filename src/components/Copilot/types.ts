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

export interface CopilotAuthState {
    isAuthenticated: boolean;
    accessToken?: string;
    copilotToken?: string;
    isCopilotSubscriber?: boolean;
    endpoint?: string;
    user?: CopilotUser;
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

export type CopilotModel = "gpt-4o" | "claude-3.5-sonnet" | "gpt-4o-mini" | "o1-mini";

