// Protocol helper utilities and badge definitions

export type SupportedProtocol = "ssh" | "telnet";

export interface ProtocolMeta {
    id: SupportedProtocol;
    label: string;
    badgeText: string;
    badgeBg: string;
    badgeColor: string;
    badgeBorder: string;
    defaultPort: number;
    requiresPasswordAuth: boolean;
}

export const PROTOCOL_CONFIG: Record<SupportedProtocol, ProtocolMeta> = {
    telnet: {
        id: "telnet",
        label: "Telnet (6530)",
        badgeText: "TELNET",
        badgeBg: "rgba(234, 179, 8, 0.14)",
        badgeColor: "#facc15",
        badgeBorder: "rgba(234, 179, 8, 0.35)",
        defaultPort: 23,
        requiresPasswordAuth: false,
    },
    ssh: {
        id: "ssh",
        label: "SSH",
        badgeText: "SSH",
        badgeBg: "rgba(59, 130, 246, 0.14)",
        badgeColor: "#60a5fa",
        badgeBorder: "rgba(59, 130, 246, 0.35)",
        defaultPort: 22,
        requiresPasswordAuth: true,
    },
};

/**
 * Resolves the effective protocol for any session object or raw protocol string.
 * Defaults to "ssh".
 */
export function resolveProtocol(
    item?: {
        protocol?: string;
        is_nonstop?: boolean;
        isNonStop?: boolean;
        port?: number;
        term_type?: string;
        termType?: string;
    } | string
): SupportedProtocol {
    if (typeof item === "string") {
        return item.toLowerCase() === "telnet" ? "telnet" : "ssh";
    }
    if (!item) return "ssh";
    if (item.protocol === "telnet") return "telnet";
    if (item.protocol === "ssh") return "ssh";

    // Legacy backward compatibility:
    // If an older saved session was created without a `protocol` field,
    // infer it from port 23 or NonStop / 6530 indicators:
    if (item.port === 23) return "telnet";
    const term = item.term_type || item.termType;
    if ((item.is_nonstop || item.isNonStop) && term && term.toLowerCase().includes("6530")) {
        // If it was NonStop on port 23 or default NonStop telnet
        if (!item.port || item.port === 23) return "telnet";
    }

    return "ssh";
}

/**
 * Returns metadata for displaying protocol badge / tag in UI
 */
export function getProtocolMeta(
    item?: {
        protocol?: string;
        is_nonstop?: boolean;
        isNonStop?: boolean;
        port?: number;
        term_type?: string;
        termType?: string;
    } | string
): ProtocolMeta {
    const proto = resolveProtocol(item);
    return PROTOCOL_CONFIG[proto];
}

