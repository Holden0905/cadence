"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  inviteUserAction,
  updateUserSiteRoleAction,
  toggleUserSiteActiveAction,
} from "@/app/(platform)/admin/users/actions";
import type { Profile, SiteRole } from "@/lib/types";

export type SiteUserRow = {
  membershipId: string;
  profile: Profile;
  role: SiteRole;
  isActive: boolean;
};

export function UsersAdmin({
  users,
  callerIsSuperAdmin,
}: {
  users: SiteUserRow[];
  callerIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    email: string;
    fullName: string;
    role: SiteRole;
  }>({ email: "", fullName: "", role: "inspector" });

  const setRole = async (membershipId: string, role: SiteRole) => {
    const result = await updateUserSiteRoleAction(membershipId, role);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Role updated");
      router.refresh();
    }
  };

  const toggleActive = async (membershipId: string, current: boolean) => {
    const result = await toggleUserSiteActiveAction(membershipId, !current);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`User ${!current ? "activated" : "deactivated"}`);
      router.refresh();
    }
  };

  const submitInvite = async () => {
    setBusy(true);
    const result = await inviteUserAction(draft);
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.created
        ? "New user created and added to this site"
        : "Existing user added to this site",
    );
    setInviting(false);
    setDraft({ email: "", fullName: "", role: "inspector" });
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setInviting(true)}>
          <Plus className="size-4" />
          Invite user
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-44">Role at this site</TableHead>
              <TableHead className="w-32">Active here</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  No users at this site yet. Invite the first one.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.membershipId}>
                  <TableCell className="font-medium">
                    {u.profile.full_name || "—"}
                  </TableCell>
                  <TableCell>{u.profile.email}</TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(v) => setRole(u.membershipId, v as SiteRole)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inspector">Inspector</SelectItem>
                        <SelectItem value="site_admin">Site admin</SelectItem>
                        {callerIsSuperAdmin && (
                          <SelectItem value="super_admin">
                            Super admin
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.isActive}
                      onCheckedChange={() =>
                        toggleActive(u.membershipId, u.isActive)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={inviting} onOpenChange={(open) => !busy && setInviting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              If the email already has an account, they&apos;ll be added to
              this site with the selected role. Otherwise a new account is
              created with a temporary password and they can sign in via
              magic link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite_name">Full name</Label>
              <Input
                id="invite_name"
                value={draft.fullName}
                onChange={(e) =>
                  setDraft({ ...draft, fullName: e.target.value })
                }
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="invite_email">Email</Label>
              <Input
                id="invite_email"
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft({ ...draft, email: e.target.value })
                }
                placeholder="jane@stepan.com"
              />
            </div>
            <div>
              <Label htmlFor="invite_role">Role</Label>
              <Select
                value={draft.role}
                onValueChange={(v) => setDraft({ ...draft, role: v as SiteRole })}
              >
                <SelectTrigger id="invite_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspector">Inspector</SelectItem>
                  <SelectItem value="site_admin">Site admin</SelectItem>
                  {callerIsSuperAdmin && (
                    <SelectItem value="super_admin">Super admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviting(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={submitInvite}
              disabled={busy || !draft.email || !draft.fullName}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
