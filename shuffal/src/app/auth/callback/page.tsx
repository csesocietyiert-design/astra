"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type GoogleLoginResponse = {
  user: {
    first_name?: string | null;
  };
};

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const completion = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let active = true;

    async function completeGoogleSignIn(): Promise<string | null> {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          throw new Error("Google sign-in did not return an account. Please try again.");
        }

        try {
          const result = await apiRequest<GoogleLoginResponse>("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({ access_token: data.session.access_token }),
          });
          sessionStorage.setItem("astra-welcome-name", result.user.first_name?.trim() || "");
        } finally {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) throw signOutError;
        }
        return null;
      } catch (cause) {
        return cause instanceof Error ? cause.message : "Unable to complete Google sign-in.";
      }
    }

    completion.current ??= completeGoogleSignIn();
    void completion.current.then((message) => {
      if (!active) return;
      if (message) {
        setError(message);
        return;
      }
      router.replace("/dashboard");
    });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="google-callback-page">
      <section className="google-callback-card" aria-live="polite">
        {error ? (
          <>
            <h1>Google sign-in failed</h1>
            <p className="form-error" role="alert">{error}</p>
            <Link href="/">Return to sign in</Link>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={24} />
            <h1>Signing you in</h1>
            <p>Please wait while we connect your ASTRA account.</p>
          </>
        )}
      </section>
    </main>
  );
}
