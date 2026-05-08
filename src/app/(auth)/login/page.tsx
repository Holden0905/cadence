"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { signInWithPasswordAction } from "./actions";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);

    const result = await signInWithPasswordAction(email, password);

    if (result && "error" in result) {
      setError(result.error);
      setSigningIn(false);
    }
    // On success, the server action redirects to /dashboard;
    // signingIn stays true while the navigation completes.
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setError(null);
    setSendingMagicLink(true);

    const supabase = createClient();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    setSendingMagicLink(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setMagicLinkSent(true);
  };

  if (magicLinkSent) {
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
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We sent a sign-in link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMagicLinkSent(false);
              setEmail("");
            }}
          >
            Use a different email
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
        <CardTitle className="text-2xl">Cadence</CardTitle>
        <CardDescription>
          Stepan Millsdale — Weekly Inspections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@stepan.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
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
            disabled={signingIn || !email || !password}
          >
            {signingIn && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleMagicLink}
          disabled={sendingMagicLink || !email}
        >
          {sendingMagicLink && <Loader2 className="size-4 animate-spin" />}
          Send magic link to {email || "email"}
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
