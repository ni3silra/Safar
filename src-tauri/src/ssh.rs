// Safar SSH Module
// Handles SSH connections, PTY sessions, and terminal I/O

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::net::{TcpListener, TcpStream};
use tauri::Emitter;
use thiserror::Error;
use uuid::Uuid;

// ============================================
// ERROR TYPES
// ============================================

#[derive(Error, Debug)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Channel error: {0}")]
    ChannelError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("SSH2 error: {0}")]
    Ssh2Error(#[from] ssh2::Error),
}

// ============================================
// DATA TYPES
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    #[serde(skip_serializing)]
    pub private_key_path: Option<String>,
    pub session_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub session_id: String,
    pub host: String,
    pub username: String,
    pub banner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub connected: bool,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalData {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: u64,
    pub permissions: String,
}

// ============================================
// SSH SESSION WITH PTY
// ============================================

struct SshSession {
    session: Session,
    channel: Option<Channel>,
    config: ConnectionConfig,
    _stream: TcpStream,
    running: Arc<RwLock<bool>>,
    tunnels: HashMap<u16, Arc<AtomicBool>>,
}

impl SshSession {
    fn is_authenticated(&self) -> bool {
        self.session.authenticated()
    }

    fn has_channel(&self) -> bool {
        self.channel.is_some()
    }
}

// ============================================
// SSH MANAGER (Global State)
// ============================================

pub struct SshManager {
    sessions: RwLock<HashMap<String, Arc<RwLock<SshSession>>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Connect to an SSH server and open a PTY shell
    pub fn connect_with_pty(
        &self,
        config: ConnectionConfig,
        app_handle: tauri::AppHandle,
    ) -> Result<ConnectionResult, SshError> {
        // Create TCP connection
        let addr = format!("{}:{}", config.host, config.port);
        let tcp = TcpStream::connect(&addr).map_err(|e| {
            SshError::ConnectionFailed(format!("Failed to connect to {}: {}", addr, e))
        })?;

        // Set timeout
        tcp.set_read_timeout(Some(std::time::Duration::from_secs(30)))?;
        tcp.set_write_timeout(Some(std::time::Duration::from_secs(30)))?;

        // Create SSH session
        let mut session = Session::new().map_err(|e| {
            SshError::ConnectionFailed(format!("Failed to create SSH session: {}", e))
        })?;

        session.set_tcp_stream(tcp.try_clone()?);
        session.handshake().map_err(|e| {
            SshError::ConnectionFailed(format!("SSH handshake failed: {}", e))
        })?;

        // Get server banner
        let banner = session.banner().map(|s| s.to_string());

        // Authenticate
        if let Some(ref password) = config.password {
            session
                .userauth_password(&config.username, password)
                .map_err(|e| {
                    SshError::AuthenticationFailed(format!("Password authentication failed: {}", e))
                })?;
        } else if let Some(ref key_path) = config.private_key_path {
            let path = std::path::Path::new(key_path);
            session
                .userauth_pubkey_file(&config.username, None, path, None)
                .map_err(|e| {
                    SshError::AuthenticationFailed(format!("Key authentication failed: {}", e))
                })?;
        } else {
            return Err(SshError::AuthenticationFailed(
                "No authentication method provided".to_string(),
            ));
        }

        if !session.authenticated() {
            return Err(SshError::AuthenticationFailed(
                "Authentication failed - not authenticated".to_string(),
            ));
        }

        // Open a channel for PTY
        let mut channel = session.channel_session().map_err(|e| {
            SshError::ChannelError(format!("Failed to open channel: {}", e))
        })?;

        // Request PTY
        channel
            .request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
            .map_err(|e| SshError::ChannelError(format!("Failed to request PTY: {}", e)))?;

        // Start shell
        channel
            .shell()
            .map_err(|e| SshError::ChannelError(format!("Failed to start shell: {}", e)))?;

        // Set non-blocking mode for reading
        session.set_blocking(false);

        // Generate session ID
        let session_id = Uuid::new_v4().to_string();

        let running = Arc::new(RwLock::new(true));

        // Store session
        let ssh_session = SshSession {
            session,
            channel: Some(channel),
            config: config.clone(),
            _stream: tcp,
            running: running.clone(),
            tunnels: HashMap::new(),
        };

        let session_arc = Arc::new(RwLock::new(ssh_session));
        self.sessions
            .write()
            .insert(session_id.clone(), session_arc.clone());

        // Spawn reader thread to emit terminal data
        let session_id_clone = session_id.clone();
        let app_handle_clone = app_handle.clone();

        thread::spawn(move || {
            let mut buffer = [0u8; 4096];

            loop {
                // Check if still running
                if !*running.read() {
                    break;
                }

                // Try to read from channel
                let session_guard = session_arc.read();
                if let Some(ref _channel) = session_guard.channel {
                    // We need a mutable reference, so drop and re-acquire
                    drop(session_guard);

                    let mut session_guard = session_arc.write();
                    if let Some(ref mut channel) = session_guard.channel {
                        match channel.read(&mut buffer) {
                            Ok(0) => {
                                // EOF - channel closed
                                break;
                            }
                            Ok(n) => {
                                let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                                let _ = app_handle_clone.emit(
                                    "terminal-data",
                                    TerminalData {
                                        session_id: session_id_clone.clone(),
                                        data,
                                    },
                                );
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                // No data available, wait a bit
                                drop(session_guard);
                                thread::sleep(std::time::Duration::from_millis(10));
                            }
                            Err(_) => {
                                // Error reading
                                break;
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        });

        Ok(ConnectionResult {
            session_id,
            host: config.host,
            username: config.username,
            banner,
        })
    }

    /// Send data to terminal (user input)
    pub fn send_data(&self, session_id: &str, data: &str) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let mut session = session_arc.write();
        if let Some(ref mut channel) = session.channel {
            channel.write_all(data.as_bytes())?;
            channel.flush()?;
            Ok(())
        } else {
            Err(SshError::ChannelError("No active channel".to_string()))
        }
    }

    /// Resize terminal
    pub fn resize_pty(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let mut session = session_arc.write();
        if let Some(ref mut channel) = session.channel {
            channel
                .request_pty_size(cols, rows, None, None)
                .map_err(|e| SshError::ChannelError(format!("Failed to resize PTY: {}", e)))?;
            Ok(())
        } else {
            Err(SshError::ChannelError("No active channel".to_string()))
        }
    }

    /// Disconnect a session
    pub fn disconnect(&self, session_id: &str) -> Result<(), SshError> {
        let mut sessions = self.sessions.write();
        if let Some(session_arc) = sessions.remove(session_id) {
            // Signal the reader thread to stop
            let session = session_arc.read();
            *session.running.write() = false;
            
            // Stop all tunnels
            for (_, running) in session.tunnels.iter() {
                running.store(false, Ordering::SeqCst);
            }
            Ok(())
        } else {
            Err(SshError::SessionNotFound(session_id.to_string()))
        }
    }

    /// Execute a command on a session (one-shot)
    pub fn execute_command(&self, session_id: &str, command: &str) -> Result<String, SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();

        // Create a new channel for the command
        let mut channel = session.session.channel_session().map_err(|e| {
            SshError::ChannelError(format!("Failed to open channel: {}", e))
        })?;

        channel.exec(command).map_err(|e| {
            SshError::ChannelError(format!("Failed to execute command: {}", e))
        })?;

        let mut output = String::new();
        channel.read_to_string(&mut output)?;

        channel.wait_close()?;

        Ok(output)
    }

    /// List all sessions
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.read();
        sessions
            .iter()
            .map(|(id, session_arc)| {
                let session = session_arc.read();
                SessionInfo {
                    id: id.clone(),
                    host: session.config.host.clone(),
                    port: session.config.port,
                    username: session.config.username.clone(),
                    connected: session.is_authenticated(),
                    name: session.config.session_name.clone(),
                }
            })
            .collect()
    }

    /// Check if a session exists and is connected
    pub fn is_connected(&self, session_id: &str) -> bool {
        let sessions = self.sessions.read();
        if let Some(session_arc) = sessions.get(session_id) {
            let session = session_arc.read();
            session.is_authenticated() && session.has_channel()
        } else {
            false
        }
    }

    /// List files in a directory via SFTP
    pub fn sftp_ls(&self, session_id: &str, path: &str) -> Result<Vec<FileEntry>, SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();

        // Temporarily set blocking mode for SFTP operations
        session.session.set_blocking(true);

        // Initialize SFTP session
        let sftp = session.session.sftp().map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let path = std::path::Path::new(path);
        let entries = sftp.readdir(path).map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let mut file_entries = Vec::new();

        for (path_buf, stat) in entries {
            let name = path_buf
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?")
                .to_string();

            // Skip current and parent directory pointers if desired, but standard ls includes them usually.
            // For a GUI file browser, we usually want to filter "." and ".." unless handling navigation manually.
            if name == "." || name == ".." {
                continue;
            }

            file_entries.push(FileEntry {
                name: name.clone(),
                size: stat.size.unwrap_or(0),
                is_dir: stat.is_dir(),
                modified: stat.mtime.unwrap_or(0),
                permissions: format!("{:o}", stat.perm.unwrap_or(0)),
            });
        }

        // Sort: directories first, then files (case-insensitive)
        file_entries.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else {
                b.is_dir.cmp(&a.is_dir)
            }
        });

        // Restore non-blocking mode for terminal
        session.session.set_blocking(false);

        Ok(file_entries)
    }

    /// Read a remote file and save it locally
    pub fn sftp_read_file(&self, session_id: &str, remote_path: &str, local_path: &str) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();
        
        // Temporarily set blocking mode for SFTP
        session.session.set_blocking(true);
        
        let sftp = session.session.sftp().map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let mut remote_file = sftp.open(std::path::Path::new(remote_path)).map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;
        let mut local_file = std::fs::File::create(local_path).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;

        std::io::copy(&mut remote_file, &mut local_file).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;

        session.session.set_blocking(false);
        Ok(())
    }

    /// Write a local file to a remote path
    pub fn sftp_write_file(&self, session_id: &str, local_path: &str, remote_path: &str) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();
        
        // Temporarily set blocking mode for SFTP
        session.session.set_blocking(true);
        
        let sftp = session.session.sftp().map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let mut local_file = std::fs::File::open(local_path).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;
        let mut remote_file = sftp.create(std::path::Path::new(remote_path)).map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        std::io::copy(&mut local_file, &mut remote_file).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;

        session.session.set_blocking(false);
        Ok(())
    }

    /// Read a remote file as a string (for editing)
    pub fn sftp_read_string(&self, session_id: &str, remote_path: &str) -> Result<String, SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();
        
        // Temporarily set blocking mode for SFTP
        session.session.set_blocking(true);
        
        let sftp = session.session.sftp().map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let mut remote_file = sftp.open(std::path::Path::new(remote_path)).map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;
        let mut content = Vec::new();
        
        use std::io::Read;
        remote_file.read_to_end(&mut content).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;

        session.session.set_blocking(false);
        String::from_utf8(content).map_err(|_| SshError::IoError(std::io::Error::new(std::io::ErrorKind::InvalidData, "Not a valid UTF-8 file")))
    }

    /// Write a string to a remote file
    pub fn sftp_write_string(&self, session_id: &str, remote_path: &str, content: &str) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();
        
        // Temporarily set blocking mode for SFTP
        session.session.set_blocking(true);
        
        let sftp = session.session.sftp().map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;

        let mut remote_file = sftp.create(std::path::Path::new(remote_path)).map_err(|e| {
            session.session.set_blocking(false);
            SshError::Ssh2Error(e)
        })?;
        
        use std::io::Write;
        remote_file.write_all(content.as_bytes()).map_err(|e| {
            session.session.set_blocking(false);
            SshError::IoError(e)
        })?;

        session.session.set_blocking(false);
        Ok(())
    }

    /// Start a local port forward
    pub fn start_local_forward(
        &self,
        session_id: &str,
        local_port: u16,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        // Lock for writing to update tunnels map
        let mut session_guard = session_arc.write();

        if session_guard.tunnels.contains_key(&local_port) {
            return Err(SshError::ConnectionFailed(format!("Port {} is already being forwarded", local_port)));
        }

        // Create listener
        let listener = TcpListener::bind(format!("127.0.0.1:{}", local_port))
            .map_err(|e| SshError::IoError(e))?;
        
        listener.set_nonblocking(true).map_err(|e| SshError::IoError(e))?;

        let running = Arc::new(AtomicBool::new(true));
        session_guard.tunnels.insert(local_port, running.clone());

        let session_arc_clone = session_arc.clone();
        let remote_host_owned = remote_host.to_string();

        thread::spawn(move || {
            loop {
                if !running.load(Ordering::SeqCst) {
                    break;
                }

                match listener.accept() {
                    Ok((mut stream, _addr)) => {
                        // Handle new connection
                        let session_guard = session_arc_clone.read();
                        // Open direct-tcpip channel
                        // Note: channel_direct_tcpip might block or require handling non-blocking session
                        // But since we are in a thread, we can try.
                        // Ideally we handle this robustly.
                        match session_guard.session.channel_direct_tcpip(&remote_host_owned, remote_port, None) {
                            Ok(channel) => {
                                // Spawn thread to handle this connection's data pumping
                                let mut channel = channel;
                                
                                // We need to set stream non-blocking too if we use the loop pump
                                let _ = stream.set_nonblocking(true);
                                let _ = channel.handle_extended_data(ssh2::ExtendedData::Merge);

                                thread::spawn(move || {
                                    let mut buf_tcp = [0u8; 8192];
                                    let mut buf_ssh = [0u8; 8192];
                                    
                                    loop {
                                        let mut did_work = false;
                                        
                                        // Read TCP -> Write SSH
                                        match stream.read(&mut buf_tcp) {
                                            Ok(0) => break, // EOF
                                            Ok(n) => {
                                                if channel.write_all(&buf_tcp[..n]).is_err() { break; }
                                                did_work = true;
                                            }
                                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {},
                                            Err(_) => break
                                        }

                                        // Read SSH -> Write TCP
                                        match channel.read(&mut buf_ssh) {
                                            Ok(0) => break, // EOF
                                            Ok(n) => {
                                                if stream.write_all(&buf_ssh[..n]).is_err() { break; }
                                                did_work = true;
                                            }
                                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {},
                                            Err(_) => break
                                        }

                                        if !did_work {
                                            thread::sleep(std::time::Duration::from_millis(5));
                                        }
                                    }
                                    let _ = channel.close();
                                });
                            }
                            Err(e) => {
                                println!("Failed to open direct-tcpip channel: {}", e);
                            }
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Err(_) => {
                        // Listener error
                        break;
                    }
                }
            }
        });

        Ok(())
    }

    /// Stop a local port forward
    pub fn stop_local_forward(&self, session_id: &str, local_port: u16) -> Result<(), SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let mut session = session_arc.write();
        
        if let Some(running) = session.tunnels.remove(&local_port) {
            running.store(false, Ordering::SeqCst);
            Ok(())
        } else {
            Err(SshError::ConnectionFailed(format!("Port {} is not being forwarded", local_port)))
        }
    }

    /// List active tunnels for a session
    pub fn list_tunnels(&self, session_id: &str) -> Result<Vec<u16>, SshError> {
        let sessions = self.sessions.read();
        let session_arc = sessions
            .get(session_id)
            .ok_or_else(|| SshError::SessionNotFound(session_id.to_string()))?;

        let session = session_arc.read();
        let ports: Vec<u16> = session.tunnels.keys().cloned().collect();
        Ok(ports)
    }
}
impl Default for SshManager {
    fn default() -> Self {
        Self::new()
    }
}
