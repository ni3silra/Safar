// Safar SSH & SFTP Client
// Main Tauri Library

mod ssh;
mod storage;
mod encryption;
mod commands;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use ssh::SshManager;
use std::sync::Arc;
use storage::SessionStorage;
use tauri::Manager;

// Import commands
use commands::ssh::*;
use commands::storage::*;

// ============================================
// APP STATE
// ============================================

pub struct AppState {
    pub ssh_manager: Arc<SshManager>,
    pub session_storage: RwLock<Option<SessionStorage>>,
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
// MAIN RUN FUNCTION
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
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Window is being destroyed, triggering cleanup via Drop
                // The AppState held by Tauri will also be dropped eventually
            }
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
            // fs_write_text,
            // Snippet commands
            snippets_get_all,
            snippets_save,
            snippets_delete,
            // Custom theme commands
            custom_themes_get_all,
            custom_themes_save,
            custom_themes_delete,
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
