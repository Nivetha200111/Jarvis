#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WIKI_SRC_DIR="$REPO_ROOT/wiki"
WIKI_REMOTE="${WIKI_REMOTE:-https://github.com/Nivetha200111/Jarvis.wiki.git}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -d "$WIKI_SRC_DIR" ]]; then
  echo "Wiki source directory not found: $WIKI_SRC_DIR" >&2
  exit 1
fi

echo "Cloning wiki remote: $WIKI_REMOTE"
if ! git clone "$WIKI_REMOTE" "$TMP_DIR"; then
  echo "Failed to clone wiki remote." >&2
  echo "Enable GitHub Wiki in repository settings first." >&2
  exit 1
fi

cp "$WIKI_SRC_DIR"/*.md "$TMP_DIR"/

cd "$TMP_DIR"
git add .

if git diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

COMMIT_MSG="${1:-docs: sync wiki pages}"
git commit -m "$COMMIT_MSG"
git push
echo "Wiki published successfully."
