#!/usr/bin/env bash
# publish.sh — render the local database into a /blog static site and push it
# to GitHub Pages via the gh-pages branch.
#
# This is a compatibility wrapper for the current source-only master workflow:
# dist/ is ignored on master and never committed.
#
# Workflow:
#   1. Write posts / edit data in the LOCAL admin (`./blogbin serve` -> /admin).
#      blog.db stays on your machine (all your content; never committed).
#   2. Run this script: render -> temporary static site -> push gh-pages.
#   3. GitHub Pages deploys gh-pages /(root), usually within ~1 minute.
#
# Usage:
#   ./scripts/publish.sh                 # export + push gh-pages
#   ./scripts/publish.sh "post: hello"   # custom commit message
#   DB_PATH=/path/to/blog.db ./scripts/publish.sh
set -euo pipefail

cd "$(dirname "$0")/.."

exec env PUBLISH_GITEE="${PUBLISH_GITEE:-0}" ./scripts/publish-all.sh "$@"
