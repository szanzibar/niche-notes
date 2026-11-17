fn main() {
    // The server the app opens is baked in, like the APK's. Without one it is the dev server.
    println!("cargo:rerun-if-env-changed=PHX_HOST");
    let origin = match std::env::var("PHX_HOST") {
        Ok(host) => format!("https://{host}"),
        Err(_) => "http://localhost:5173".into(),
    };
    println!("cargo:rustc-env=ORIGIN={origin}");
    tauri_build::build()
}
