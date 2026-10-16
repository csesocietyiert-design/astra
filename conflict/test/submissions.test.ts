import assert from "node:assert/strict";
import test from "node:test";
import { buildSubmissionTiming, summarizeAttemptHistory } from "../src/lib/submissions.js";

const attempts = [
  {
    problem_slug: "array-sum",
    problem_title: "Array Sum",
    difficulty: "Easy" as const,
    problem_tags: ["arrays", "math"],
    verdict: "Wrong Answer",
  },
  {
    problem_slug: "array-sum",
    problem_title: "Array Sum",
    difficulty: "Easy" as const,
    problem_tags: ["arrays", "math"],
    verdict: "Accepted",
  },
  {
    problem_slug: "graph-path",
    problem_title: "Graph Path",
    difficulty: "Hard" as const,
    problem_tags: ["graphs", "search"],
    verdict: "Runtime Error",
  },
];

test("summarizes attempts by unique question and verdict", () => {
  const summary = summarizeAttemptHistory(attempts);

  assert.equal(summary.total_attempts, 3);
  assert.equal(summary.attempted_questions, 2);
  assert.equal(summary.total_solved, 1);
  assert.equal(summary.question_success_rate, 50);
  assert.deepEqual(summary.verdict_counts, {
    "Wrong Answer": 1,
    Accepted: 1,
    "Runtime Error": 1,
  });
  assert.deepEqual(summary.difficulty_attempted, { Easy: 1, Medium: 0, Hard: 1 });
  assert.deepEqual(summary.difficulty_solved, { Easy: 1, Medium: 0, Hard: 0 });
  assert.deepEqual(summary.focus_areas, [
    { tag: "graphs", questions: 1 },
    { tag: "search", questions: 1 },
  ]);
});

test("returns zero-safe performance metrics with no submissions", () => {
  const summary = summarizeAttemptHistory([]);

  assert.equal(summary.total_attempts, 0);
  assert.equal(summary.attempted_questions, 0);
  assert.equal(summary.question_success_rate, 0);
  assert.deepEqual(summary.focus_areas, []);
});

test("records session start, server end, and elapsed whole seconds", () => {
  const timing = buildSubmissionTiming(
    "2026-10-16T08:00:00.000Z",
    new Date("2026-10-16T08:05:12.900Z"),
  );

  assert.deepEqual(timing, {
    session_started_at: "2026-10-16T08:00:00.000Z",
    session_ended_at: "2026-10-16T08:05:12.900Z",
    time_taken_seconds: 312,
  });
});

test("rejects future or excessively old session start values", () => {
  const end = new Date("2026-10-16T08:00:00.000Z");
  assert.equal(buildSubmissionTiming("2026-10-16T08:00:01.000Z", end), null);
  assert.equal(buildSubmissionTiming("2026-09-01T08:00:00.000Z", end), null);
});
