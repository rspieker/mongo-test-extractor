# mongo-test-extractor

Extracts structured test cases from MongoDB's official [jstests](https://github.com/mongodb/mongo/tree/master/jstests) suite by intercepting every `db.*` and `assert.*` call as the tests run, then reconstructing them into concrete input/output pairs.

## How it works

**Step 1 — collect:** each jstest is executed inside a Node.js `vm` sandbox with `db` and `assert` replaced by recording proxies powered by [flugrekorder](https://github.com/rspieker/flugrekorder). Every property access and function call is captured without needing a real MongoDB instance.

**Step 2 — interpret:** the raw recording is walked to reconstruct a timeline — collection state at each point, the query that ran against it, and the assertion the test author expected to hold.

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
