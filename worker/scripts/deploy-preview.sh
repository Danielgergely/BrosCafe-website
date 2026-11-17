#!/bin/sh
# Deploys the static site (site/) and the Worker to https://broscafe.gracelabs.dev.
set -e
cd "$(dirname "$0")/.."
npx wrangler deploy --env preview
