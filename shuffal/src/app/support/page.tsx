import { ArrowUpRight, Bell, Mail } from "lucide-react";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";

export default function SupportPage() {
  return (
    <PortalShell>
      <main className="container-shell portal-content support-page">
        <header className="support-heading">
          <p className="notifications-eyebrow">ASTRA HELP DESK</p>
          <h1>Doubt &amp; Support</h1>
          <p>Need help with ASTRA? Reach the CSE Society Core team or check the latest Society updates.</p>
        </header>

        <section className="support-options" aria-label="Support options">
          <article className="support-option">
            <span className="support-option-icon"><Mail size={20} aria-hidden="true" /></span>
            <h2>Contact the Core team</h2>
            <p>Write to us with your question or issue. Include details so the team can help you faster.</p>
            <a
              className="support-option-link"
              href="mailto:csesociety.iert@gmail.com?subject=ASTRA%20Doubt%20and%20Support"
            >
              Email csesociety.iert@gmail.com <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </article>

          <article className="support-option">
            <span className="support-option-icon"><Bell size={20} aria-hidden="true" /></span>
            <h2>Society Dashboard notifications</h2>
            <p>Visit notifications to read announcements and updates shared by the CSE Society team.</p>
            <Link className="support-option-link" href="/notifications">
              View notifications <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </article>
        </section>
      </main>
    </PortalShell>
  );
}
