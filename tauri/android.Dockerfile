# The Android toolchain for the Tauri app, so nothing Android gets installed on the machine.
FROM --platform=linux/amd64 ghcr.io/cirruslabs/android-sdk:36
RUN yes | sdkmanager "ndk;30.0.16248370" "platforms;android-37.0" "build-tools;37.0.0" >/dev/null
ENV NDK_HOME=/opt/android-sdk-linux/ndk/30.0.16248370 PATH=/root/.cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.95.0 --target aarch64-linux-android
RUN curl -sSfL https://github.com/tauri-apps/tauri/releases/download/tauri-cli-v2.12.5/cargo-tauri-x86_64-unknown-linux-gnu.tgz \
  | tar xz -C /root/.cargo/bin
