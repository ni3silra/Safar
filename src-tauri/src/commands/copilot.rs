// Safar GitHub Copilot & AI Integration
// Handles GitHub Device Flow OAuth, Copilot internal token retrieval, and Chat completions

use crate::CommandResponse;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};

const GITHUB_COPILOT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98"; // Official VS Code Copilot Client ID
const GITHUB_CLI_CLIENT_ID: &str = "0170a3f44d1bc7e4f0c9"; // GitHub CLI Client ID

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicePollResponse {
    pub status: String, // "pending" | "slow_down" | "success" | "error" | "expired"
    pub access_token: Option<String>,
    pub interval: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub html_url: Option<String>,
    pub bio: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAuthResult {
    pub token: String,
    pub is_copilot_token: bool,
    pub endpoint: String,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

/// Step 1: Initiate GitHub Device Code Flow
#[tauri::command]
pub async fn copilot_device_code(use_cli_client: Option<bool>) -> CommandResponse<DeviceCodeResponse> {
    let client = reqwest::Client::new();
    let client_id = if use_cli_client.unwrap_or(false) {
        GITHUB_CLI_CLIENT_ID
    } else {
        GITHUB_COPILOT_CLIENT_ID
    };

    let res = client
        .post("https://github.com/login/device/code")
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "Safar-SSH-Copilot/1.0")
        .json(&serde_json::json!({
            "client_id": client_id,
            "scope": "read:user,copilot"
        }))
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<DeviceCodeResponse>().await {
                    Ok(data) => CommandResponse::ok(data),
                    Err(e) => CommandResponse::err(format!("Failed to parse response: {}", e)),
                }
            } else {
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                CommandResponse::err(format!("GitHub error (status {}): {}", status, err_text))
            }
        }
        Err(e) => CommandResponse::err(format!("Network request failed: {}", e)),
    }
}

/// Step 2: Poll GitHub OAuth device endpoint until user approves in browser
#[tauri::command]
pub async fn copilot_poll_auth(
    device_code: String,
    use_cli_client: Option<bool>,
) -> CommandResponse<DevicePollResponse> {
    let client = reqwest::Client::new();
    let client_id = if use_cli_client.unwrap_or(false) {
        GITHUB_CLI_CLIENT_ID
    } else {
        GITHUB_COPILOT_CLIENT_ID
    };

    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "Safar-SSH-Copilot/1.0")
        .json(&serde_json::json!({
            "client_id": client_id,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await;

    match res {
        Ok(resp) => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
                        CommandResponse::ok(DevicePollResponse {
                            status: "success".into(),
                            access_token: Some(token.to_string()),
                            interval: None,
                            error: None,
                        })
                    } else if let Some(err) = json.get("error").and_then(|v| v.as_str()) {
                        match err {
                            "authorization_pending" => CommandResponse::ok(DevicePollResponse {
                                status: "pending".into(),
                                access_token: None,
                                interval: None,
                                error: None,
                            }),
                            "slow_down" => {
                                let interval = json.get("interval").and_then(|v| v.as_u64()).unwrap_or(10);
                                CommandResponse::ok(DevicePollResponse {
                                    status: "slow_down".into(),
                                    access_token: None,
                                    interval: Some(interval),
                                    error: None,
                                })
                            }
                            "expired_token" => CommandResponse::ok(DevicePollResponse {
                                status: "expired".into(),
                                access_token: None,
                                interval: None,
                                error: Some("Authorization code expired. Please initiate sign-in again.".into()),
                            }),
                            "access_denied" => CommandResponse::ok(DevicePollResponse {
                                status: "error".into(),
                                access_token: None,
                                interval: None,
                                error: Some("Login was cancelled or denied on GitHub.".into()),
                            }),
                            other => CommandResponse::ok(DevicePollResponse {
                                status: "error".into(),
                                access_token: None,
                                interval: None,
                                error: Some(format!("GitHub auth error: {}", other)),
                            }),
                        }
                    } else {
                        CommandResponse::err("Unexpected response format from GitHub".into())
                    }
                }
                Err(e) => CommandResponse::err(format!("Failed to parse GitHub JSON: {}", e)),
            }
        }
        Err(e) => CommandResponse::err(format!("Auth polling failed: {}", e)),
    }
}

/// Step 3: Fetch the authenticated user profile
#[tauri::command]
pub async fn copilot_get_user(access_token: String) -> CommandResponse<GitHubUser> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/user")
        .header(AUTHORIZATION, format!("Bearer {}", access_token))
        .header(USER_AGENT, "Safar-SSH-Copilot/1.0")
        .header(ACCEPT, "application/vnd.github.v3+json")
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<GitHubUser>().await {
                    Ok(user) => CommandResponse::ok(user),
                    Err(e) => CommandResponse::err(format!("Failed to parse user profile: {}", e)),
                }
            } else {
                let status = resp.status();
                let err_text = resp.text().await.unwrap_or_default();
                CommandResponse::err(format!("GitHub user query failed (status {}): {}", status, err_text))
            }
        }
        Err(e) => CommandResponse::err(format!("Network request failed: {}", e)),
    }
}

/// Step 4: Exchange GitHub OAuth access token for Copilot internal session token
/// If user has no active Copilot license, seamlessly falls back to GitHub Models inference endpoint!
#[tauri::command]
pub async fn copilot_get_token(access_token: String) -> CommandResponse<CopilotAuthResult> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/copilot_internal/v2/token")
        .header(AUTHORIZATION, format!("token {}", access_token))
        .header("Editor-Version", "vscode/1.95.0")
        .header("Editor-Plugin-Version", "copilot-chat/0.22.0")
        .header(USER_AGENT, "GithubCopilot/1.22.0")
        .header(ACCEPT, "application/json")
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(token) = json.get("token").and_then(|v| v.as_str()) {
                        let expires_at = json.get("expires_at").and_then(|v| v.as_i64());
                        let endpoint = json
                            .get("endpoints")
                            .and_then(|e| e.get("api"))
                            .and_then(|u| u.as_str())
                            .unwrap_or("https://api.githubcopilot.com")
                            .to_string();

                        return CommandResponse::ok(CopilotAuthResult {
                            token: token.to_string(),
                            is_copilot_token: true,
                            endpoint,
                            expires_at,
                        });
                    }
                }
            }

            // Fallback: If Copilot internal token is not granted (e.g. standard GitHub user),
            // use the access_token with GitHub Models API endpoint!
            CommandResponse::ok(CopilotAuthResult {
                token: access_token,
                is_copilot_token: false,
                endpoint: "https://models.inference.ai.azure.com".to_string(),
                expires_at: None,
            })
        }
        Err(_) => {
            // Fallback on network error to GitHub Models
            CommandResponse::ok(CopilotAuthResult {
                token: access_token,
                is_copilot_token: false,
                endpoint: "https://models.inference.ai.azure.com".to_string(),
                expires_at: None,
            })
        }
    }
}

/// Step 5: Send chat completions query to Copilot Chat or GitHub Models
#[tauri::command]
pub async fn copilot_chat(
    token: String,
    model: String,
    messages: Vec<ChatMessage>,
    endpoint: Option<String>,
) -> CommandResponse<String> {
    let client = reqwest::Client::new();

    let base_endpoint = endpoint.unwrap_or_else(|| {
        if token.starts_with("tid=") {
            "https://api.githubcopilot.com".to_string()
        } else {
            "https://models.inference.ai.azure.com".to_string()
        }
    });

    let full_url = if base_endpoint.ends_with("/chat/completions") {
        base_endpoint.clone()
    } else {
        format!("{}/chat/completions", base_endpoint.trim_end_matches('/'))
    };

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "stream": false
    });

    let mut req = client
        .post(&full_url)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json");

    if full_url.contains("githubcopilot.com") {
        req = req
            .header("Editor-Version", "vscode/1.95.0")
            .header("Editor-Plugin-Version", "copilot-chat/0.22.0")
            .header(USER_AGENT, "GithubCopilot/1.22.0")
            .header("Openai-Organization", "github-copilot")
            .header("Openai-Intent", "conversation-panel");
    } else {
        req = req.header(USER_AGENT, "Safar-SSH-Copilot/1.0");
    }

    match req.json(&payload).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if let Some(content) = json
                            .get("choices")
                            .and_then(|c| c.get(0))
                            .and_then(|c0| c0.get("message"))
                            .and_then(|m| m.get("content"))
                            .and_then(|t| t.as_str())
                        {
                            CommandResponse::ok(content.to_string())
                        } else {
                            CommandResponse::err("Could not find content in AI response choices".into())
                        }
                    }
                    Err(e) => CommandResponse::err(format!("Failed to parse AI JSON response: {}", e)),
                }
            } else {
                let err_text = resp.text().await.unwrap_or_default();
                CommandResponse::err(format!("AI service returned error {}: {}", status, err_text))
            }
        }
        Err(e) => CommandResponse::err(format!("Failed to contact AI service: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_code_response_deserialization() {
        let json_str = r#"{
            "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
            "user_code": "WDJB-MJHT",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        }"#;

        let res: Result<DeviceCodeResponse, _> = serde_json::from_str(json_str);
        assert!(res.is_ok());
        let data = res.unwrap();
        assert_eq!(data.user_code, "WDJB-MJHT");
        assert_eq!(data.verification_uri, "https://github.com/login/device");
        assert_eq!(data.interval, 5);
        assert_eq!(data.expires_in, 900);
    }

    #[test]
    fn test_device_poll_pending_deserialization() {
        let json_str = r#"{
            "status": "pending",
            "access_token": null,
            "interval": null,
            "error": null
        }"#;

        let res: Result<DevicePollResponse, _> = serde_json::from_str(json_str);
        assert!(res.is_ok());
        assert_eq!(res.unwrap().status, "pending");
    }

    #[test]
    fn test_device_poll_success_deserialization() {
        let json_str = r#"{
            "status": "success",
            "access_token": "ghu_1234567890abcdef",
            "interval": null,
            "error": null
        }"#;

        let res: Result<DevicePollResponse, _> = serde_json::from_str(json_str);
        assert!(res.is_ok());
        let data = res.unwrap();
        assert_eq!(data.status, "success");
        assert_eq!(data.access_token.as_deref(), Some("ghu_1234567890abcdef"));
    }

    #[test]
    fn test_chat_message_creation() {
        let msg = ChatMessage {
            role: "user".into(),
            content: "Check disk usage".into(),
        };
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content, "Check disk usage");
    }
}

