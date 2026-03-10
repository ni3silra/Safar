use crate::AppState;
use crate::CommandResponse;
use crate::ssh::{ConnectionConfig, ConnectionResult, FileEntry, SessionInfo};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, Emitter};

#[derive(Clone, Serialize)]
pub struct SftpProgressPayload {
    pub session_id: String,
    pub path: String,
    pub transfer_type: String,
    pub transferred: u64,
    pub total: u64,
    pub status: String,
    pub error_msg: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub session_name: Option<String>,
    pub term_type: Option<String>,
    pub remote_command: Option<String>,
}

/// Connect to an SSH server with PTY (interactive terminal)
#[tauri::command]
pub fn ssh_connect(
    app: AppHandle,
    state: State<AppState>,
    params: ConnectParams,
) -> CommandResponse<ConnectionResult> {
    let config = ConnectionConfig {
        host: params.host,
        port: params.port,
        username: params.username,
        password: params.password,
        private_key_path: params.private_key_path,
        session_name: params.session_name,
        term_type: params.term_type,
        remote_command: params.remote_command,
    };

    match state.ssh_manager.connect_with_pty(config, app) {
        Ok(result) => CommandResponse::ok(result),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Send data to terminal (user input)
#[tauri::command]
pub fn ssh_send(state: State<AppState>, session_id: String, data: String) -> CommandResponse<()> {
    match state.ssh_manager.send_data(&session_id, &data) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Resize terminal PTY
#[tauri::command]
pub fn ssh_resize(
    state: State<AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> CommandResponse<()> {
    match state.ssh_manager.resize_pty(&session_id, cols, rows) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Disconnect from an SSH session
#[tauri::command]
pub fn ssh_disconnect(state: State<AppState>, session_id: String) -> CommandResponse<()> {
    match state.ssh_manager.disconnect(&session_id) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Execute a command on an SSH session (one-shot)
#[tauri::command]
pub fn ssh_execute(
    state: State<AppState>,
    session_id: String,
    command: String,
) -> CommandResponse<String> {
    match state.ssh_manager.execute_command(&session_id, &command) {
        Ok(output) => CommandResponse::ok(output),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// List all SSH sessions
#[tauri::command]
pub fn ssh_list_sessions(state: State<AppState>) -> CommandResponse<Vec<SessionInfo>> {
    let sessions = state.ssh_manager.list_sessions();
    CommandResponse::ok(sessions)
}

/// Get server performance metrics (CPU, Memory, Top 50 Processes)
#[tauri::command]
pub fn ssh_get_performance(state: State<AppState>, session_id: String) -> CommandResponse<String> {
    match state.ssh_manager.get_performance(&session_id) {
        Ok(metrics) => CommandResponse::ok(metrics),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Check if a session is connected
#[tauri::command]
pub fn ssh_is_connected(state: State<AppState>, session_id: String) -> CommandResponse<bool> {
    let connected = state.ssh_manager.is_connected(&session_id);
    CommandResponse::ok(connected)
}

/// List files in a remote directory via SFTP
#[tauri::command]
pub fn ssh_sftp_ls(
    state: State<AppState>,
    session_id: String,
    path: String,
) -> CommandResponse<Vec<FileEntry>> {
    match state.ssh_manager.sftp_ls(&session_id, &path) {
        Ok(entries) => CommandResponse::ok(entries),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Read a remote file (Download)
#[tauri::command]
pub fn ssh_sftp_read(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> CommandResponse<()> {
    let ssh_manager = state.ssh_manager.clone();
    
    std::thread::spawn(move || {
        let app_clone = app.clone();
        let sid_clone = session_id.clone();
        let path_clone = remote_path.clone(); // Use remote path as identifier
        
        let _ = app.emit("sftp-transfer", SftpProgressPayload {
            session_id: session_id.clone(),
            path: remote_path.clone(),
            transfer_type: "download".to_string(),
            transferred: 0,
            total: 0,
            status: "progress".to_string(),
            error_msg: None,
        });

        let result = ssh_manager.sftp_read_file(
            &session_id, 
            &remote_path, 
            &local_path, 
            |transferred, total| {
                let _ = app_clone.emit("sftp-transfer", SftpProgressPayload {
                    session_id: sid_clone.clone(),
                    path: path_clone.clone(),
                    transfer_type: "download".to_string(),
                    transferred,
                    total,
                    status: "progress".to_string(),
                    error_msg: None,
                });
            }
        );

        match result {
            Ok(_) => {
                let _ = app.emit("sftp-transfer", SftpProgressPayload {
                    session_id: session_id.clone(),
                    path: remote_path.clone(),
                    transfer_type: "download".to_string(),
                    transferred: 0,
                    total: 0,
                    status: "completed".to_string(),
                    error_msg: None,
                });
            },
            Err(e) => {
                let _ = app.emit("sftp-transfer", SftpProgressPayload {
                    session_id: session_id.clone(),
                    path: remote_path.clone(),
                    transfer_type: "download".to_string(),
                    transferred: 0,
                    total: 0,
                    status: "error".to_string(),
                    error_msg: Some(e.to_string()),
                });
            }
        }
    });

    CommandResponse::ok(())
}

/// Write a local file (Upload)
#[tauri::command]
pub fn ssh_sftp_write(
    app: AppHandle,
    state: State<AppState>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> CommandResponse<()> {
    let ssh_manager = state.ssh_manager.clone();
    
    std::thread::spawn(move || {
        let app_clone = app.clone();
        let sid_clone = session_id.clone();
        let path_clone = remote_path.clone(); // Use remote path as identifier
        
        let _ = app.emit("sftp-transfer", SftpProgressPayload {
            session_id: session_id.clone(),
            path: remote_path.clone(),
            transfer_type: "upload".to_string(),
            transferred: 0,
            total: 0,
            status: "progress".to_string(),
            error_msg: None,
        });

        let result = ssh_manager.sftp_write_file(
            &session_id, 
            &local_path, 
            &remote_path, 
            |transferred, total| {
                let _ = app_clone.emit("sftp-transfer", SftpProgressPayload {
                    session_id: sid_clone.clone(),
                    path: path_clone.clone(),
                    transfer_type: "upload".to_string(),
                    transferred,
                    total,
                    status: "progress".to_string(),
                    error_msg: None,
                });
            }
        );

        match result {
            Ok(_) => {
                let _ = app.emit("sftp-transfer", SftpProgressPayload {
                    session_id: session_id.clone(),
                    path: remote_path.clone(),
                    transfer_type: "upload".to_string(),
                    transferred: 0,
                    total: 0,
                    status: "completed".to_string(),
                    error_msg: None,
                });
            },
            Err(e) => {
                let _ = app.emit("sftp-transfer", SftpProgressPayload {
                    session_id: session_id.clone(),
                    path: remote_path.clone(),
                    transfer_type: "upload".to_string(),
                    transferred: 0,
                    total: 0,
                    status: "error".to_string(),
                    error_msg: Some(e.to_string()),
                });
            }
        }
    });

    CommandResponse::ok(())
}

/// Read remote file as text
#[tauri::command(async)]
pub fn ssh_sftp_read_text(
    state: State<AppState>,
    session_id: String,
    remote_path: String,
) -> CommandResponse<String> {
    match state.ssh_manager.sftp_read_string(&session_id, &remote_path) {
        Ok(content) => CommandResponse::ok(content),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Write text to remote file
#[tauri::command(async)]
pub fn ssh_sftp_write_text(
    state: State<AppState>,
    session_id: String,
    remote_path: String,
    content: String,
) -> CommandResponse<()> {
    match state.ssh_manager.sftp_write_string(&session_id, &remote_path, &content) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Start a local port forward
#[tauri::command]
pub fn ssh_forward_local(
    state: State<AppState>,
    session_id: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> CommandResponse<()> {
    match state.ssh_manager.start_local_forward(&session_id, local_port, &remote_host, remote_port) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Stop a local port forward
#[tauri::command]
pub fn ssh_stop_forward(
    state: State<AppState>,
    session_id: String,
    local_port: u16,
) -> CommandResponse<()> {
    match state.ssh_manager.stop_local_forward(&session_id, local_port) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// List active local port forwards
#[tauri::command]
pub fn ssh_list_tunnels(
    state: State<AppState>,
    session_id: String,
) -> CommandResponse<Vec<u16>> {
    match state.ssh_manager.list_tunnels(&session_id) {
        Ok(tunnels) => CommandResponse::ok(tunnels),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Start a remote port forward (Remote -> Local)
#[tauri::command]
pub fn ssh_forward_remote(
    state: State<AppState>,
    session_id: String,
    remote_port: u16,
    local_host: String,
    local_port: u16,
) -> CommandResponse<()> {
    match state.ssh_manager.start_remote_forward(&session_id, remote_port, &local_host, local_port) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Stop a remote port forward
#[tauri::command]
pub fn ssh_stop_forward_remote(
    state: State<AppState>,
    session_id: String,
    remote_port: u16,
) -> CommandResponse<()> {
    match state.ssh_manager.stop_remote_forward(&session_id, remote_port) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// List active remote port forwards
#[tauri::command]
pub fn ssh_list_remote_tunnels(
    state: State<AppState>,
    session_id: String,
) -> CommandResponse<Vec<u16>> {
    match state.ssh_manager.list_remote_tunnels(&session_id) {
        Ok(tunnels) => CommandResponse::ok(tunnels),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}
