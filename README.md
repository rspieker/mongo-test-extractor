# mongo-test-extractor

Extracts structured test cases from MongoDB's official [jstests](https://github.com/mongodb/mongo/tree/master/jstests) suite by intercepting every `db.*` and `assert.*` call as the tests run, then reconstructing them into concrete input/output pairs.

## How it works

MongoDB's jstests are plain JavaScript files. They set up documents, run queries, and assert results — all through a `db` global and an `assert` global. That's the seam this tool exploits.

**Step 1 — collect:** each jstest is executed inside a Node.js `vm` sandbox. ES6 imports are stripped so the files run without their test harness. The `db` and `assert` globals are replaced with transparent recording proxies powered by [flugrekorder](https://github.com/rspieker/flugrekorder), which intercepts every property access and function call and logs it — without needing a real MongoDB instance, without mocking any return values, without caring what the test is actually testing.

The result is a faithful trace of everything the test did: which collections it wrote to, with what documents, which queries it ran, and which assertions it made.

**Step 2 — interpret:** the raw trace is walked to reconstruct a timeline per test file. A path map resolves proxy IDs back to their dotted call paths (`db.jstests_all.find`). Each call is classified as a write (building up collection state), a query (the thing we want to capture), or an assertion (the expected outcome). Proxy ID chains link assertion arguments back to the query result they reference.

The output for each query is: the collection state at that moment, the query itself, and the assertion the test author expected to hold — a complete, self-contained test case derived entirely from MongoDB's own test suite.

The output is a newline-delimited JSON file where each line is a self-contained test case:

```json
{
  "source": "jstests/core/query/all/all.js",
  "collection": "jstests_all",
  "method": "find",
  "filter": [{ "a": { "$all": [1] } }],
  "context": [{ "a": [1, 2, 3] }, { "a": [1, 2, 4] }],
  "assertion": { "method": "eq", "expected": 2 }
}
```

## Usage

```bash
# clone MongoDB jstests (sparse, no history)
git clone --filter=blob:none --sparse --depth=1 \
  https://github.com/mongodb/mongo.git mongo
git -C mongo sparse-checkout set jstests/core/query

# extract
npm install
npm run collect -- mongo/jstests/core/query --output=results.ndjson
npm run interpret -- results.ndjson test-cases.ndjson
```

Or just run `./run.sh` which does all of the above.

## Automation

A [GitHub Actions workflow](.github/workflows/extract.yml) runs monthly, sparse-clones the latest MongoDB jstests, runs the full pipeline, and publishes `test-cases.ndjson` as a GitHub Release.

## flugrekorder

This project exists because of [flugrekorder](https://github.com/rspieker/flugrekorder) — a transparent recording proxy for any JavaScript object. The idea of intercepting MongoDB's test suite without a real database was the original motivation for building it. If you need to record, replay, or observe interactions with any JS object or API, it's worth a look.
