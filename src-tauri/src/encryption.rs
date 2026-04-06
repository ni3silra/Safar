use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SALT_LEN: usize = 16;
const KEY_LEN: usize = 32;
const ITERATIONS: u32 = 600_000;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionFailed,
    #[error("Decryption failed")]
    DecryptionFailed,
    #[error("Invalid data format")]
    InvalidData,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedData {
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

pub struct EncryptionManager;

impl EncryptionManager {
    /// Derive a 32-byte key from password and salt
    fn derive_key(password: &str, salt: &[u8]) -> Key<Aes256Gcm> {
        let mut key = [0u8; KEY_LEN];
        pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, ITERATIONS, &mut key);
        *Key::<Aes256Gcm>::from_slice(&key)
    }

    /// Encrypt string data with a password
    pub fn encrypt(password: &str, data: &str) -> Result<EncryptedData, CryptoError> {
        // Generate random salt
        let mut salt = [0u8; SALT_LEN];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut salt);

        // Derive key
        let key = Self::derive_key(password, &salt);
        let cipher = Aes256Gcm::new(&key);

        // Generate nonce
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

        // Encrypt
        let ciphertext = cipher
            .encrypt(&nonce, data.as_bytes())
            .map_err(|_| CryptoError::EncryptionFailed)?;

        Ok(EncryptedData {
            salt: BASE64.encode(salt),
            nonce: BASE64.encode(nonce),
            ciphertext: BASE64.encode(ciphertext),
        })
    }

    /// Decrypt string data with a password
    pub fn decrypt(password: &str, encrypted: &EncryptedData) -> Result<String, CryptoError> {
        // Decode salt, nonce, ciphertext
        let salt = BASE64.decode(&encrypted.salt).map_err(|_| CryptoError::InvalidData)?;
        let nonce_bytes = BASE64.decode(&encrypted.nonce).map_err(|_| CryptoError::InvalidData)?;
        let ciphertext = BASE64.decode(&encrypted.ciphertext).map_err(|_| CryptoError::InvalidData)?;

        if salt.len() != SALT_LEN {
            return Err(CryptoError::InvalidData);
        }

        // Derive key
        let key = Self::derive_key(password, &salt);
        let cipher = Aes256Gcm::new(&key);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Decrypt
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|_| CryptoError::DecryptionFailed)?;

        String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptionFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let password = "strong-password";
        let data = "secret message hello world";

        let encrypted = EncryptionManager::encrypt(password, data).expect("Encryption failed");
        let decrypted = EncryptionManager::decrypt(password, &encrypted).expect("Decryption failed");

        assert_eq!(data, decrypted);
    }

    #[test]
    fn test_decrypt_wrong_password() {
        let password = "correct-password";
        let wrong_password = "wrong-password";
        let data = "secret message";

        let encrypted = EncryptionManager::encrypt(password, data).expect("Encryption failed");
        let result = EncryptionManager::decrypt(wrong_password, &encrypted);

        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_data() {
        let password = "password";
        let invalid_encrypted = EncryptedData {
            salt: "aW52YWxpZA==".to_string(), // "invalid" in base64
            nonce: "bm9uY2U=".to_string(), // "nonce" in base64
            ciphertext: "Y2lwaGVydGV4dA==".to_string(), // "ciphertext" in base64
        };

        let result = EncryptionManager::decrypt(password, &invalid_encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_ciphertext_tampering() {
        let password = "password";
        let data = "original data";
        let mut encrypted = EncryptionManager::encrypt(password, data).unwrap();
        
        // Corrupt the ciphertext (change one character in base64)
        let mut bytes = BASE64.decode(&encrypted.ciphertext).unwrap();
        bytes[0] ^= 0xFF; 
        encrypted.ciphertext = BASE64.encode(bytes);

        let result = EncryptionManager::decrypt(password, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_salt_tampering() {
        let password = "password";
        let data = "original data";
        let mut encrypted = EncryptionManager::encrypt(password, data).unwrap();
        
        // Corrupt the salt
        let mut bytes = BASE64.decode(&encrypted.salt).unwrap();
        bytes[0] ^= 0xFF;
        encrypted.salt = BASE64.encode(bytes);

        // Should fail because key derivation will yield wrong key
        let result = EncryptionManager::decrypt(password, &encrypted);
        assert!(result.is_err());
    }
}
