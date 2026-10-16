import type { SessionClaims } from "./session.js";
import { getSupabaseAdmin } from "./supabase.js";
import { isMissingStorageError, RequiredStorageError } from "./storage-errors.js";

const activityTimeZone = "Asia/Kolkata";
const dayMilliseconds = 24 * 60 * 60 * 1000;

export function activityDateFor(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: activityTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Could not determine the activity date.");
  return `${year}-${month}-${day}`;
}

function dateNumber(date: string): number {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value)) throw new Error("The activity table contains an invalid date.");
  return value / dayMilliseconds;
}

export function calculateStreak(activityDates: string[], today: string) {
  const uniqueDates = [...new Set(activityDates)].sort((left, right) => dateNumber(right) - dateNumber(left));
  const todayNumber = dateNumber(today);
  let currentStreak = 0;
  let maxStreak = 0;
  let runLength = 0;
  let previousDateNumber: number | null = null;

  for (const date of uniqueDates) {
    const currentDateNumber = dateNumber(date);
    runLength = previousDateNumber !== null && previousDateNumber - currentDateNumber === 1
      ? runLength + 1
      : 1;
    maxStreak = Math.max(maxStreak, runLength);
    previousDateNumber = currentDateNumber;
  }

  const latest = uniqueDates[0] ?? null;
  if (latest && todayNumber - dateNumber(latest) >= 0 && todayNumber - dateNumber(latest) <= 1) {
    let expectedDateNumber = dateNumber(latest);
    for (const date of uniqueDates) {
      const currentDateNumber = dateNumber(date);
      if (currentDateNumber !== expectedDateNumber) break;
      currentStreak += 1;
      expectedDateNumber -= 1;
    }
  }

  const yearAgo = todayNumber - 364;
  return {
    current_streak: currentStreak,
    max_streak: maxStreak,
    total_active_days: uniqueDates.length,
    last_activity_date: latest,
    today,
    activity_dates: uniqueDates.filter((date) => dateNumber(date) >= yearAgo),
  };
}

export async function getCurrentStreak(session: SessionClaims, today = activityDateFor()) {
  const pageSize = 500;
  let offset = 0;
  const allDates: string[] = [];

  while (true) {
    const { data, error } = await getSupabaseAdmin()
      .from("astra_streak_activity")
      .select("activity_date")
      .eq("account_type", session.accountType)
      .eq("user_id", session.userId)
      .order("activity_date", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (isMissingStorageError(error, "astra_streak_activity")) {
        throw new RequiredStorageError("Activity");
      }
      throw error;
    }

    const dates = (data ?? []).map((row) => String(row.activity_date));
    allDates.push(...dates);
    if (dates.length < pageSize) break;
    offset += pageSize;
  }

  return calculateStreak(allDates, today);
}
