import assert from "node:assert/strict";
import test from "node:test";
import { getContestStatus } from "../src/lib/contests.js";

const start = "2026-10-18T03:30:00.000Z";

test("contest registration stays open before its scheduled start", () => {
  assert.deepEqual(getContestStatus(start, 90, Date.parse("2026-10-17T03:30:00.000Z")), {
    endsAt: "2026-10-18T05:00:00.000Z",
    status: "Upcoming",
    registrationOpen: true,
  });
});

test("contest is live during its scheduled duration and closed afterward", () => {
  assert.equal(getContestStatus(start, 90, Date.parse("2026-10-18T04:00:00.000Z")).status, "Live");
  assert.equal(getContestStatus(start, 90, Date.parse("2026-10-18T05:00:00.000Z")).status, "Ended");
});

test("rejects invalid contest start timestamps", () => {
  assert.throws(() => getContestStatus("not-a-time", 90), /start time is invalid/);
});
