"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type SessionState = "checking" | "ready" | "no-session";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("checking");

  useEffect(() => {
    const supabase = createClient();

    const finish = (ok: boolean) =>
      setSessionState(ok ? "ready" : "no-session");

    // Supabase recovery links use the implicit flow: the verify
    // endpoint redirects here with #access_token=...&refresh_token=...
    // &type=recovery. Parse the hash and set the session manually.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    if (hash) {
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const type = params.get("type");
      const hashError = params.get("error_description") ?? params.get("error");

      if (hashError) {
        setError(decodeURIComponent(hashError));
        finish(false);
        return;
      }

      if (access_token && refresh_token) {
        // Clean the hash from the URL so a refresh doesn't re-trigger.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );

        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ error: setErr }) => {
            if (setErr) {
              setError(setErr.message);
              finish(false);
            } else if (type === "recovery" || type === "invite") {
              finish(true);
            } else {
              finish(true);
            }
          });
        return;
      }
    }

    // No hash — maybe the user already has a session (e.g., they were
    // signed in and clicked "Reset password" themselves).
    supabase.auth.getUser().then(({ data }) => {
      finish(!!data.user);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/auth/resolve-site");
  };

  if (sessionState === "checking") {
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (sessionState === "no-session") {
    return (
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/cadence-logo.png"
            alt="Cadence"
            width={64}
            height={64}
            priority
            className="mb-2"
          />
          <CardTitle className="text-2xl">Link expired</CardTitle>
          <CardDescription>
            {error ??
              "This password reset link is no longer valid. Request a new one to try again."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/forgot-password">Request a new link</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="items-center text-center">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={64}
          height={64}
          priority
          className="mb-2"
        />
        <CardTitle className="text-2xl">Set a new password</CardTitle>
        <CardDescription>
          Choose a password you&apos;ll remember. Minimum 8 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !password || !confirm}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
