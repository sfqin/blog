#!/usr/bin/env bash
# publish.sh — render the local database into a static site and push it so
# Cloudflare Pages auto-deploys.
#
# Workflow:
#   1. You write posts / edit data in the LOCAL admin (`./blogbin serve` -> /admin).
#      That updates blog.db, which stays on your machine (it holds your admin
#      password hash and is never committed).
#   2. Run this script. It renders the current data to ./dist, commits it, and
#      pushes to your GitHub remote.
#   3. Cloudflare Pages (connected to the repo, output dir = "dist") deploys the
#      new ./dist automatically — usually live within ~1 minute.
#
# Usage:
#   ./scripts/publish.sh                 # export + commit + push
#   ./scripts/publish.sh "post: hello"   # same, with a custom commit message
#   DB_PATH=/path/to/blog.db ./scripts/publish.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DB_PATH="${DB_PATH:-blog.db}"
OUT_DIR="dist"
MSG="${1:-publish: $(date '+%Y-%m-%d %H:%M:%S')}"

if [ ! -f "$DB_PATH" ]; then
	echo "!! database not found at '$DB_PATH'." >&2
	echo "   Run the admin first:  ADMIN_PASSWORD=... ./blogbin serve   (then edit at /admin)" >&2
	exit 1
fi

echo ">> building binary"
go build -o ./blogbin .

echo ">> exporting static site (db=$DB_PATH -> $OUT_DIR/)"
DB_PATH="$DB_PATH" ./blogbin export "$OUT_DIR"

echo ">> committing $OUT_DIR"
git add -A "$OUT_DIR"
if git diff --cached --quiet; then
	echo "   no changes to publish (dist unchanged). Nothing to do."
	exit 0
fi
git commit -q -m "$MSG"

# Push only if a remote is configured; otherwise tell the user how to add one.
if git remote | grep -q .; then
	branch="$(git rev-parse --abbrev-ref HEAD)"
	echo ">> pushing to $(git remote | head -n1)/$branch"
	git push
	echo ">> done. Cloudflare Pages will deploy ./dist shortly."
else
	echo "!! no git remote configured. Add your GitHub repo once, e.g.:" >&2
	echo "   git remote add origin git@github.com:<you>/<repo>.git" >&2
	echo "   git push -u origin \$(git rev-parse --abbrev-ref HEAD)" >&2
	echo "   Committed locally; push when the remote is set." >&2
	exit 1
fi
