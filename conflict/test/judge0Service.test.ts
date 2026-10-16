import assert from "node:assert/strict";
import test from "node:test";
import { outputMatches } from "../src/services/judge0Service.js";

test("matches output with normalized line endings and one final newline", () => {
  assert.equal(outputMatches("answer\r\n", "answer"), true);
  assert.equal(outputMatches("answer", "answer\n"), true);
});

test("keeps leading whitespace and additional blank lines significant", () => {
  assert.equal(outputMatches(" answer", "answer"), false);
  assert.equal(outputMatches("answer\n\n", "answer"), false);
});

test("does not treat missing output as a match for empty expected output", () => {
  assert.equal(outputMatches(null, ""), false);
  assert.equal(outputMatches("", ""), true);
});
