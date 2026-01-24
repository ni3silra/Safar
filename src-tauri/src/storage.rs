// Session Storage Module
// Handles saving and loading session profiles

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;
use uuid::Uuid;
use crate::encryption::{EncryptionManager, EncryptedData};

// ============================================
// ERROR TYPES
// ============================================

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Storage is locked")]
    Locked,

    #[error("Crypto error: {0}")]
    CryptoError(#[from] crate::encryption::CryptoError),
}

// ============================================
// DATA TYPES
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_type: AuthType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub last_connected: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AuthType {
    #[default]
    Password,
    PrivateKey,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSnippet {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionStore {
    pub sessions: Vec<SavedSession>,
    pub recent: Vec<String>, // Session IDs in order of recency
    #[serde(default)]
    pub snippets: Vec<CommandSnippet>,
}

impl SavedSession {
    #[allow(dead_code)]
    pub fn new(name: String, host: String, port: u16, username: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            host,
            port,
            username,
            auth_type: AuthType::Password,
            private_key_path: None,
            is_favorite: false,
            group: None,
            last_connected: None,
            notes: None,
        }
    }
}

// ============================================
// SESSION STORAGE MANAGER
// ============================================

pub struct SessionStorage {
    file_path: PathBuf,
    store: SessionStore,
    encryption_key: Option<String>, // Master password
    is_locked: bool,
}

impl SessionStorage {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, StorageError> {
        let file_path = app_data_dir.join("sessions.json");

        // Create directory if it doesn't exist
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut store = SessionStore::default();
        let mut is_locked = false;

        // Load existing sessions
        if file_path.exists() {
            let content = fs::read_to_string(&file_path)?;
            
            // Try to parse as EncryptedData first
            if let Ok(_) = serde_json::from_str::<EncryptedData>(&content) {
                is_locked = true;
            } else {
                // Try plain JSON
                store = serde_json::from_str(&content).unwrap_or_default();
            }
        }

        Ok(Self { 
            file_path, 
            store, 
            encryption_key: None,
            is_locked 
        })
    }

    /// Save store to file
    fn save(&self) -> Result<(), StorageError> {
        if self.is_locked {
            return Err(StorageError::Locked);
        }

        let json_content = serde_json::to_string(&self.store)?;

        let final_content = if let Some(ref password) = self.encryption_key {
            // Encrypt
            let encrypted = EncryptionManager::encrypt(password, &json_content)?;
            serde_json::to_string_pretty(&encrypted)?
        } else {
            // Plain
            serde_json::to_string_pretty(&self.store)?
        };

        fs::write(&self.file_path, final_content)?;
        Ok(())
    }

    pub fn is_locked(&self) -> bool {
        self.is_locked
    }

    pub fn has_password(&self) -> bool {
        self.encryption_key.is_some() || self.is_locked
    }

    /// Unlock the storage
    pub fn unlock(&mut self, password: &str) -> Result<bool, StorageError> {
        if !self.file_path.exists() {
            // Nothing to unlock, just set password
            self.encryption_key = Some(password.to_string());
            self.is_locked = false;
            return Ok(true);
        }

        let content = fs::read_to_string(&self.file_path)?;

        // Check if actually encrypted
        if let Ok(encrypted) = serde_json::from_str::<EncryptedData>(&content) {
            match EncryptionManager::decrypt(password, &encrypted) {
                Ok(json) => {
                    self.store = serde_json::from_str(&json)?;
                    self.encryption_key = Some(password.to_string());
                    self.is_locked = false;
                    Ok(true)
                },
                Err(_) => Ok(false) // Wrong password
            }
        } else {
            // Not encrypted, proceed (maybe migrating?)
            self.encryption_key = Some(password.to_string());
            self.is_locked = false;
            Ok(true)
        }
    }

    /// Set a master password (encrypts current data)
    pub fn set_master_password(&mut self, password: &str) -> Result<(), StorageError> {
        self.encryption_key = Some(password.to_string());
        self.save()?;
        Ok(())
    }

    /// Remove master password (decrypts data)
    pub fn remove_master_password(&mut self) -> Result<(), StorageError> {
        if self.is_locked {
             return Err(StorageError::Locked);
        }
        self.encryption_key = None;
        self.save()?;
        Ok(())
    }

    /// Get all sessions
    pub fn get_all(&self) -> Vec<SavedSession> {
        self.store.sessions.clone()
    }

    /// Get favorites
    pub fn get_favorites(&self) -> Vec<SavedSession> {
        self.store
            .sessions
            .iter()
            .filter(|s| s.is_favorite)
            .cloned()
            .collect()
    }

    /// Get recent sessions (up to 10)
    pub fn get_recent(&self) -> Vec<SavedSession> {
        self.store
            .recent
            .iter()
            .take(10)
            .filter_map(|id| self.store.sessions.iter().find(|s| &s.id == id).cloned())
            .collect()
    }

    /// Get session by ID
    #[allow(dead_code)]
    pub fn get_by_id(&self, id: &str) -> Option<SavedSession> {
        self.store.sessions.iter().find(|s| s.id == id).cloned()
    }

    /// Add or update a session
    pub fn save_session(&mut self, mut session: SavedSession) -> Result<SavedSession, StorageError> {
        // Generate ID if new
        if session.id.is_empty() {
            session.id = Uuid::new_v4().to_string();
        }

        // Check if exists
        let existing_idx = self.store.sessions.iter().position(|s| s.id == session.id);

        if let Some(idx) = existing_idx {
            self.store.sessions[idx] = session.clone();
        } else {
            self.store.sessions.push(session.clone());
        }

        self.save()?;
        Ok(session)
    }

    /// Delete a session
    pub fn delete_session(&mut self, id: &str) -> Result<(), StorageError> {
        let idx = self
            .store
            .sessions
            .iter()
            .position(|s| s.id == id)
            .ok_or_else(|| StorageError::SessionNotFound(id.to_string()))?;

        self.store.sessions.remove(idx);
        self.store.recent.retain(|r| r != id);
        self.save()?;
        Ok(())
    }

    /// Toggle favorite status
    pub fn toggle_favorite(&mut self, id: &str) -> Result<bool, StorageError> {
        let session = self
            .store
            .sessions
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or_else(|| StorageError::SessionNotFound(id.to_string()))?;

        session.is_favorite = !session.is_favorite;
        let is_fav = session.is_favorite;
        self.save()?;
        Ok(is_fav)
    }

    /// Add to recent (called when connecting)
    pub fn add_to_recent(&mut self, id: &str) -> Result<(), StorageError> {
        // Remove if already in recent
        self.store.recent.retain(|r| r != id);
        // Add to front
        self.store.recent.insert(0, id.to_string());
        // Keep only last 10
        if self.store.recent.len() > 10 {
            self.store.recent.truncate(10);
        }

        // Update last_connected timestamp
        if let Some(session) = self.store.sessions.iter_mut().find(|s| s.id == id) {
            session.last_connected = Some(chrono::Utc::now().to_rfc3339());
        }

        self.save()?;
        Ok(())
    }

    /// Import sessions from JSON (deduping by properties)
    pub fn import_sessions(&mut self, json_content: &str) -> Result<usize, StorageError> {
        let imported: Vec<SavedSession> = serde_json::from_str(json_content)?;
        let mut count = 0;

        for mut session in imported {
            // Check for duplicates (same name and host)
            let exists = self.store.sessions.iter().any(|s| s.name == session.name && s.host == session.host);
            
            if !exists {
                // Ensure ID is unique
                session.id = Uuid::new_v4().to_string();
                self.store.sessions.push(session);
                count += 1;
            }
        }

        if count > 0 {
            self.save()?;
        }
        
        Ok(count)
    }

    /// Get all snippets
    pub fn get_snippets(&self) -> Vec<CommandSnippet> {
        self.store.snippets.clone()
    }

    /// Save (add/update) a snippet
    pub fn save_snippet(&mut self, mut snippet: CommandSnippet) -> Result<CommandSnippet, StorageError> {
        if snippet.id.is_empty() {
            snippet.id = Uuid::new_v4().to_string();
        }

        let existing_idx = self.store.snippets.iter().position(|s| s.id == snippet.id);

        if let Some(idx) = existing_idx {
            self.store.snippets[idx] = snippet.clone();
        } else {
            self.store.snippets.push(snippet.clone());
        }

        self.save()?;
        Ok(snippet)
    }

    /// Delete a snippet
    pub fn delete_snippet(&mut self, id: &str) -> Result<(), StorageError> {
        let idx = self.store.snippets.iter().position(|s| s.id == id).ok_or_else(|| StorageError::SessionNotFound(id.to_string()))?;
        self.store.snippets.remove(idx);
        self.save()?;
        Ok(())
    }
}
