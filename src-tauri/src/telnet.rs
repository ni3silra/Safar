// Safar HP NonStop Telnet / TN6530 Client
// Native TCP connection with RFC 854 / RFC 1041 option negotiation and TELSERV TACL auto-service handling

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use uuid::Uuid;

// ============================================
// TELNET CONSTANTS (RFC 854 & RFC 1041)
// ============================================
const IAC: u8 = 255;  // Interpret As Command
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;   // Subnegotiation Begin
const SE: u8 = 240;   // Subnegotiation End

// Telnet Options
const OPT_BINARY: u8 = 0;
const OPT_ECHO: u8 = 1;
const OPT_SUPPRESS_GO_AHEAD: u8 = 3;
const OPT_TERMINAL_TYPE: u8 = 24;
#[allow(dead_code)] // Used by the NAWS code in resize(), currently disabled for HP NonStop
const OPT_NAWS: u8 = 31; // Negotiate About Window Size

// ============================================
// ERROR TYPES
// ============================================
#[derive(Error, Debug)]
pub enum TelnetError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
}

// ============================================
// DATA STRUCTURES
// ============================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetConfig {
    pub host: String,
    pub port: u16,
    pub service_name: Option<String>, // e.g. "TACL"
    pub username: Option<String>,
    pub password: Option<String>,
    pub term_type: Option<String>,     // "6530"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetConnectionResult {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub service_name: String,
}

#[derive(Clone, Serialize)]
struct TerminalDataPayload {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalLogPayload {
    session_id: String,
    message: String,
}

pub struct TelnetSession {
    pub stream: Arc<RwLock<TcpStream>>,
    #[allow(dead_code)]
    pub config: TelnetConfig,
    pub running: Arc<RwLock<bool>>,
    pub cols: Arc<AtomicU32>,
    pub rows: Arc<AtomicU32>,
    pub app_handle: AppHandle,
}

pub struct TelnetManager {
    sessions: Arc<RwLock<HashMap<String, TelnetSession>>>,
}

impl TelnetManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Connect to HP NonStop TELSERV / Telnet server
    pub fn connect(
        &self,
        app_handle: AppHandle,
        config: TelnetConfig,
    ) -> Result<TelnetConnectionResult, TelnetError> {
        let addr = format!("{}:{}", config.host, config.port);
        let socket_addrs: Vec<_> = addr
            .to_socket_addrs()
            .map_err(|e| TelnetError::ConnectionFailed(format!("Failed to resolve {}: {}", addr, e)))?
            .collect();

        if socket_addrs.is_empty() {
            return Err(TelnetError::ConnectionFailed(format!("Could not resolve host: {}", config.host)));
        }

        // Connect with 10s timeout
        let stream = TcpStream::connect_timeout(&socket_addrs[0], Duration::from_secs(10))
            .map_err(|e| TelnetError::ConnectionFailed(format!("Failed to connect to {}: {}", addr, e)))?;

        // Disable Nagle's algorithm for low-latency terminal interaction
        let _ = stream.set_nodelay(true);
        let _ = stream.set_read_timeout(Some(Duration::from_millis(50)));

        let mut stream_reader = stream.try_clone().map_err(|e| TelnetError::ConnectionFailed(format!("Failed to clone stream: {}", e)))?;

        let session_id = Uuid::new_v4().to_string();
        let running = Arc::new(RwLock::new(true));
        let cols = Arc::new(AtomicU32::new(80));
        let rows = Arc::new(AtomicU32::new(24));

        let stream_arc = Arc::new(RwLock::new(stream));
        let session = TelnetSession {
            stream: stream_arc.clone(),
            config: config.clone(),
            running: running.clone(),
            cols: cols.clone(),
            rows: rows.clone(),
            app_handle: app_handle.clone(),
        };

        self.sessions.write().insert(session_id.clone(), session);

        let session_id_clone = session_id.clone();
        let running_clone = running.clone();
        let stream_writer = stream_arc.clone();
        let app_handle_clone = app_handle.clone();
        let service_name_to_send = config.service_name.clone().unwrap_or_else(|| "TACL".to_string());
        let term_type_to_send = config.term_type.clone().unwrap_or_else(|| "TN6530-8".to_string());

        // Spawn background reader & Telnet negotiation thread
        thread::spawn(move || {
            let mut read_buf = [0u8; 4096];
            let mut service_sent = false;
            let mut last_term_reply = std::time::Instant::now() - std::time::Duration::from_secs(10);

            // Option negotiation state tracking (prevent infinite loops)
            let mut will_ttype_sent = true; // Sent proactively
            let mut will_sga_sent = true;   // Sent proactively
            
            let mut do_sga_sent = false;
            let mut do_echo_sent = false;
            let mut do_binary_sent = false;

            let mut rejected_dos = Vec::new();
            let mut rejected_wills = Vec::new();

            // Bytes of an IAC sequence that was split across two TCP reads.
            // Without this, the tail of a split sequence was treated as text (stray chars
            // on screen) and a truncated DO/WILL leaked a 0xFF byte into the output.
            let mut carry: Vec<u8> = Vec::new();

            // Proactively send WILL SGA and WILL TTYPE as required by some NonStop hosts
            {
                let init_bytes = vec![
                    IAC, WILL, OPT_SUPPRESS_GO_AHEAD,
                    IAC, WILL, OPT_TERMINAL_TYPE
                ];
                let mut guard = stream_writer.write();
                let _ = guard.write_all(&init_bytes);
                let _ = guard.flush();
                let _ = app_handle_clone.emit(
                    "terminal-log",
                    TerminalLogPayload {
                        session_id: session_id_clone.clone(),
                        message: format!("Sent {} bytes (Initial Telnet WILL SGA/TTYPE): {:?}", init_bytes.len(), init_bytes),
                    }
                );
            }

            while *running_clone.read() {
                let read_res = stream_reader.read(&mut read_buf);

                match read_res {
                    Ok(0) => {
                        // EOF - Server disconnected
                        let _ = app_handle_clone.emit(
                            "terminal-data",
                            TerminalDataPayload {
                                session_id: session_id_clone.clone(),
                                data: "\r\n[Connection closed by remote host]\r\n".to_string(),
                            },
                        );
                        break;
                    }
                    Ok(n) => {
                        let _ = app_handle_clone.emit(
                            "terminal-log",
                            TerminalLogPayload {
                                session_id: session_id_clone.clone(),
                                message: format!("Received {} bytes: {:?} (String: {:?})", n, &read_buf[..n], String::from_utf8_lossy(&read_buf[..n])),
                            }
                        );

                        let mut buf = std::mem::take(&mut carry);
                        buf.extend_from_slice(&read_buf[..n]);
                        let incoming = &buf[..];

                        let mut clean_data = Vec::new();
                        let mut i = 0;

                        // Process incoming bytes, handling Telnet IAC negotiation
                        while i < incoming.len() {
                            if incoming[i] == IAC {
                                // Incomplete IAC sequence at end of this read: keep it for the next read
                                let needed = match incoming.get(i + 1) {
                                    Some(&DO) | Some(&DONT) | Some(&WILL) | Some(&WONT) => 3,
                                    _ => 2,
                                };
                                if i + needed > incoming.len() {
                                    carry = incoming[i..].to_vec();
                                    break;
                                }
                                let cmd = incoming[i + 1];

                                match cmd {
                                    DO => {
                                        if i + 2 < incoming.len() {
                                            let opt = incoming[i + 2];
                                            let response = match opt {
                                                OPT_TERMINAL_TYPE => { if will_ttype_sent { vec![] } else { will_ttype_sent = true; vec![IAC, WILL, opt] } },
                                                OPT_SUPPRESS_GO_AHEAD => { if will_sga_sent { vec![] } else { will_sga_sent = true; vec![IAC, WILL, opt] } },
                                                // DO ECHO is refused: this client never echoes input locally. Agreeing
                                                // (WILL ECHO) tells the host *we* echo, so it stops echoing and typed
                                                // characters never appear on screen.
                                                _ => {
                                                    if rejected_dos.contains(&opt) { vec![] } else { rejected_dos.push(opt); vec![IAC, WONT, opt] }
                                                },
                                            };
                                            if !response.is_empty() {
                                                let mut guard = stream_writer.write();
                                                let _ = guard.write_all(&response);
                                                let _ = guard.flush();
                                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes: {:?}", response.len(), response) });
                                            }
                                            i += 3;
                                            continue;
                                        }
                                    }
                                    DONT => {
                                        if i + 2 < incoming.len() {
                                            let opt = incoming[i + 2];
                                            let mut response = vec![];
                                            if opt == OPT_TERMINAL_TYPE && will_ttype_sent {
                                                will_ttype_sent = false;
                                                response = vec![IAC, WONT, opt];
                                            } else if opt == OPT_SUPPRESS_GO_AHEAD && will_sga_sent {
                                                will_sga_sent = false;
                                                response = vec![IAC, WONT, opt];
                                            }
                                            if !response.is_empty() {
                                                let mut guard = stream_writer.write();
                                                let _ = guard.write_all(&response);
                                                let _ = guard.flush();
                                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes: {:?}", response.len(), response) });
                                            }
                                            i += 3;
                                            continue;
                                        }
                                    }
                                    WILL => {
                                        if i + 2 < incoming.len() {
                                            let opt = incoming[i + 2];
                                            let response = match opt {
                                                OPT_SUPPRESS_GO_AHEAD => { if do_sga_sent { vec![] } else { do_sga_sent = true; vec![IAC, DO, opt] } },
                                                OPT_ECHO => { if do_echo_sent { vec![] } else { do_echo_sent = true; vec![IAC, DO, opt] } },
                                                OPT_BINARY => { if do_binary_sent { vec![] } else { do_binary_sent = true; vec![IAC, DO, opt] } },
                                                _ => {
                                                    if rejected_wills.contains(&opt) { vec![] } else { rejected_wills.push(opt); vec![IAC, DONT, opt] }
                                                },
                                            };
                                            if !response.is_empty() {
                                                let mut guard = stream_writer.write();
                                                let _ = guard.write_all(&response);
                                                let _ = guard.flush();
                                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes: {:?}", response.len(), response) });
                                            }
                                            i += 3;
                                            continue;
                                        }
                                    }
                                    WONT => {
                                        if i + 2 < incoming.len() {
                                            let opt = incoming[i + 2];
                                            let mut response = vec![];
                                            if opt == OPT_SUPPRESS_GO_AHEAD && do_sga_sent {
                                                do_sga_sent = false;
                                                response = vec![IAC, DONT, opt];
                                            } else if opt == OPT_ECHO && do_echo_sent {
                                                do_echo_sent = false;
                                                response = vec![IAC, DONT, opt];
                                            } else if opt == OPT_BINARY && do_binary_sent {
                                                do_binary_sent = false;
                                                response = vec![IAC, DONT, opt];
                                            }
                                            if !response.is_empty() {
                                                let mut guard = stream_writer.write();
                                                let _ = guard.write_all(&response);
                                                let _ = guard.flush();
                                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes: {:?}", response.len(), response) });
                                            }
                                            i += 3;
                                            continue;
                                        }
                                    }
                                    SB => {
                                        // Subnegotiation: find matching IAC SE
                                        let mut j = i + 2;
                                        while j + 1 < incoming.len() && !(incoming[j] == IAC && incoming[j + 1] == SE) {
                                            j += 1;
                                        }
                                        if j + 1 < incoming.len() {
                                            let opt = incoming[i + 2];
                                            if opt == OPT_TERMINAL_TYPE {
                                                // Host sent: IAC SB TERMINAL-TYPE SEND IAC SE (request terminal type)
                                                // RFC 1091 / RFC 854: Reply: IAC SB TERMINAL-TYPE IS "..." IAC SE
                                                let mut sub_resp = vec![IAC, SB, OPT_TERMINAL_TYPE, 0]; // 0 = IS
                                                sub_resp.extend_from_slice(term_type_to_send.as_bytes());
                                                sub_resp.extend_from_slice(&[IAC, SE]);
                                                let mut guard = stream_writer.write();
                                                let _ = guard.write_all(&sub_resp);
                                                let _ = guard.flush();
                                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes (RFC Terminal-Type {}): {:?}", sub_resp.len(), term_type_to_send, sub_resp) });
                                            }
                                            i = j + 2;
                                            continue;
                                        }
                                        // Subnegotiation not terminated yet: wait for the rest
                                        // (cap protects against a malformed stream growing forever)
                                        if incoming.len() - i < 4096 {
                                            carry = incoming[i..].to_vec();
                                        }
                                        break;
                                    }
                                    IAC => {
                                        // Escaped 255 byte
                                        clean_data.push(255);
                                        i += 2;
                                        continue;
                                    }
                                    _ => {
                                        i += 2;
                                        continue;
                                    }
                                }
                            }

                            clean_data.push(incoming[i]);
                            i += 1;
                        }

                        if !clean_data.is_empty() {
                            let data_str = decode_terminal_bytes(&clean_data);
                            let lower_data = data_str.to_lowercase();

                            // Auto-enter Service Name (e.g. "TACL") on TELSERV prompt
                            if !service_sent && lower_data.contains("enter choice") {
                                service_sent = true;
                                let mut guard = stream_writer.write();
                                let service_cmd = format!("{}\r", service_name_to_send);
                                let _ = guard.write_all(service_cmd.as_bytes());
                                let _ = guard.flush();
                                let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes (Service Name): {:?}", service_cmd.as_bytes().len(), service_cmd.as_bytes()) });
                            }

                            // Auto-answer Terminal Type if TELSERV or TACL prompts in conversational stream
                            if lower_data.contains("terminal type?")
                                || lower_data.contains("terminal type:")
                                || lower_data.contains("terminal type [")
                                || lower_data.contains("terminal type (")
                                || lower_data.contains("enter terminal type")
                                || lower_data.contains("term = ")
                                || lower_data.contains("terminal [6530]")
                                || lower_data.contains("terminal [tn6530")
                            {
                                if last_term_reply.elapsed() > std::time::Duration::from_millis(1000) {
                                    last_term_reply = std::time::Instant::now();
                                    let mut guard = stream_writer.write();
                                    let term_cmd = format!("{}\r", term_type_to_send);
                                    let _ = guard.write_all(term_cmd.as_bytes());
                                    let _ = guard.flush();
                                    let _ = app_handle_clone.emit("terminal-log", TerminalLogPayload { session_id: session_id_clone.clone(), message: format!("Sent {} bytes (Conversational Terminal-Type {}): {:?}", term_cmd.as_bytes().len(), term_type_to_send, term_cmd.as_bytes()) });
                                }
                            }

                            // Emit clean data to frontend xterm
                            let _ = app_handle_clone.emit(
                                "terminal-data",
                                TerminalDataPayload {
                                    session_id: session_id_clone.clone(),
                                    data: data_str,
                                },
                            );
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                        // Sleep briefly on timeout to yield CPU
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(e) => {
                        // Socket error or connection lost
                        println!("Telnet socket error: {:?}", e);
                        let _ = app_handle_clone.emit(
                            "terminal-data",
                            TerminalDataPayload {
                                session_id: session_id_clone.clone(),
                                data: format!("\r\n[Connection error: {:?}]\r\n", e),
                            },
                        );
                        break;
                    }
                }
            }

            println!("Telnet thread exiting for session {}", session_id_clone);

            // Notify frontend of disconnection
            let _ = app_handle_clone.emit("terminal-disconnected", &session_id_clone);
        });

        Ok(TelnetConnectionResult {
            session_id,
            host: config.host,
            port: config.port,
            service_name: config.service_name.unwrap_or_else(|| "TACL".to_string()),
        })
    }

    /// Send user input to Telnet stream
    pub fn send_data(&self, session_id: &str, data: &str) -> Result<(), TelnetError> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| TelnetError::SessionNotFound(session_id.to_string()))?;

        let mut stream = session.stream.write();
        let bytes = encode_terminal_input(data);
        stream.write_all(&bytes)?;
        stream.flush()?;
        let _ = session.app_handle.emit("terminal-log", TerminalLogPayload { session_id: session_id.to_string(), message: format!("Sent {} bytes: {:?}", bytes.len(), bytes) });
        Ok(())
    }

    /// Disconnect Telnet session
    pub fn disconnect(&self, session_id: &str) -> Result<(), TelnetError> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.remove(session_id) {
            *session.running.write() = false;
            let stream = session.stream.write();
            let _ = stream.shutdown(std::net::Shutdown::Both);
        }
        Ok(())
    }

    /// Resize Telnet window (sends NAWS subnegotiation)
    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), TelnetError> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| TelnetError::SessionNotFound(session_id.to_string()))?;

        session.cols.store(cols, Ordering::Relaxed);
        session.rows.store(rows, Ordering::Relaxed);

        // Send Telnet NAWS subnegotiation: IAC SB NAWS <col_hi> <col_lo> <row_hi> <row_lo> IAC SE
        // DISABLED FOR HP NONSTOP COMPATIBILITY
        /*
        let col_hi = ((cols >> 8) & 0xFF) as u8;
        let col_lo = (cols & 0xFF) as u8;
        let row_hi = ((rows >> 8) & 0xFF) as u8;
        let row_lo = (rows & 0xFF) as u8;

        let naws_bytes = [IAC, SB, OPT_NAWS, col_hi, col_lo, row_hi, row_lo, IAC, SE];
        let mut stream = session.stream.write();
        let _ = stream.write_all(&naws_bytes);
        let _ = stream.flush();
        let _ = session.app_handle.emit("terminal-log", TerminalLogPayload { session_id: session_id.to_string(), message: format!("Sent {} bytes: {:?}", naws_bytes.len(), naws_bytes) });
        */
        Ok(())
    }
}

/// Encodes user input for the Telnet wire, mirroring `decode_terminal_bytes`.
/// NonStop hosts are 8-bit (ISO-8859-1), so each char U+0000..U+00FF is sent as one byte
/// (previously non-ASCII like 'ä' went out as 2 UTF-8 bytes). Chars outside Latin-1 become '?'.
/// A literal 0xFF byte is doubled (IAC IAC) as required by RFC 854.
pub fn encode_terminal_input(data: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    for ch in data.chars() {
        let code = ch as u32;
        let b = if code <= 0xFF { code as u8 } else { b'?' };
        out.push(b);
        if b == IAC {
            out.push(IAC);
        }
    }
    out
}

/// Decodes incoming terminal bytes into a UTF-8 String without character loss.
/// Fast-paths valid UTF-8 streams. For legacy systems (like Tandem NonStop or European systems)
/// sending ISO-8859-1 / Windows-1252 or 8-bit C1 control characters, non-UTF-8 bytes are
/// decoded into their proper Unicode characters instead of being corrupted to U+FFFD ('?').
pub fn decode_terminal_bytes(bytes: &[u8]) -> String {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }

    let mut result = String::with_capacity(bytes.len() * 2);
    let mut i = 0;
    while i < bytes.len() {
        match std::str::from_utf8(&bytes[i..]) {
            Ok(s) => {
                result.push_str(s);
                break;
            }
            Err(e) => {
                let valid_len = e.valid_up_to();
                if valid_len > 0 {
                    if let Ok(s) = std::str::from_utf8(&bytes[i..i + valid_len]) {
                        result.push_str(s);
                    }
                    i += valid_len;
                }
                if let Some(err_len) = e.error_len() {
                    for &b in &bytes[i..i + err_len] {
                        result.push(decode_single_byte(b));
                    }
                    i += err_len;
                } else {
                    for &b in &bytes[i..] {
                        result.push(decode_single_byte(b));
                    }
                    break;
                }
            }
        }
    }
    result
}

#[inline]
fn decode_single_byte(b: u8) -> char {
    match b {
        0x80 => '€',
        0x82 => '‚',
        0x83 => 'ƒ',
        0x84 => '„', // German low quote
        0x85 => '…',
        0x86 => '†',
        0x87 => '‡',
        0x88 => 'ˆ',
        0x89 => '‰',
        0x8A => 'Š',
        0x8B => '‹',
        0x8C => 'Œ',
        0x8E => '\u{008E}', // C1 SS2
        0x8F => '\u{008F}', // C1 SS3
        0x91 => '‘',
        0x92 => '’',
        0x93 => '“', // German high quote
        0x94 => '”',
        0x95 => '•',
        0x96 => '–', // en dash
        0x97 => '—', // em dash
        0x98 => '˜',
        0x99 => '™',
        0x9A => 'š',
        0x9B => '\u{009B}', // C1 CSI
        0x9C => 'œ',
        0x9D => '\u{009D}', // C1 OSC
        0x9E => 'ž',
        0x9F => 'Ÿ',
        _ => b as char, // 0x00-0x7F and 0xA0-0xFF (exact 1:1 ISO-8859-1 Latin-1: ä, ö, ü, ß, §, etc.)
    }
}

