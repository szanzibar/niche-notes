fn main() {
    // The server the app opens is baked in, like the APK's. Without one it is the dev server, and the app tests
    // name their own.
    println!("cargo:rerun-if-env-changed=PHX_HOST");
    println!("cargo:rerun-if-env-changed=ORIGIN");
    let origin = match (std::env::var("ORIGIN"), std::env::var("PHX_HOST")) {
        (Ok(origin), _) => origin,
        (_, Ok(host)) => format!("https://{host}"),
        _ => "http://localhost:5173".into(),
    };
    println!("cargo:rustc-env=ORIGIN={origin}");
    tauri_build::build()
}
