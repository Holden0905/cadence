import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
import { RecipientsAdmin } from "@/components/recipients-admin";
import type { Recipient } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminRecipientsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: recipients } = await supabase
    .from("recipients")
    .select("*")
    .order("email");

  return (
    <div className="px-8 py-8 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">Recipients</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Email distribution list for the weekly summary. These don&apos;t need
        an app account.
      </p>
      <RecipientsAdmin recipients={(recipients ?? []) as Recipient[]} />
    </div>
  );
}
