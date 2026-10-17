"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type LoginResponse = {
  user: {
    account_type: "member" | "outsider";
    first_name?: string | null;
    last_name?: string | null;
  };
};

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setError("");
    setGoogleBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start Google sign-in.");
      setGoogleBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      sessionStorage.setItem("astra-welcome-name", result.user.first_name?.trim() || "");
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form-card auth-login-card">
      <div className="auth-society-mark">
        <Image
          src="/cse-society-login.png"
          alt="CSE Society"
          width={96}
          height={73}
          priority
        />
      </div>
      <div className="auth-form-heading">
        <h1>Welcome Back</h1>
        <p>Sign in to continue your ASTRA journey</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-identifier">Society ID or Email</label>
        <div className="auth-input-wrap">
          {identifier.includes("@") ? <Mail size={14} /> : <UserRound size={14} />}
          <input
            id="login-identifier"
            autoComplete="username"
            placeholder="Enter your Society ID or email"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <label htmlFor="login-password">Password</label>
        <div className="auth-input-wrap">
          <LockKeyhole size={14} />
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="auth-submit" type="submit" disabled={busy || googleBusy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {!busy ? <Zap size={16} /> : null}
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="auth-or-divider"><span>or</span></div>
      <button
        className="auth-google-submit"
        type="button"
        onClick={handleGoogleSignIn}
        disabled={busy || googleBusy}
      >
        {googleBusy ? <LoaderCircle className="spin" size={17} /> : <GoogleMark />}
        {googleBusy ? "Connecting to Google…" : "Continue with Google"}
      </button>

      <div className="auth-form-bottom">
        <p>New to ASTRA?</p>
        <Link href="/register">Create an account</Link>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 37.95 47 31.82 47 24.55h-.02Z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.89.93 7.59 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.45-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
