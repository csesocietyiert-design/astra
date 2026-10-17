import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { judgeRouter } from "./routes/judge.js";
import { profileRouter } from "./routes/profile.js";
import { streakRouter } from "./routes/streak.js";
import { notificationRouter } from "./routes/notifications.js";
import { problemRouter } from "./routes/problems.js";
import { contestRouter } from "./routes/contests.js";
import { leaderboardRouter } from "./routes/leaderboard.js";

export const app = express();

function isAllowedFrontendOrigin(origin: string | undefined) {
  if (!origin) return false;
  if (env.FRONTEND_ORIGIN.includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

app.disable("x-powered-by");
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedFrontendOrigin(origin)),
  credentials: true,
}));
app.use((request, response, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.get("origin");
    if (!isAllowedFrontendOrigin(origin)) {
      response.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
  }
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/judge", judgeRouter);
app.use("/api/problems", problemRouter);
app.use("/api/streak", streakRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/contests", contestRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/health", healthRouter);
app.use(errorHandler);
