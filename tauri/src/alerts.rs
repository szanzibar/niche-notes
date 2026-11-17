//! Alerts, which have to arrive while the window is closed. The window has no Web Push, so the app joins the
//! server's alerts channel as one more device and shows what arrives as notifications. It holds the socket
//! itself, because a hidden webview is suspended after a few minutes.
//!
//! The window's session cookie signs the socket in, so there is no second credential.

use crate::{show_window, ORIGIN};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::watch;
use tokio_tungstenite::tungstenite::Message;

/// The hidden window that reads the session while the app's window is closed.
pub const SESSION_WINDOW: &str = "session";

// The server ends a socket it hasn't heard from for a minute.
const HEARTBEAT: Duration = Duration::from_secs(30);
const RETRY: Duration = Duration::from_secs(30);

/// The session cookie, or none while nobody is signed in.
struct Session(watch::Sender<Option<String>>);

pub fn start(app: &AppHandle) {
    let (session, changed) = watch::channel(None);
    app.manage(Session(session));

    // A click on an alert opens the window on its line.
    let handle = app.clone();
    let _ = app.notification().on_action(move |action| {
        let link = action
            .notification()
            .and_then(|alert| alert.extra().get("link")?.as_str());
        if let Some(link) = link.and_then(|link| Url::parse(link).ok()) {
            show_window(&handle, Some(link));
        }
    });

    tauri::async_runtime::spawn(listen(app.clone(), changed));
    read_session(app);
}

/// Looks at who is signed in. Called at the start and whenever the window loads a page, since signing in and
/// out both load one.
pub fn read_session(app: &AppHandle) {
    let app = app.clone();
    // On its own thread, since reading cookies on the main one deadlocks on Windows.
    std::thread::spawn(move || {
        let main = app.get_webview_window("main");
        // Without the app's window, a hidden one reads the same cookies.
        let hidden = match main {
            Some(_) => None,
            None => WebviewWindowBuilder::new(
                &app,
                SESSION_WINDOW,
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .visible(false)
            .build()
            .ok(),
        };
        let Some(window) = main.or(hidden.clone()) else {
            return;
        };
        let cookies = window
            .cookies_for_url(Url::parse(ORIGIN).unwrap())
            .unwrap_or_default();
        if let Some(hidden) = hidden {
            let _ = hidden.destroy();
        }
        // `__Host-niche_notes`, or plain `niche_notes` from a dev server.
        let session = cookies
            .iter()
            .find(|cookie| cookie.name().ends_with("niche_notes"))
            .map(|cookie| format!("{}={}", cookie.name(), cookie.value()));
        app.state::<Session>()
            .0
            .send_if_modified(|current| std::mem::replace(current, session.clone()) != session);
    });
}

async fn listen(app: AppHandle, mut session: watch::Receiver<Option<String>>) {
    loop {
        let cookie = session.borrow_and_update().clone();
        tokio::select! {
            _ = session.changed() => {}
            _ = async {
                if let Some(cookie) = cookie {
                    while receive(&app, &cookie).await {
                        tokio::time::sleep(RETRY).await;
                    }
                }
                // Signed out, there is nothing to hear until the session changes.
                std::future::pending::<()>().await
            } => {}
        }
    }
}

/// Shows alerts until the socket drops, after a sleep or a lost network. False once the server no longer
/// knows the session.
async fn receive(app: &AppHandle, cookie: &str) -> bool {
    let Ok(response) = reqwest::Client::new()
        .get(format!("{ORIGIN}/api/me"))
        .header("cookie", cookie)
        .send()
        .await
    else {
        return true;
    };
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return false;
    }
    let Ok(me) = response.json::<Value>().await else {
        return true;
    };
    let (Some(token), Some(user)) = (me["token"].as_str(), me["user"]["id"].as_str()) else {
        return true;
    };

    let socket = format!(
        "{}/socket/websocket?vsn=2.0.0&token={token}",
        ORIGIN.replacen("http", "ws", 1)
    );
    let Ok((mut socket, _)) = tokio_tungstenite::connect_async(socket).await else {
        return true;
    };
    let time_zone = iana_time_zone::get_timezone().unwrap_or_default();
    let join = json!(["1", "1", format!("alerts:{user}"), "phx_join", { "time_zone": time_zone }]);
    if socket.send(Message::text(join.to_string())).await.is_err() {
        return true;
    }

    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    let mut heard = Instant::now();
    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                let beat = json!([null, "1", "phoenix", "heartbeat", {}]);
                // The server answers each heartbeat, so two unanswered ones mean the socket is dead.
                if heard.elapsed() > 2 * HEARTBEAT || socket.send(Message::text(beat.to_string())).await.is_err() {
                    return true;
                }
            }
            message = socket.next() => {
                let Some(Ok(message)) = message else {
                    return true;
                };
                heard = Instant::now();
                let frame: Value = message.to_text().ok().and_then(|text| serde_json::from_str(text).ok()).unwrap_or_default();
                if frame[3] == "alert" {
                    notify(app, &frame[4]);
                }
            }
        }
    }
}

// An alert the server sends again after its own restart shows twice, known and accepted.
fn notify(app: &AppHandle, alert: &Value) {
    let mut link = Url::parse(ORIGIN)
        .unwrap()
        .join(&format!(
            "/n/{}",
            alert["note"].as_str().unwrap_or_default()
        ))
        .unwrap();
    if let Some(line) = alert["text"].as_str() {
        link.query_pairs_mut().append_pair("line", line);
    }
    let _ = app
        .notification()
        .builder()
        .title(alert["title"].as_str().unwrap_or_default())
        .body(alert["body"].as_str().unwrap_or_default())
        .extra("link", link.as_str())
        .show();
}
