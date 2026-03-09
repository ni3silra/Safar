export interface HistoryEntry {
    command: string;
    timestamp: number;
}

export const getHistory = (): HistoryEntry[] => {
    try {
        const stored = localStorage.getItem('safar_command_history');
        if (stored) {
            const parsed = JSON.parse(stored);
            // Backwards compatibility mapper for old string-only arrays
            return parsed.map((item: any) =>
                typeof item === 'string' ? { command: item, timestamp: Date.now() } : item
            );
        }
    } catch (e) {
        console.error("Failed to parse history", e);
    }
    return [];
};

export const addHistory = (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    const history = getHistory();
    // Do not add consecutive duplicates
    if (history.length > 0 && history[0].command === trimmed) return;

    // Add to front and cap at 500
    history.unshift({ command: trimmed, timestamp: Date.now() });
    const newHistory = history.slice(0, 500);

    localStorage.setItem('safar_command_history', JSON.stringify(newHistory));
    window.dispatchEvent(new Event('safar_history_updated'));
};

export const clearHistory = () => {
    localStorage.removeItem('safar_command_history');
    window.dispatchEvent(new Event('safar_history_updated'));
};
