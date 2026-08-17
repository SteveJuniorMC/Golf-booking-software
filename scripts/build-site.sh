#!/usr/bin/env bash
#
# Stage exactly the files a visitor needs into _site/, which is what
# wrangler.jsonc points at. Copying an explicit list rather than filtering the
# repo root means the git history, the workflows, and the README can never be
# published by accident.

set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf _site
mkdir _site

cp index.html book.html teesheet.html _site/
cp -R assets _site/

echo "Staged for deploy:"
find _site -type f | sort
