import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "./check-aws-calls.mjs";

const flagged = (text) => check(text).length > 0;

test("flags the two phase F teardown bugs", () => {
  assert.ok(flagged(`if aws s3api head-object --bucket "$B" --key "$K" >/dev/null 2>&1; then`));
  assert.ok(
    flagged(`done < <(aws s3api list-objects-v2 --bucket b --prefix "p" \\
  --query 'Contents[].Key' --output json | jq -r '.[]?')`),
  );
});

test("flags a call used as a condition, swallowed, or hidden in $( )", () => {
  assert.ok(flagged("if ! aws s3 ls s3://b; then"));
  assert.ok(flagged("          if aws s3 ls s3://b >/dev/null 2>&1; then"));
  assert.ok(flagged("while aws sts get-caller-identity; do"));
  assert.ok(flagged("aws s3 rm s3://b/k || true"));
  assert.ok(flagged('echo "count=$(aws s3 ls s3://b | wc -l)"'));
});

test("passes the patterns that fail on a refusal", () => {
  assert.ok(!flagged("if ! keys=$(aws s3api list-objects-v2 --bucket b --prefix p); then"));
  assert.ok(!flagged("id=$(aws cloudfront list-distributions --output text)"));
  assert.ok(!flagged('aws s3 sync dist/web "s3://$B" --delete'));
  assert.ok(!flagged("# if aws s3api head-object, refusals read as missing"));
});

test("a reason comment on the line or the one above allows a call", () => {
  assert.ok(!flagged("aws s3 rm s3://b/k || true # aws-refusal-ok: best effort, the retry checks"));
  assert.ok(
    !flagged("# aws-refusal-ok: best effort, the retry checks\naws s3 rm s3://b/k || true"),
  );
});
