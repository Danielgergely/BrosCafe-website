#!/bin/sh
# Builds the React app, adds the new design at /d/ (preview only), and deploys to https://broscafe.gracelabs.dev.
# Production never gets the variants: it is deployed from a clean `yarn build` without this script.
set -e
cd "$(dirname "$0")/../.."
(cd frontend && CI=false yarn build)
# One source for the game simulation: the server replay must match it exactly.
cp frontend/src/features/game/runnerSim.js variants/d/jatek/runnerSim.js
for v in d; do [ -f "variants/$v/index.html" ] && rm -rf "frontend/build/$v" && cp -R "variants/$v" "frontend/build/$v"; done
rm -rf frontend/build/shared && cp -R variants/shared frontend/build/shared
cd worker && npx wrangler deploy --env preview
