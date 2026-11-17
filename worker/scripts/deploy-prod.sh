#!/bin/sh
# PRODUCTION (broscafe.hu). Do not run without Daniel's explicit OK.
set -e
cd "$(dirname "$0")/../.."
# One source for the game simulation: the server replay must match it exactly.
cp frontend/src/features/game/runnerSim.js site/jatek/runnerSim.js
cd worker && npx wrangler deploy --env=""
