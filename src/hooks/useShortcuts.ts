import { useEffect } from "react";

interface UseShortcutsProps {
    onNewConnection: () => void;
    onSettings: () => void;
}

export function useShortcuts({ onNewConnection, onSettings }: UseShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "n") {
                e.preventDefault();
                onNewConnection();
            }
            if (e.ctrlKey && e.key === ",") {
                e.preventDefault();
                onSettings();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onNewConnection, onSettings]);
}
