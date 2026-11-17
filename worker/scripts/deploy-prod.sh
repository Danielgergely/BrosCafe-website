#!/bin/sh
# PRODUCTION (broscafe.hu). Do not run without Daniel's explicit OK.
set -e
cd "$(dirname "$0")/.."
npx wrangler deploy --env=""
