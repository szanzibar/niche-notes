//! The app: one window on the server's web app. On a desktop a tray icon stays when the window closes.
//!
//! The page never calls this shell, so it stays the same web app in every browser. The shell acts on
//! navigation and links only.

#[cfg(desktop)]
mod alerts;
#[cfg(desktop)]
mod desktop;

use std::sync::Mutex;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const ORIGIN: &str = env!("ORIGIN");

fn page(path: &str) -> Url {
    Url::parse(ORIGIN).unwrap().join(path).unwrap()
}

/// Brings the window forward, on `url` when there is one. Closing the window ended its webview, so this
/// makes a new one when needed.
pub fn show_window(app: &AppHandle, url: Option<Url>) {
    // Building the window inside the single-instance callback hangs on Windows, so this runs on its own
    // thread. A link launch calls it twice, so one at a time.
    static ONE: Mutex<()> = Mutex::new(());
    let app = app.clone();
    std::thread::spawn(move || {
        let _one = ONE.lock().unwrap();
        let app = &app;
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

        if let Some(window) = app.get_webview_window("main") {
            if let Some(url) = url {
                let _ = window.navigate(url);
            }
            #[cfg(desktop)]
            {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            return;
        }

        let home = page("/").origin();
        let (browser, new_window_browser) = (app.clone(), app.clone());
        let window =
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.unwrap_or(page("/"))))
                // Windows' webview has this interface with no push service behind it, and Settings offers alerts by it.
                .initialization_script("delete window.PushManager")
                // Another site opens in the default browser, where a passkey works, and another app's link in that app.
                .on_navigation(move |to| {
                    let ours = to.origin() == home || to.scheme() == "about";
                    if !ours {
                        // Off this thread, which on Android is the one the opener waits for.
                        let (browser, to) = (browser.clone(), to.to_string());
                        std::thread::spawn(move || browser.opener().open_url(to, None::<&str>));
                    }
                    ours
                })
                .on_new_window(move |to, _| {
                    let _ = new_window_browser
                        .opener()
                        .open_url(to.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                });
        #[cfg(desktop)]
        let window = desktop::window(app, window);
        let _ = window.build();
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // First, so a second launch hands over and ends before anything else starts.
    #[cfg(desktop)]
    let builder = desktop::plugins(builder);
    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for link in event.urls() {
                    // A page of ours, which a widget opens on Android.
                    if link.origin() == page("/").origin() {
                        show_window(&handle, Some(link));
                        continue;
                    }
                    // Pocket ID's or Google's answer to a login the window started, handed on by the browser
                    // that got it.
                    let callback =
                        format!("{}{}", link.host_str().unwrap_or_default(), link.path());
                    if ["callback", "google/callback"].contains(&callback.as_str()) {
                        let query = link.query().unwrap_or_default();
                        show_window(
                            &handle,
                            Some(page(&format!("/auth/{callback}?{query}&app=1"))),
                        );
                    }
                }
            });

            #[cfg(desktop)]
            desktop::setup(app)?;
            #[cfg(mobile)]
            show_window(app.handle(), None);
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap();
    #[cfg(desktop)]
    app.run(desktop::on_event);
    #[cfg(mobile)]
    app.run(|_, _| {});
}
