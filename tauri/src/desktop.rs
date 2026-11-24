//! A desktop app sits in the tray when its window closes, so alerts still arrive, and updates itself
//! while no window is open.

use crate::{alerts, show_window};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{App, AppHandle, Builder, Manager, RunEvent, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::Notify;

/// How the app starts at login, and again after it updated itself: in the tray, without a window.
const IN_TRAY: &str = "--tray";

static WINDOW_CLOSED: Notify = Notify::const_new();

pub fn plugins(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        // A second launch brings the window forward, and on Windows carries a `nichenotes://` link here.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app, None)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().arg(IN_TRAY).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&[alerts::SESSION_WINDOW])
                .build(),
        )
}

pub fn window<'a>(
    app: &AppHandle,
    window: WebviewWindowBuilder<'a, Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
    window
        .title(&app.package_info().name)
        .inner_size(1100.0, 800.0)
        // The window would take every drag as a file drop, and the page never sees a line it drags.
        .disable_drag_drop_handler()
        // Signing in and out both load a page.
        .on_page_load(|window, loaded| {
            if loaded.event() == PageLoadEvent::Finished {
                alerts::read_session(window.app_handle());
            }
        })
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    let icon = tauri::include_image!("icons/tray.png");
    #[cfg(not(target_os = "macos"))]
    let icon = app.default_window_icon().unwrap().clone();
    // Linux never reports a click on the icon, so its menu opens the window.
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip(&app.package_info().name)
        .menu(&Menu::with_items(app, &[&open, &quit])?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app, None),
            _ => app.exit(0),
        })
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
        // pacman updates the Linux app.
        if !cfg!(target_os = "linux") {
            tauri::async_runtime::spawn(update(app.handle().clone()));
        }
    }

    if std::env::args().any(|arg| arg == IN_TRAY) {
        #[cfg(target_os = "macos")]
        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    } else {
        show_window(app.handle(), None);
    }
    Ok(())
}

// Only a Mac has a Dock to leave and an icon there to open the app again.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
pub fn on_event(app: &AppHandle, event: RunEvent) {
    match event {
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
    }
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
