//! The desktop app: one window on the server's web app, and a tray icon that stays when the window closes.
//!
//! The page never calls this shell, so it stays the same web app in every browser. The shell acts on
//! navigation and links only.

// No console window beside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod alerts;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::Notify;

const ORIGIN: &str = env!("ORIGIN");

/// How the app starts at login, and again after it updated itself: in the tray, without a window.
const IN_TRAY: &str = "--tray";

static WINDOW_CLOSED: Notify = Notify::const_new();

fn page(path: &str) -> Url {
    Url::parse(ORIGIN).unwrap().join(path).unwrap()
}

/// Brings the window forward, on `url` when there is one. Closing the window ended its webview, so this
/// makes a new one when needed.
pub fn show_window(app: &AppHandle, url: Option<Url>) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window("main") {
        if let Some(url) = url {
            let _ = window.navigate(url);
        }
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let home = page("/").origin();
    let (browser, new_window_browser) = (app.clone(), app.clone());
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.unwrap_or(page("/"))))
        .title("Niche Notes")
        .inner_size(1100.0, 800.0)
        // Windows' webview has this interface with no push service behind it, and Settings offers alerts by it.
        .initialization_script("delete window.PushManager")
        // Another site opens in the default browser, where a passkey works.
        .on_navigation(move |to| {
            let ours = to.origin() == home || !to.scheme().starts_with("http");
            if !ours {
                let _ = browser.opener().open_url(to.as_str(), None::<&str>);
            }
            ours
        })
        .on_new_window(move |to, _| {
            let _ = new_window_browser
                .opener()
                .open_url(to.as_str(), None::<&str>);
            NewWindowResponse::Deny
        })
        // Signing in and out both load a page.
        .on_page_load(|window, loaded| {
            if loaded.event() == PageLoadEvent::Finished {
                alerts::read_session(window.app_handle());
            }
        })
        .build();
}

/// Installs a newer release while no window is open, so the app never restarts under someone typing: when it
/// starts in the tray, when the window closes, and once a day.
async fn update(app: AppHandle) {
    loop {
        if app.get_webview_window("main").is_none() {
            let _ = install_update(&app).await;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(24 * 60 * 60)) => {}
            _ = WINDOW_CLOSED.notified() => {}
        }
    }
}

async fn install_update(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    // On Windows the installer starts the new app, and passes it what follows its own arguments.
    let updater = app.updater_builder().installer_arg(IN_TRAY).build()?;
    let Some(update) = updater.check().await? else {
        return Ok(());
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }
    update.install(bytes)?;

    let mut env = app.env();
    env.args_os.truncate(1);
    env.args_os.push(IN_TRAY.into());
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let _ = app.save_window_state(StateFlags::all());
        // The new app would otherwise find this one still running and leave.
        tauri_plugin_single_instance::destroy(&app);
        app.cleanup_before_exit();
        tauri::process::restart(&env)
    });
    Ok(())
}

// Only a Mac has a Dock to leave and an icon there to open the app again.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
fn main() {
    tauri::Builder::default()
        // A second launch brings the window forward, and on Windows carries a `nichenotes://` link here.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app, None)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().arg(IN_TRAY).build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&[alerts::SESSION_WINDOW])
                .build(),
        )
        .setup(|app| {
            // Pocket ID's or Google's answer to a login the window started, handed on by the browser that got it.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for link in event.urls() {
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

            #[cfg(target_os = "macos")]
            let icon = tauri::include_image!("icons/tray.png");
            #[cfg(not(target_os = "macos"))]
            let icon = app.default_window_icon().unwrap().clone();
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Niche Notes")
                .menu(&Menu::with_items(app, &[&quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, _| app.exit(0))
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_window(tray.app_handle(), None);
                    }
                })
                .build(app)?;

            alerts::start(app.handle());

            // A dev build would start at login too, and replace itself with the release.
            if !cfg!(debug_assertions) {
                let _ = app.autolaunch().enable();
                tauri::async_runtime::spawn(update(app.handle().clone()));
            }

            if std::env::args().any(|arg| arg == IN_TRAY) {
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            } else {
                show_window(app.handle(), None);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap()
        .run(|app, event| match event {
            // Closing the last window leaves the tray, and on a Mac no icon in the Dock.
            RunEvent::ExitRequested {
                api, code: None, ..
            } => {
                api.prevent_exit();
                #[cfg(target_os = "macos")]
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Destroyed,
                ..
            } if label == "main" => {
                WINDOW_CLOSED.notify_one();
            }
            // Opening the app again while it sits in the tray.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_window(app, None),
            _ => {}
        });
}
