# Checkout MongoDB jstests
git clone --filter=blob:none --sparse https://github.com/mongodb/mongo.git
cd mongo
git sparse-checkout set jstests/core

# Run extraction
cd ..
npx tsx src/collect.ts mongo/jstests/core/query --output=results.ndjson --verbose
