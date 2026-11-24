//! The app: one window on the server's web app. On a desktop a tray icon stays when the window closes.
//!
//! The page never calls this shell, so it stays the same web app in every browser. The shell acts on
//! navigation and links only, and tells the page its version.

#[cfg(desktop)]
mod alerts;
#[cfg(desktop)]
mod desktop;

use std::sync::Mutex;
use tauri::webview::NewWindowResponse;
#[cfg(mobile)]
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const ORIGIN: &str = env!("ORIGIN");

/// Whether the window's first page has started loading, and the link waiting for it. Android starts that page only
/// once the window is on screen, after it has handed over the link the app was opened with, so that link waits.
#[cfg(mobile)]
static FIRST_PAGE: Mutex<(bool, Option<Url>)> = Mutex::new((false, None));

/// In place of the page on screen, so Back goes from the link's note to the list and then leaves, as after a tap.
#[cfg(mobile)]
fn replace_page(window: &tauri::WebviewWindow, url: Url) {
    let url = serde_json::to_string(url.as_str()).unwrap();
    let _ = window.eval(format!("location.replace({url})"));
}

fn page(path: &str) -> Url {
    Url::parse(ORIGIN).unwrap().join(path).unwrap()
}

/// Brings the window forward, on `url` when there is one. Closing the window ended its webview, so this
/// makes a new one when needed.
pub fn show_window(app: &AppHandle, url: Option<Url>) {
    // On the caller's thread, which on Android is the one that starts the first page, so the two can't cross.
    #[cfg(mobile)]
    if let (Some(url), (false, waiting)) = (&url, &mut *FIRST_PAGE.lock().unwrap()) {
        *waiting = Some(url.clone());
        return;
    }

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
                #[cfg(mobile)]
                replace_page(&window, url);
                #[cfg(desktop)]
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
                // The app's build, numbered by commit count, which Settings shows so an update is easy to spot.
                .initialization_script(format!(
                    "window.nicheNotesApp = {{ version: {} }}",
                    app.package_info().version.major
                ))
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
        #[cfg(mobile)]
        let window = window.on_page_load(|window, loaded| {
            if loaded.event() == PageLoadEvent::Started {
                if let (started @ false, waiting) = &mut *FIRST_PAGE.lock().unwrap() {
                    *started = true;
                    if let Some(url) = waiting.take() {
                        replace_page(&window, url);
                    }
                }
            }
        });
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
        // Without its click script, which has the page call the shell and so swallows every new-tab link.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            // An AppImage has no installed launcher entry to claim `nichenotes://` links, so it claims them at each start.
            #[cfg(target_os = "linux")]
            app.deep_link().register_all()?;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for link in event.urls() {
                    // A page of ours, which a widget opens on Android.
                    if link.origin() == page("/").origin() {
                        show_window(&handle, Some(link));
                        continue;
                    }
                    // Pocket ID's or Google's answer to a login the window started, handed on by the browser
                    // that got it. Windows hands `nichenotes://callback?…` over as `nichenotes://callback/?…`.
                    let path = link.path().trim_end_matches('/');
                    let callback = format!("{}{path}", link.host_str().unwrap_or_default());
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
