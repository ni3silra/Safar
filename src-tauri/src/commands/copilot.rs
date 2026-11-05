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

/// Helper function to create an HTTP client with optional corporate proxy and SSL inspection settings
pub fn create_http_client(proxy: Option<&str>, ignore_ssl: Option<bool>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();

    if ignore_ssl.unwrap_or(false) {
        builder = builder.danger_accept_invalid_certs(true);
    }

    if let Some(proxy_str) = proxy {
        let trimmed = proxy_str.trim();
        if !trimmed.is_empty() {
            let normalized_proxy = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
                format!("http://{}", trimmed)
            } else {
                trimmed.to_string()
            };

            match reqwest::Proxy::all(&normalized_proxy) {
                Ok(p) => {
                    builder = builder.proxy(p);
                }
                Err(e) => {
                    return Err(format!("Invalid proxy configuration '{}': {}", normalized_proxy, e));
                }
            }
        }
    }

    builder.build().map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Step 1: Initiate GitHub Device Code Flow
#[tauri::command]
pub async fn copilot_device_code(
    use_cli_client: Option<bool>,
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<DeviceCodeResponse> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
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
            "scope": "read:user"
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
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<DevicePollResponse> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
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
pub async fn copilot_get_user(
    access_token: String,
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<GitHubUser> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
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
#[tauri::command]
pub async fn copilot_get_token(
    access_token: String,
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<CopilotAuthResult> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
    let res = client
        .get("https://api.github.com/copilot_internal/v2/token")
        .header(AUTHORIZATION, format!("Bearer {}", access_token))
        .header("Editor-Version", "vscode/1.95.0")
        .header("Editor-Plugin-Version", "copilot-chat/0.22.0")
        .header(USER_AGENT, "GithubCopilot/1.22.0")
        .header(ACCEPT, "application/json")
        .send()
        .await;

    match res {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();

            if status.is_success() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
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

            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::NOT_FOUND {
                return CommandResponse::err(format!(
                    "GitHub Copilot is not enabled for this account (status {}). Please ensure your GitHub account has an active GitHub Copilot subscription, or enter an API key.",
                    status
                ));
            }

            CommandResponse::err(format!("GitHub token exchange failed (status {}): {}", status, body))
        }
        Err(e) => CommandResponse::err(format!("Network error contacting GitHub: {}", e)),
    }
}

async fn execute_chat_request(
    client: &reqwest::Client,
    full_url: &str,
    active_token: &str,
    model_name: &str,
    messages: &[ChatMessage],
) -> Result<String, (reqwest::StatusCode, String)> {
    let payload = serde_json::json!({
        "model": model_name,
        "messages": messages,
        "temperature": 0.2,
        "stream": false
    });

    let mut req = client
        .post(full_url)
        .header(AUTHORIZATION, format!("Bearer {}", active_token))
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json");

    if full_url.contains("githubcopilot.com") {
        req = req
            .header("Editor-Version", "vscode/1.95.0")
            .header("Editor-Plugin-Version", "copilot-chat/0.22.0")
            .header(USER_AGENT, "GithubCopilot/1.22.0")
            .header("Copilot-Integration-Id", "vscode-chat")
            .header("Openai-Organization", "github-copilot")
            .header("Openai-Intent", "conversation-panel");
    } else {
        req = req.header(USER_AGENT, "Safar-SSH-Copilot/1.0");
    }

    let resp = req.json(&payload).send().await.map_err(|e| {
        (reqwest::StatusCode::INTERNAL_SERVER_ERROR, format!("Network error: {}", e))
    })?;

    let status = resp.status();
    let raw_text = resp.text().await.unwrap_or_default();

    if status.is_success() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw_text) {
            if let Some(content) = json
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c0| c0.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|t| t.as_str())
            {
                return Ok(content.to_string());
            } else if let Some(content) = json
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c0| c0.get("text"))
                .and_then(|t| t.as_str())
            {
                return Ok(content.to_string());
            }
        }

        if !raw_text.trim().is_empty() && raw_text.trim() != "OK" {
            return Ok(raw_text);
        }

        Err((status, format!("Unexpected response format: {}", raw_text)))
    } else {
        Err((status, raw_text))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotModelInfo {
    pub id: String,
    pub name: String,
}

/// Step 4b: Retrieve list of accessible models from GitHub Copilot or configured AI provider
#[tauri::command]
pub async fn copilot_get_models(
    token: String,
    endpoint: Option<String>,
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<Vec<CopilotModelInfo>> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
    let mut active_token = token.trim().to_string();

    // Auto-exchange if GitHub OAuth token
    if (active_token.starts_with("ghu_") || active_token.starts_with("gho_")) && !active_token.starts_with("tid=") {
        if let CommandResponse {
            success: true,
            data: Some(auth_res),
            ..
        } = copilot_get_token(active_token.clone(), proxy.clone(), ignore_ssl).await
        {
            active_token = auth_res.token;
        }
    }

    let raw_endpoint = endpoint.unwrap_or_default().trim().to_string();
    let target_url = if raw_endpoint.is_empty()
        || raw_endpoint.contains("models.inference.ai.azure.com")
        || raw_endpoint.contains("models.github.ai")
        || raw_endpoint.contains("githubcopilot.com")
    {
        if active_token.starts_with("sk-") {
            "https://api.openai.com/v1/models".to_string()
        } else if active_token.starts_with("gsk_") {
            "https://api.groq.com/openai/v1/models".to_string()
        } else {
            "https://api.githubcopilot.com/models".to_string()
        }
    } else if raw_endpoint.ends_with("/models") {
        raw_endpoint
    } else {
        format!("{}/models", raw_endpoint.trim_end_matches('/'))
    };

    let mut req = client
        .get(&target_url)
        .header(AUTHORIZATION, format!("Bearer {}", active_token))
        .header(ACCEPT, "application/json");

    if target_url.contains("githubcopilot.com") {
        req = req
            .header("Editor-Version", "vscode/1.95.0")
            .header("Editor-Plugin-Version", "copilot-chat/0.22.0")
            .header(USER_AGENT, "GithubCopilot/1.22.0")
            .header("Copilot-Integration-Id", "vscode-chat");
    } else {
        req = req.header(USER_AGENT, "Safar-SSH-Copilot/1.0");
    }

    let default_copilot_models = vec![
        CopilotModelInfo { id: "gpt-4o".into(), name: "GPT-4o".into() },
        CopilotModelInfo { id: "gpt-4o-mini".into(), name: "GPT-4o Mini".into() },
        CopilotModelInfo { id: "gpt-4".into(), name: "GPT-4".into() },
        CopilotModelInfo { id: "o1-mini".into(), name: "o1-mini".into() },
    ];

    match req.send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                let body = resp.text().await.unwrap_or_default();
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    let mut models: Vec<CopilotModelInfo> = Vec::new();
                    let list = json
                        .get("data")
                        .or_else(|| json.get("models"))
                        .and_then(|v| v.as_array());

                    if let Some(arr) = list {
                        for item in arr {
                            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                                let name = item
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(id)
                                    .to_string();
                                models.push(CopilotModelInfo {
                                    id: id.to_string(),
                                    name,
                                });
                            }
                        }
                    }

                    if !models.is_empty() {
                        return CommandResponse::ok(models);
                    }
                }
            }
            CommandResponse::ok(default_copilot_models)
        }
        Err(_) => CommandResponse::ok(default_copilot_models),
    }
}

/// Step 5: Send chat completions query to Copilot Chat or OpenAI/Custom API
#[tauri::command]
pub async fn copilot_chat(
    token: String,
    model: String,
    messages: Vec<ChatMessage>,
    endpoint: Option<String>,
    proxy: Option<String>,
    ignore_ssl: Option<bool>,
) -> CommandResponse<String> {
    let client = match create_http_client(proxy.as_deref(), ignore_ssl) {
        Ok(c) => c,
        Err(e) => return CommandResponse::err(e),
    };
    let mut active_token = token.trim().to_string();

    // If the token is a GitHub OAuth token (ghu_... or gho_...), auto-exchange it for a Copilot internal token
    if (active_token.starts_with("ghu_") || active_token.starts_with("gho_")) && !active_token.starts_with("tid=") {
        match copilot_get_token(active_token.clone(), proxy.clone(), ignore_ssl).await {
            CommandResponse {
                success: true,
                data: Some(auth_res),
                ..
            } => {
                active_token = auth_res.token;
            }
            CommandResponse {
                error: Some(err), ..
            } => {
                return CommandResponse::err(format!(
                    "GitHub Copilot subscription required: {}. You can configure an OpenAI, Groq, or custom API key in Settings (⚙️).",
                    err
                ));
            }
            _ => {
                return CommandResponse::err(
                    "Unable to exchange GitHub OAuth token for Copilot session token. Please ensure your account has Copilot access or configure an API key in Settings (⚙️).".to_string(),
                );
            }
        }
    }

    // Determine target endpoint
    let raw_endpoint = endpoint.unwrap_or_default().trim().to_string();
    let base_endpoint = if raw_endpoint.is_empty()
        || raw_endpoint.contains("models.inference.ai.azure.com")
        || raw_endpoint.contains("models.github.ai")
    {
        if active_token.starts_with("sk-") {
            "https://api.openai.com/v1".to_string()
        } else if active_token.starts_with("gsk_") {
            "https://api.groq.com/openai/v1".to_string()
        } else {
            "https://api.githubcopilot.com".to_string()
        }
    } else {
        raw_endpoint
    };

    let full_url = if base_endpoint.ends_with("/chat/completions") {
        base_endpoint.clone()
    } else {
        format!("{}/chat/completions", base_endpoint.trim_end_matches('/'))
    };

    // Sanitize requested model for Copilot API (Auto resolves to gpt-4o)
    let raw_model = model.trim().to_string();
    let effective_model = if raw_model.is_empty() || raw_model.eq_ignore_ascii_case("auto") {
        "gpt-4o".to_string()
    } else {
        raw_model
    };

    let initial_model = if full_url.contains("githubcopilot.com") {
        match effective_model.as_str() {
            "gpt-4o" | "gpt-4o-mini" | "gpt-4" | "o1-mini" | "o1-preview" | "claude-3.5-sonnet" => effective_model,
            _ => "gpt-4o".to_string(),
        }
    } else {
        effective_model
    };

    match execute_chat_request(&client, &full_url, &active_token, &initial_model, &messages).await {
        Ok(reply) => CommandResponse::ok(reply),
        Err((status, err_body)) => {
            // If Copilot returns model_not_supported, automatically fallback to gpt-4 or gpt-4o
            if full_url.contains("githubcopilot.com") && err_body.contains("model_not_supported") {
                let fallback_model = if initial_model == "gpt-4" { "gpt-4o" } else { "gpt-4" };
                if let Ok(reply) = execute_chat_request(&client, &full_url, &active_token, fallback_model, &messages).await {
                    return CommandResponse::ok(reply);
                }
            }

            if status == reqwest::StatusCode::UNAUTHORIZED {
                CommandResponse::err(format!(
                    "AI service returned 401 Unauthorized ({}): {}. Your token may have expired or is invalid. Please sign in again or verify your API key.",
                    full_url, err_body
                ))
            } else {
                CommandResponse::err(format!("AI service ({}) returned error {}: {}", full_url, status, err_body))
            }
        }
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

    #[test]
    fn test_copilot_model_info_deserialization() {
        let json_str = r#"{"data":[{"id":"gpt-4o","name":"GPT-4o"},{"id":"claude-3.5-sonnet","name":"Claude 3.5 Sonnet"}]}"#;
        let v: serde_json::Value = serde_json::from_str(json_str).unwrap();
        let arr = v.get("data").unwrap().as_array().unwrap();
        let models: Vec<CopilotModelInfo> = arr
            .iter()
            .map(|item| CopilotModelInfo {
                id: item.get("id").unwrap().as_str().unwrap().to_string(),
                name: item.get("name").unwrap().as_str().unwrap().to_string(),
            })
            .collect();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-4o");
        assert_eq!(models[1].name, "Claude 3.5 Sonnet");
    }

    #[test]
    fn test_create_http_client_default() {
        let client = create_http_client(None, None);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_http_client_with_proxy_and_ssl_bypass() {
        let client = create_http_client(Some("http://sp-surf-proxy.intranet.db.com:8080"), Some(true));
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_http_client_with_auth_proxy() {
        let client = create_http_client(
            Some("http://nitin-b.silra%40db.com:password123@sp-surf-proxy.intranet.db.com:8080"),
            Some(false),
        );
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_http_client_without_scheme_auto_prepends_http() {
        let client = create_http_client(Some("sp-surf-proxy.intranet.db.com:8080"), None);
        assert!(client.is_ok());
    }

    #[test]
    fn test_create_http_client_invalid_proxy_fails() {
        let client = create_http_client(Some("http://[invalid-url-with-bad-ipv6"), None);
        assert!(client.is_err());
    }
}

