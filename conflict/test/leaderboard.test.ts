import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaderboard } from "../src/lib/leaderboard.js";

test("ranks by unique accepted problems weighted by difficulty", () => {
  const submissions = [
    { account_type: "member", user_id: "m1", problem_slug: "easy", difficulty: "Easy" },
    { account_type: "member", user_id: "m1", problem_slug: "easy", difficulty: "Easy" },
    { account_type: "member", user_id: "m1", problem_slug: "hard", difficulty: "Hard" },
    { account_type: "outsider", user_id: "g1", problem_slug: "medium", difficulty: "Medium" },
  ] as const;
  const names = new Map([
    ["member:m1", "Alex Member"],
    ["outsider:g1", "Sam Guest"],
  ]);

  assert.deepEqual(buildLeaderboard([...submissions], names), [
    { rank: 1, name: "Alex Member", solved: 2, points: 40 },
    { rank: 2, name: "Sam Guest", solved: 1, points: 20 },
  ]);
});

test("ranks deterministically on equal scores and applies the requested limit", () => {
  const submissions = [
    { account_type: "member", user_id: "b", problem_slug: "a", difficulty: "Easy" },
    { account_type: "member", user_id: "a", problem_slug: "b", difficulty: "Easy" },
  ] as const;
  const names = new Map([
    ["member:a", "Alex"],
    ["member:b", "Blair"],
  ]);

  assert.deepEqual(buildLeaderboard([...submissions], names, 1), [
    { rank: 1, name: "Alex", solved: 1, points: 10 },
  ]);
});

test("separates accounts with the same ID across account types", () => {
  const submissions = [
    { account_type: "member", user_id: "same", problem_slug: "member-problem", difficulty: "Easy" },
    { account_type: "outsider", user_id: "same", problem_slug: "guest-problem", difficulty: "Medium" },
  ] as const;

  const entries = buildLeaderboard([...submissions], new Map());
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(({ solved, points }) => ({ solved, points })), [
    { solved: 1, points: 20 },
    { solved: 1, points: 10 },
  ]);
});
