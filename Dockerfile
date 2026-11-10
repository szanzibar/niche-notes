# Tags from https://hub.docker.com/r/hexpm/elixir/tags; keep Elixir and OTP in step with .tool-versions.
ARG ELIXIR_VERSION=1.19.5
ARG OTP_VERSION=28.3
ARG DEBIAN_VERSION=trixie-20260610-slim
ARG BUILDER_IMAGE="docker.io/hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-debian-${DEBIAN_VERSION}"
ARG RUNNER_IMAGE="docker.io/debian:${DEBIAN_VERSION}"

FROM docker.io/node:22-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
# vite.config.ts writes the build to ../server/priv/static
RUN npm run build

FROM ${BUILDER_IMAGE} AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
ENV MIX_ENV="prod"
COPY server/mix.exs server/mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config
COPY server/config/config.exs server/config/${MIX_ENV}.exs config/
RUN mix deps.compile
COPY server/priv priv
COPY server/lib lib
RUN mix compile
COPY --from=client /app/server/priv/static priv/static
COPY server/config/runtime.exs config/
COPY server/rel rel
RUN mix release

FROM ${RUNNER_IMAGE} AS final
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 locales ca-certificates sqlite3 \
  && rm -rf /var/lib/apt/lists/*
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
# The release writes its runtime config under RELEASE_TMP, so any uid can start it.
ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8 MIX_ENV="prod" RELEASE_TMP=/tmp
WORKDIR /app
RUN chown nobody /app && mkdir /data && chown nobody /data
COPY --from=builder --chown=nobody:root /app/_build/prod/rel/niche_notes ./
USER nobody
VOLUME /data
CMD ["sh", "-c", "/app/bin/migrate && /app/bin/server"]
