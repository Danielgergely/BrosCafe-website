#!/bin/sh
# Deploys the static site (site/) and the Worker to https://broscafe.gracelabs.dev.
set -e
cd "$(dirname "$0")/../.."
# One source for the game simulation: the server replay must match it exactly.
cp frontend/src/features/game/runnerSim.js site/jatek/runnerSim.js
cd worker && npx wrangler deploy --env preview
