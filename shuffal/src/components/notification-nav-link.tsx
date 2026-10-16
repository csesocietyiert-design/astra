"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { apiRequest } from "@/lib/api";

type NotificationNavLinkProps = {
  onClick?: () => void;
};

export function NotificationNavLink({ onClick }: NotificationNavLinkProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const refreshUnreadCount = async () => {
      try {
        const result = await apiRequest<{ unread_count: number }>("/api/notifications");
        if (active) {
          setUnreadCount(result.unread_count);
          setUnavailable(false);
        }
      } catch {
        if (active) {
          setUnreadCount(0);
          setUnavailable(true);
        }
      }
    };

    void refreshUnreadCount();
    const intervalId = window.setInterval(refreshUnreadCount, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const label = unavailable
    ? "Notifications. Sign in to check for updates."
    : unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : "Notifications";

  return (
    <Link
      href="/notifications"
      className="notification-nav-link"
      aria-current={pathname === "/notifications" ? "page" : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="notification-nav-icon">
        <Bell size={15} aria-hidden="true" />
        {unreadCount > 0 && <span className="notification-nav-dot" aria-hidden="true" />}
      </span>
      <span className="dashboard-nav-label dashboard-nav-label-notifications">Notifications</span>
      {unreadCount > 0 && <span className="notification-nav-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </Link>
  );
}
