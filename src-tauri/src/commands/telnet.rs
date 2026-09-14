use crate::AppState;
use crate::CommandResponse;
use crate::telnet::{TelnetConfig, TelnetConnectionResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetConnectParams {
    pub host: String,
    pub port: u16,
    pub service_name: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub term_type: Option<String>,
}

/// Connect to HP NonStop TELSERV / Telnet server
#[tauri::command]
pub fn telnet_connect(
    app: AppHandle,
    state: State<AppState>,
    params: TelnetConnectParams,
) -> CommandResponse<TelnetConnectionResult> {
    let config = TelnetConfig {
        host: params.host,
        port: params.port,
        service_name: params.service_name,
        username: params.username,
        password: params.password,
        term_type: params.term_type,
    };

    match state.telnet_manager.connect(app, config) {
        Ok(result) => CommandResponse::ok(result),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Send data to Telnet stream
#[tauri::command]
pub fn telnet_send(state: State<AppState>, session_id: String, data: String) -> CommandResponse<()> {
    match state.telnet_manager.send_data(&session_id, &data) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Disconnect Telnet session
#[tauri::command]
pub fn telnet_disconnect(state: State<AppState>, session_id: String) -> CommandResponse<()> {
    match state.telnet_manager.disconnect(&session_id) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}

/// Resize Telnet terminal (NAWS)
#[tauri::command]
pub fn telnet_resize(state: State<AppState>, session_id: String, cols: u32, rows: u32) -> CommandResponse<()> {
    match state.telnet_manager.resize(&session_id, cols, rows) {
        Ok(()) => CommandResponse::ok(()),
        Err(e) => CommandResponse::err(e.to_string()),
    }
}
