import assert from "node:assert/strict";
import test from "node:test";
import { activityDateFor, calculateStreak } from "../src/lib/streak.js";

test("counts an accepted activity as one active day regardless of duplicate rows", () => {
  const streak = calculateStreak(
    ["2026-10-16", "2026-10-16", "2026-10-15"],
    "2026-10-16",
  );

  assert.equal(streak.current_streak, 2);
  assert.equal(streak.max_streak, 2);
  assert.equal(streak.total_active_days, 2);
});

test("continues a streak when yesterday was active and today is not yet active", () => {
  const streak = calculateStreak(
    ["2026-10-15", "2026-10-14"],
    "2026-10-16",
  );

  assert.equal(streak.current_streak, 2);
});

test("resets current streak after a missed day and keeps best streak", () => {
  const streak = calculateStreak(
    ["2026-10-16", "2026-10-14", "2026-10-13"],
    "2026-10-16",
  );

  assert.equal(streak.current_streak, 1);
  assert.equal(streak.max_streak, 2);
});

test("does not continue a streak after two inactive calendar days", () => {
  const streak = calculateStreak(
    ["2026-10-14", "2026-10-13"],
    "2026-10-16",
  );

  assert.equal(streak.current_streak, 0);
  assert.equal(streak.max_streak, 2);
});

test("assigns activity dates using the Asia/Kolkata calendar day", () => {
  assert.equal(activityDateFor(new Date("2026-10-15T18:29:59.000Z")), "2026-10-15");
  assert.equal(activityDateFor(new Date("2026-10-15T18:30:00.000Z")), "2026-10-16");
});
