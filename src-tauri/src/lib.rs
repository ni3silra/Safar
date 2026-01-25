// Safar SSH & SFTP Client
// Main Tauri Library

mod ssh;
mod storage;
mod encryption;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use ssh::{ConnectionConfig, ConnectionResult, FileEntry, SessionInfo, SshManager};
use std::sync::Arc;
use storage::{CommandSnippet, SavedSession, SessionStorage};
use tauri::{AppHandle, Manager, State};

// ============================================
// APP STATE
// ============================================

pub struct AppState {
    ssh_manager: Arc<SshManager>,
    session_storage: RwLock<Option<SessionStorage>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ssh_manager: Arc::new(SshManager::new()),
            session_storage: RwLock::new(None),
        }
    }

    pub fn init_storage(&self, app_data_dir: std::path::PathBuf) {
        if let Ok(storage) = SessionStorage::new(app_data_dir) {
            *self.session_storage.write() = Some(storage);
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// COMMAND RESPONSE TYPES
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// ============================================
// SSH COMMANDS
// ============================================

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
fn ssh_connect(
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
fn ssh_send(state: State<AppState>, session_id: String, data: String) -> CommandResponse<()> {
    match state.ssh_manager.send_data(&session_id, &data) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Resize terminal PTY
#[tauri::command]
fn ssh_resize(
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
fn ssh_disconnect(state: State<AppState>, session_id: String) -> CommandResponse<()> {
    match state.ssh_manager.disconnect(&session_id) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Execute a command on an SSH session (one-shot)
#[tauri::command]
fn ssh_execute(
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
fn ssh_list_sessions(state: State<AppState>) -> CommandResponse<Vec<SessionInfo>> {
    let sessions = state.ssh_manager.list_sessions();
    CommandResponse::ok(sessions)
}

/// Check if a session is connected
#[tauri::command]
fn ssh_is_connected(state: State<AppState>, session_id: String) -> CommandResponse<bool> {
    let connected = state.ssh_manager.is_connected(&session_id);
    CommandResponse::ok(connected)
}

/// List files in a remote directory via SFTP
#[tauri::command]
fn ssh_sftp_ls(
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
#[tauri::command(async)]
fn ssh_sftp_read(
    state: State<AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> CommandResponse<()> {
    match state.ssh_manager.sftp_read_file(&session_id, &remote_path, &local_path) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Write a local file (Upload)
#[tauri::command(async)]
fn ssh_sftp_write(
    state: State<AppState>,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> CommandResponse<()> {
    match state.ssh_manager.sftp_write_file(&session_id, &local_path, &remote_path) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Read remote file as text
#[tauri::command(async)]
fn ssh_sftp_read_text(
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
fn ssh_sftp_write_text(
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
fn ssh_forward_local(
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
fn ssh_stop_forward(
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
fn ssh_list_tunnels(
    state: State<AppState>,
    session_id: String,
) -> CommandResponse<Vec<u16>> {
    match state.ssh_manager.list_tunnels(&session_id) {
        Ok(tunnels) => CommandResponse::ok(tunnels),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

// ============================================
// SESSION STORAGE COMMANDS
// ============================================

/// Get all saved sessions
#[tauri::command]
fn sessions_get_all(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_all()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Get favorite sessions
#[tauri::command]
fn sessions_get_favorites(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_favorites()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Get recent sessions
#[tauri::command]
fn sessions_get_recent(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_recent()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Save a session
#[tauri::command]
fn sessions_save(state: State<AppState>, session: SavedSession) -> CommandResponse<SavedSession> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.save_session(session) {
            Ok(saved) => CommandResponse::ok(saved),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Delete a session
#[tauri::command]
fn sessions_delete(state: State<AppState>, session_id: String) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.delete_session(&session_id) {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Toggle favorite status
#[tauri::command]
fn sessions_toggle_favorite(state: State<AppState>, session_id: String) -> CommandResponse<bool> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.toggle_favorite(&session_id) {
            Ok(is_fav) => CommandResponse::ok(is_fav),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Add session to recent (called when connecting)
#[tauri::command]
fn sessions_add_recent(state: State<AppState>, session_id: String) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.add_to_recent(&session_id) {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }

}

/// Import sessions from JSON string
#[tauri::command]
fn sessions_import(state: State<AppState>, json_content: String) -> CommandResponse<usize> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.import_sessions(&json_content) {
            Ok(count) => CommandResponse::ok(count),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Read a local text file
#[tauri::command]
fn fs_read_text(path: String) -> CommandResponse<String> {
    match std::fs::read_to_string(path) {
        Ok(content) => CommandResponse::ok(content),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

// ============================================
// MAIN RUN FUNCTION


// ============================================
// SNIPPET COMMANDS
// ============================================

/// Get all snippets
#[tauri::command]
fn snippets_get_all(state: State<AppState>) -> CommandResponse<Vec<CommandSnippet>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_snippets()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Save a snippet
#[tauri::command]
fn snippets_save(state: State<AppState>, snippet: CommandSnippet) -> CommandResponse<CommandSnippet> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.save_snippet(snippet) {
            Ok(saved) => CommandResponse::ok(saved),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Delete a snippet
#[tauri::command]
fn snippets_delete(state: State<AppState>, snippet_id: String) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.delete_snippet(&snippet_id) {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

// ============================================
// SECURITY COMMANDS
// ============================================

/// Check if storage is locked
#[tauri::command]
fn storage_is_locked(state: State<AppState>) -> CommandResponse<bool> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.is_locked()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Check if storage has a password set (locked or unlocked)
#[tauri::command]
fn storage_has_password(state: State<AppState>) -> CommandResponse<bool> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.has_password()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Unlock storage
#[tauri::command]
fn storage_unlock(state: State<AppState>, password: String) -> CommandResponse<bool> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.unlock(&password) {
            Ok(success) => CommandResponse::ok(success),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Set master password
#[tauri::command]
fn storage_set_password(state: State<AppState>, password: String) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.set_master_password(&password) {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Remove master password
#[tauri::command]
fn storage_remove_password(state: State<AppState>) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.remove_master_password() {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

// ============================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            // Initialize session storage with app data directory
            let state = app.state::<AppState>();
            if let Some(app_data_dir) = app.path().app_data_dir().ok() {
                state.init_storage(app_data_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // SSH commands
            ssh_connect,
            ssh_send,
            ssh_resize,
            ssh_disconnect,
            ssh_execute,
            ssh_list_sessions,
            ssh_is_connected,
            ssh_sftp_ls,
            ssh_sftp_read,
            ssh_sftp_write,
            ssh_sftp_read_text,
            ssh_sftp_write_text,
            ssh_stop_forward,
            ssh_forward_local,
            ssh_list_tunnels,
            ssh_stop_forward,
            // Session storage commands
            sessions_get_all,
            sessions_get_favorites,
            sessions_get_recent,
            sessions_save,
            sessions_delete,
            sessions_toggle_favorite,
            sessions_add_recent,
            sessions_import,
            fs_read_text,
            // Snippet commands
            snippets_get_all,
            snippets_save,
            snippets_delete,
            // Security commands
            storage_is_locked,
            storage_has_password,
            storage_unlock,
            storage_set_password,
            storage_remove_password,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
