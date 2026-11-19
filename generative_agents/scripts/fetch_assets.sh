#!/bin/bash
# Downloads the original map and character art (by PixyMoon and LimeZu, see
# NOTICE.md) from the upstream repository at the exact commit this fork is
# based on. The art is not redistributed in this repository; it is only needed
# for the browser viewer, not for the headless simulation.
set -euo pipefail
UPSTREAM=https://github.com/joonspk-research/generative_agents.git
COMMIT=fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/environment/frontend_server/static_dirs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$TMP" init -q
git -C "$TMP" remote add origin "$UPSTREAM"
git -C "$TMP" sparse-checkout set --no-cone \
  /environment/frontend_server/static_dirs/assets/the_ville/visuals \
  /environment/frontend_server/static_dirs/assets/characters \
  /environment/frontend_server/static_dirs/assets/speech_bubble \
  /environment/frontend_server/static_dirs/img
git -C "$TMP" fetch -q --depth 1 --filter=blob:none origin "$COMMIT"
git -C "$TMP" checkout -q FETCH_HEAD

SRC="$TMP/environment/frontend_server/static_dirs"
mkdir -p "$DEST/assets/the_ville"
cp -R "$SRC/assets/the_ville/visuals" "$DEST/assets/the_ville/"
cp -R "$SRC/assets/characters" "$SRC/assets/speech_bubble" "$DEST/assets/"
cp -R "$SRC/img" "$DEST/"
echo "Assets copied into $DEST"
