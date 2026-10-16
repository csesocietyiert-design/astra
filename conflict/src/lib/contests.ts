export type ContestStatus = "Upcoming" | "Live" | "Ended";

export function getContestStatus(startsAt: string, durationMinutes: number, now = Date.now()) {
  const startTime = Date.parse(startsAt);
  if (!Number.isFinite(startTime)) throw new Error("Contest start time is invalid.");
  const endTime = startTime + durationMinutes * 60_000;
  const status: ContestStatus = endTime <= now
    ? "Ended"
    : startTime <= now
      ? "Live"
      : "Upcoming";

  return {
    endsAt: new Date(endTime).toISOString(),
    status,
    registrationOpen: status === "Upcoming",
  };
}
