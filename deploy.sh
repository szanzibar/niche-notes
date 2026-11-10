#!/bin/sh
# Ships the committed tree to the home server and rebuilds the container there.
set -eu
git push the server HEAD:main
ssh example.com 'cd nichenotes && docker compose up -d --build'
