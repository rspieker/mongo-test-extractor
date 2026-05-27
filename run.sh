#!/usr/bin/env bash
set -e

# Checkout MongoDB jstests (skip if already cloned)
if [ ! -d mongo ]; then
  git clone --filter=blob:none --sparse --depth=1 \
    https://github.com/mongodb/mongo.git mongo
  git -C mongo sparse-checkout set jstests/core/query
fi

npx tsx src/collect.ts mongo/jstests/core/query --output=results.ndjson --verbose
npx tsx src/interpret.ts results.ndjson test-cases.ndjson
