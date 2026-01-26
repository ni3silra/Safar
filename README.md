# Safar SSH Client

**Safar** is a modern, cross-platform SSH client built with [Tauri](https://tauri.app/), [React](https://react.dev/), and Rust. It combines the performance of a native backend with the flexibility of a modern web frontend, offering a premium and customizable terminal experience.



## Features

*   **Secure Session Management**: Save and organize your SSH connections. Credentials can be optionally encrypted with a master password (feature currently in maintenance).
*   **Modern Terminal**: Powered by xterm.js, supporting full ANSI colors, custom fonts, ligatures, and various cursor styles.
*   **Multiple Tabs**: Manage multiple SSH sessions simultaneously with a tabbed interface.
*   **SFTP File Browser**: Integrated file browser for remote servers. Upload and download files with ease.
*   **Tunneling (Experimental)**: Visual interface for managing SSH tunnels and port forwarding.
*   **Themes**: Built-in dark and light modes with customizable terminal color schemes.
*   **Cross-Platform**: Runs on Windows, macOS, and Linux.

## Usage

### Connecting to a Server
1.  Click the **"New Connection"** button (or press `Ctrl+N`).
2.  Enter the Host, Port, Username, and Password (or select a Private Key).
3.  (Optional) Save the session for quick access later.
4.  Click **Connect**.

### Managing Files
1.  Once connected, switch to the **Files** tab in the workspace.
2.  Navigate the remote file system.
3.  **Download**: Click the download icon next to a file.
4.  **Upload**: Click the "Upload" button to send files to the current directory.

## Developer Guide

### Prerequisites
-   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
-   **Node.js**: [Install Node.js](https://nodejs.org/) (LTS recommended)
-   **Tauri CLI**: `npm install -g @tauri-apps/cli` (Optional, can run via npm script)

### Setup
1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/safar.git
    cd Safar
    ```
2.  Install dependencies:
    ```bash
    npm install
    # OR
    yarn install
    ```

### Running Locally
To run the application in development mode (hot-reloading for frontend):

```bash
npm run tauri dev
```

This will compile the Rust backend and launch the application window.

### Architecture
-   **Frontend**: React + TypeScript + Vite. Located in `src/`.
-   **Backend**: Rust (Tauri). Located in `src-tauri/`.
-   **Communication**: The frontend invokes Rust commands defined in `src-tauri/src/commands/`.

## Contribution

Contributions are welcome!

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

Please ensure your code follows the existing style and conventions.

## License

[MIT License](LICENSE)
