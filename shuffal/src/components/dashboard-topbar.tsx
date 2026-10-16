"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, CircleHelp, Flame, House, Brain, CalendarCheck, Headset, Menu, X } from "lucide-react";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { NotificationNavLink } from "@/components/notification-nav-link";
import { AdminNavLink } from "@/components/admin-nav-link";
import { apiRequest } from "@/lib/api";

type DashboardTopbarProps = {
  name?: string;
  accountType?: string;
  avatarUrl?: string | null;
  activeHome?: boolean;
  onSignOut?: () => void | Promise<void>;
};

export function DashboardTopbar({
  name,
  accountType,
  avatarUrl,
  activeHome = false,
  onSignOut,
}: DashboardTopbarProps) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [streakError, setStreakError] = useState(false);
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const hasAccount = name !== undefined && accountType !== undefined && onSignOut !== undefined;
  const account = name !== undefined && accountType !== undefined && onSignOut
    ? { name, accountType, onSignOut }
    : null;

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 48);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    const updateClock = () => setClockNow(new Date());
    updateClock();
    const intervalId = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!hasAccount) return;

    let active = true;
    async function refreshStreak() {
      try {
        const { current_streak: currentStreak } = await apiRequest<{ current_streak: number }>("/api/streak");
        if (active) {
          setStreak(currentStreak);
          setStreakError(false);
        }
      } catch {
        if (active) setStreakError(true);
      }
    }

    function handleStreakUpdated(event: Event) {
      const updatedStreak = event instanceof CustomEvent ? event.detail : undefined;
      if (typeof updatedStreak === "number" && Number.isInteger(updatedStreak) && updatedStreak >= 0) {
        setStreak(updatedStreak);
        setStreakError(false);
        return;
      }
      void refreshStreak();
    }

    void refreshStreak();
    window.addEventListener("astra:streak-updated", handleStreakUpdated);

    return () => {
      active = false;
      window.removeEventListener("astra:streak-updated", handleStreakUpdated);
    };
  }, [hasAccount]);

  return (
    <header className={`dashboard-topbar${isScrolled ? " is-scrolled" : ""}${mobileMenuOpen ? " is-mobile-menu-open" : ""}`}>
      <button
        className="dashboard-mobile-menu-toggle"
        type="button"
        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="dashboard-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <Link className="dashboard-brand" href="/dashboard" onClick={closeMobileMenu} aria-label="ASTRA home">
        <span>ASTRA</span>
        <small>CSE SOCIETY</small>
      </Link>
      <nav
        className="dashboard-nav"
        id="dashboard-navigation"
        aria-label="Main navigation"
      >
        <Link href="/dashboard" aria-label="Home" title="Home" aria-current={activeHome || pathname === "/dashboard" ? "page" : undefined} onClick={closeMobileMenu}><House size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-home">Home</span></Link>
        <Link href="/problems" aria-label="Questions" title="Questions" aria-current={pathname.startsWith("/problems") ? "page" : undefined} onClick={closeMobileMenu}><CircleHelp size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-questions">Questions</span></Link>
        <Link href="/profile" aria-label="Progress" title="Progress" aria-current={pathname === "/profile" ? "page" : undefined} onClick={closeMobileMenu}><ChartNoAxesCombined size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-progress">Progress</span></Link>
        <Link href="/dpp" aria-label="DPP" title="DPP" aria-current={pathname === "/dpp" ? "page" : undefined} onClick={closeMobileMenu}><CalendarCheck size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-dpp">DPP</span></Link>
        <Link href="/quiz" aria-label="Quiz" title="Quiz" aria-current={pathname === "/quiz" ? "page" : undefined} onClick={closeMobileMenu}><Brain size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-quiz">Quiz</span></Link>
        <NotificationNavLink onClick={closeMobileMenu} />
        <AdminNavLink onClick={closeMobileMenu} />
        <Link href="/support" aria-label="Doubt and support" title="Doubt and support" aria-current={pathname === "/support" ? "page" : undefined} onClick={closeMobileMenu}><Headset size={15} aria-hidden="true" /><span className="dashboard-nav-label dashboard-nav-label-support">Doubt and support</span></Link>
      </nav>
      <time
        className="dashboard-live-clock"
        dateTime={clockNow?.toISOString()}
        aria-label={clockNow
          ? clockNow.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "medium" })
          : "Current date and time"}
      >
        {clockNow
          ? `${clockNow.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} | ${clockNow.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}`
        : ""}
      </time>
      {account ? (
        <div className="dashboard-account">
          <span
            className={`dashboard-streak${streak !== null && streak > 0 ? " is-active" : ""}`}
            aria-label={streakError ? "Streak unavailable" : `${streak ?? "Loading"} day streak`}
            title={streakError ? "Could not load your streak" : `${streak ?? "Loading"} day streak`}
          >
            <Flame size={14} aria-hidden="true" />
            <span>{streakError ? "!" : streak ?? "…"}</span>
          </span>
          <ProfileDropdown
            name={account.name}
            accountType={account.accountType}
            avatarUrl={avatarUrl}
            onSignOut={account.onSignOut}
          />
        </div>
      ) : (
        <div className="dashboard-account dashboard-account-placeholder" aria-hidden="true" />
      )}
    </header>
  );
}
