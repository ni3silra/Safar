use crate::AppState;
use crate::CommandResponse;
use crate::storage::{CommandSnippet, SavedSession};
use tauri::State;

// ============================================
// SESSION STORAGE COMMANDS
// ============================================

/// Get all saved sessions
#[tauri::command]
pub fn sessions_get_all(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_all()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Get favorite sessions
#[tauri::command]
pub fn sessions_get_favorites(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_favorites()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Get recent sessions
#[tauri::command]
pub fn sessions_get_recent(state: State<AppState>) -> CommandResponse<Vec<SavedSession>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_recent()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Save a session
#[tauri::command]
pub fn sessions_save(state: State<AppState>, session: SavedSession) -> CommandResponse<SavedSession> {
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
pub fn sessions_delete(state: State<AppState>, session_id: String) -> CommandResponse<()> {
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
pub fn sessions_toggle_favorite(state: State<AppState>, session_id: String) -> CommandResponse<bool> {
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
pub fn sessions_add_recent(state: State<AppState>, session_id: String) -> CommandResponse<()> {
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
pub fn sessions_import(state: State<AppState>, json_content: String) -> CommandResponse<usize> {
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
pub fn fs_read_text(path: String) -> CommandResponse<String> {
    match std::fs::read_to_string(path) {
        Ok(content) => CommandResponse::ok(content),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}


// ============================================
// SNIPPET COMMANDS
// ============================================

/// Get all snippets
#[tauri::command]
pub fn snippets_get_all(state: State<AppState>) -> CommandResponse<Vec<CommandSnippet>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_snippets()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Save a snippet
#[tauri::command]
pub fn snippets_save(state: State<AppState>, snippet: CommandSnippet) -> CommandResponse<CommandSnippet> {
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
pub fn snippets_delete(state: State<AppState>, snippet_id: String) -> CommandResponse<()> {
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
// CUSTOM THEME COMMANDS
// ============================================

/// Get all custom themes
#[tauri::command]
pub fn custom_themes_get_all(state: State<AppState>) -> CommandResponse<Vec<crate::storage::CustomTheme>> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.get_custom_themes()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Save a custom theme
#[tauri::command]
pub fn custom_themes_save(state: State<AppState>, theme: crate::storage::CustomTheme) -> CommandResponse<crate::storage::CustomTheme> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.save_custom_theme(theme) {
            Ok(saved) => CommandResponse::ok(saved),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Delete a custom theme
#[tauri::command]
pub fn custom_themes_delete(state: State<AppState>, theme_id: String) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.delete_custom_theme(&theme_id) {
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
pub fn storage_is_locked(state: State<AppState>) -> CommandResponse<bool> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.is_locked()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Check if storage has a password set (locked or unlocked)
#[tauri::command]
pub fn storage_has_password(state: State<AppState>) -> CommandResponse<bool> {
    let storage = state.session_storage.read();
    match storage.as_ref() {
        Some(s) => CommandResponse::ok(s.has_password()),
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}

/// Unlock storage
#[tauri::command]
pub fn storage_unlock(state: State<AppState>, password: String) -> CommandResponse<bool> {
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
pub fn storage_set_password(state: State<AppState>, password: String) -> CommandResponse<()> {
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
pub fn storage_remove_password(state: State<AppState>) -> CommandResponse<()> {
    let mut storage = state.session_storage.write();
    match storage.as_mut() {
        Some(s) => match s.remove_master_password() {
            Ok(()) => CommandResponse::ok(()),
            Err(e) => CommandResponse::err(e.to_string()),
        },
        None => CommandResponse::err("Storage not initialized".to_string()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppState;
    use crate::ssh::SshManager;
    use parking_lot::RwLock;
    use std::sync::Arc;
    
    #[test]
    fn test_app_state_init() {
        let state = AppState {
            ssh_manager: Arc::new(SshManager::new()),
            session_storage: RwLock::new(None),
        };
        assert!(state.session_storage.read().is_none());
    }

    #[test]
    fn test_fs_read_text_error() {
        // This command doesn't need State
        let response = fs_read_text("/non/existent/safar/test/path".to_string());
        assert!(!response.success);
        assert!(response.error.is_some());
    }

    #[test]
    fn test_command_response_formats() {
        let ok_res = CommandResponse::ok("data".to_string());
        assert!(ok_res.success);
        assert_eq!(ok_res.data.unwrap(), "data");

        let err_res: CommandResponse<String> = CommandResponse::err("error".to_string());
        assert!(!err_res.success);
        assert_eq!(err_res.error.unwrap(), "error");
    }
}
