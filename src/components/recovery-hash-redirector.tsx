"use client";

import { useEffect } from "react";

/**
 * Catches a Supabase recovery/invite hash on any page and forwards to
 * /update-password. Defensive against the case where Supabase's
 * /auth/v1/verify rejects our redirect_to (because the URL isn't in
 * the project's Redirect URLs allow list) and falls back to the
 * Site URL — the hash is preserved through that fallback, so any
 * page that mounts this component can recover.
 */
export function RecoveryHashRedirector() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    // Already on the right page — its own useEffect handles the tokens.
    if (window.location.pathname.startsWith("/update-password")) return;
    // Only forward if this is a Supabase recovery / invite hash.
    if (!/[#&]type=(recovery|invite)/.test(hash)) return;
    // Use replace so the broken intermediate URL doesn't sit in history.
    window.location.replace("/update-password" + hash);
  }, []);
  return null;
}
