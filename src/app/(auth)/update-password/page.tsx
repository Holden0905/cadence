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
    supabase.auth.getUser().then(({ data }) => {
      setSessionState(data.user ? "ready" : "no-session");
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
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    // Clear the must_change_password flag so we don't loop back here
    // on the next platform page load.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({
          must_change_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
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
          <CardTitle className="text-2xl">Sign in first</CardTitle>
          <CardDescription>
            You need to sign in before you can change your password. Use
            the temporary password from your invite or reset email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/login">Go to sign in</a>
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
