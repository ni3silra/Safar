import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopilotPanel } from "../../components/Copilot/CopilotPanel";
import { CopilotMessageItem } from "../../components/Copilot/CopilotMessageItem";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe("CopilotPanel Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("renders unauthenticated state with GitHub URL auth button", () => {
        render(
            <CopilotPanel
                sessionId="test-session"
                onClose={vi.fn()}
                getTerminalOutput={vi.fn().mockReturnValue("test output")}
                onRunCommand={vi.fn()}
            />
        );

        expect(screen.getByText("Sign in to GitHub Copilot")).toBeInTheDocument();
        expect(screen.getByText("Sign In with GitHub (URL Auth)")).toBeInTheDocument();
    });

    it("initiates device flow and displays user code when Sign In is clicked", async () => {
        (invoke as any).mockImplementation((cmd: string) => {
            if (cmd === "copilot_device_code") {
                return Promise.resolve({
                    success: true,
                    data: {
                        device_code: "dev123",
                        user_code: "ABCD-1234",
                        verification_uri: "https://github.com/login/device",
                        expires_in: 900,
                        interval: 5,
                    },
                });
            }
            if (cmd === "plugin:opener|open_url") {
                return Promise.resolve();
            }
            return Promise.resolve({ success: true, data: null });
        });

        render(
            <CopilotPanel
                sessionId="test-session"
                onClose={vi.fn()}
                getTerminalOutput={vi.fn().mockReturnValue("test output")}
                onRunCommand={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText("Sign In with GitHub (URL Auth)"));

        await waitFor(() => {
            expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
            expect(screen.getByText(/Copy Code & Open GitHub/i)).toBeInTheDocument();
            expect(screen.getByText("Waiting for your authorization in browser...")).toBeInTheDocument();
        });
    });

    it("renders authenticated chat view when stored session exists", () => {
        localStorage.setItem(
            "safar_copilot_auth",
            JSON.stringify({
                isAuthenticated: true,
                accessToken: "mock-token",
                copilotToken: "mock-copilot-token",
                user: { login: "octocat", name: "The Octocat" },
            })
        );

        render(
            <CopilotPanel
                sessionId="test-session"
                onClose={vi.fn()}
                getTerminalOutput={vi.fn().mockReturnValue("root@server:~# nginx -t\nnginx: configuration file /etc/nginx/nginx.conf test failed")}
                onRunCommand={vi.fn()}
            />
        );

        expect(screen.getByText("@octocat")).toBeInTheDocument();
        expect(screen.getByText("GPT-4o")).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Ask Copilot about your terminal/i)).toBeInTheDocument();
        expect(screen.getByText("🔍 Explain Terminal Error")).toBeInTheDocument();
        expect(screen.getByText("🩺 Diagnose Health")).toBeInTheDocument();
    });

    it("sends prompt and attaches terminal context", async () => {
        localStorage.setItem(
            "safar_copilot_auth",
            JSON.stringify({
                isAuthenticated: true,
                accessToken: "mock-token",
                user: { login: "developer" },
            })
        );

        const getTerminalOutputMock = vi.fn().mockReturnValue("Error 500: Database connection refused");

        (invoke as any).mockImplementation((cmd: string) => {
            if (cmd === "copilot_chat") {
                return Promise.resolve({
                    success: true,
                    data: "The error indicates MySQL service is down. Run:\n```bash\nsystemctl restart mysql\n```",
                });
            }
            return Promise.resolve({ success: true });
        });

        render(
            <CopilotPanel
                sessionId="test-session"
                onClose={vi.fn()}
                getTerminalOutput={getTerminalOutputMock}
                onRunCommand={vi.fn()}
            />
        );

        const textarea = screen.getByPlaceholderText(/Ask Copilot about your terminal/i);
        fireEvent.change(textarea, { target: { value: "Why is my app failing?" } });

        const sendBtn = screen.getByTitle("Send query to Copilot");
        fireEvent.click(sendBtn);

        await waitFor(() => {
            expect(getTerminalOutputMock).toHaveBeenCalled();
            expect(invoke).toHaveBeenCalledWith("copilot_chat", expect.objectContaining({
                model: "gpt-4o",
            }));
            expect(screen.getByText(/The error indicates MySQL service is down/i)).toBeInTheDocument();
            expect(screen.getByText("systemctl restart mysql")).toBeInTheDocument();
        });
    });
});

describe("CopilotMessageItem Command Actions", () => {
    it("renders Run in Terminal, Run & Analyze, and Copy buttons for executable shell commands", () => {
        const onRunCommand = vi.fn();
        const onRunAndAnalyze = vi.fn();

        render(
            <CopilotMessageItem
                message={{
                    id: "msg-1",
                    role: "assistant",
                    content: "To check disk usage run:\n```bash\ndf -h\n```",
                    timestamp: Date.now(),
                }}
                onRunCommand={onRunCommand}
                onRunAndAnalyze={onRunAndAnalyze}
            />
        );

        expect(screen.getByText("df -h")).toBeInTheDocument();
        const runBtn = screen.getByText("Run in Terminal");
        const analyzeBtn = screen.getByText("Run & Analyze");
        const copyBtn = screen.getByText("Copy");

        expect(runBtn).toBeInTheDocument();
        expect(analyzeBtn).toBeInTheDocument();
        expect(copyBtn).toBeInTheDocument();

        fireEvent.click(runBtn);
        expect(onRunCommand).toHaveBeenCalledWith("df -h");

        fireEvent.click(analyzeBtn);
        expect(onRunAndAnalyze).toHaveBeenCalledWith("df -h");
    });
});

