# The desktop app on Linux with WebKit's WebDriver, for the app tests in client/e2e-app.
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl dbus libayatana-appindicator3-dev libssl-dev libwebkit2gtk-4.1-dev \
    librsvg2-dev libxdo-dev pkg-config webkit2gtk-driver xvfb \
  && rm -rf /var/lib/apt/lists/*
ENV PATH=/root/.cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.95.0
RUN cargo install tauri-driver --locked
# The app hands other sites to xdg-open, so the tests read here what it handed over.
RUN printf '#!/bin/sh\necho "$1" >> /tmp/opened\n' > /usr/local/bin/xdg-open && chmod +x /usr/local/bin/xdg-open \
  && touch /tmp/opened
# A Downloads folder as on a desktop, where the app saves what the page downloads.
RUN mkdir -p /root/Downloads /root/.config && echo 'XDG_DOWNLOAD_DIR="$HOME/Downloads"' > /root/.config/user-dirs.dirs
