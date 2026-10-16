export type LeaderboardSubmission = {
  account_type: "member" | "outsider";
  user_id: string;
  problem_slug: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  solved: number;
  points: number;
};

export const leaderboardLimit = 100;

const difficultyPoints: Record<LeaderboardSubmission["difficulty"], number> = {
  Easy: 10,
  Medium: 20,
  Hard: 30,
};

export function buildLeaderboard(
  submissions: LeaderboardSubmission[],
  displayNames: Map<string, string>,
  limit = leaderboardLimit,
): LeaderboardEntry[] {
  const scores = new Map<string, {
    accountType: LeaderboardSubmission["account_type"];
    userId: string;
    problems: Map<string, number>;
  }>();

  for (const submission of submissions) {
    const key = `${submission.account_type}:${submission.user_id}`;
    let score = scores.get(key);
    if (!score) {
      score = {
        accountType: submission.account_type,
        userId: submission.user_id,
        problems: new Map(),
      };
      scores.set(key, score);
    }
    score.problems.set(submission.problem_slug, difficultyPoints[submission.difficulty]);
  }

  return [...scores.entries()]
    .map(([key, score]) => ({
      name: displayNames.get(key) ?? (score.accountType === "member" ? "Society Member" : "ASTRA Member"),
      solved: score.problems.size,
      points: [...score.problems.values()].reduce((total, points) => total + points, 0),
    }))
    .sort((left, right) =>
      right.points - left.points ||
      right.solved - left.solved ||
      left.name.localeCompare(right.name),
    )
    .slice(0, limit)
    .map(({ name, solved, points }, index) => ({ rank: index + 1, name, solved, points }));
}
