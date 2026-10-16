export type Contest = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  duration_minutes: number;
  ends_at: string;
  status: "Upcoming" | "Live" | "Ended";
  registration_open: boolean;
  registration_count: number;
  is_registered: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  solved: number;
  points: number;
};

export type DashboardSubmission = {
  id: string;
  problem_slug: string;
  problem_title: string;
  language: string;
  verdict: string;
  created_at: string;
};
