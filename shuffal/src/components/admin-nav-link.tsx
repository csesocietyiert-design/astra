"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";

type AdminNavLinkProps = {
  onClick?: () => void;
};

export function AdminNavLink({ onClick }: AdminNavLinkProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ is_admin: boolean }>("/api/auth/access")
      .then(({ is_admin: admin }) => {
        if (active) setIsAdmin(admin);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="dashboard-admin-nav-link"
      aria-current={pathname === "/admin" ? "page" : undefined}
      aria-label="Create questions"
      title="Create questions"
      onClick={onClick}
    >
      <ShieldCheck size={15} aria-hidden="true" />
    </Link>
  );
}
