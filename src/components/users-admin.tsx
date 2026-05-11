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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  KeyRound,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  inviteUserAction,
  updateUserSiteRoleAction,
  toggleUserSiteActiveAction,
  deleteUserMembershipAction,
  updateUserProfileAction,
  sendUserPasswordResetAction,
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
  callerProfileId,
}: {
  users: SiteUserRow[];
  callerIsSuperAdmin: boolean;
  callerProfileId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    email: string;
    fullName: string;
    role: SiteRole;
  }>({ email: "", fullName: "", role: "inspector" });

  const [editing, setEditing] = useState<SiteUserRow | null>(null);
  const [editDraft, setEditDraft] = useState({ email: "", fullName: "" });
  const [deleting, setDeleting] = useState<SiteUserRow | null>(null);

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
    if (result.created) {
      if (result.emailSent) {
        toast.success("New user created — welcome email sent");
      } else {
        toast.warning(
          `New user created, but welcome email wasn't sent${result.emailReason ? `: ${result.emailReason}` : ""}`,
        );
      }
    } else {
      toast.info("Existing user added to this site");
    }
    setInviting(false);
    setDraft({ email: "", fullName: "", role: "inspector" });
    router.refresh();
  };

  const openEdit = (u: SiteUserRow) => {
    setEditDraft({
      email: u.profile.email,
      fullName: u.profile.full_name ?? "",
    });
    setEditing(u);
  };

  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const result = await updateUserProfileAction({
      profileId: editing.profile.id,
      email: editDraft.email,
      fullName: editDraft.fullName,
    });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Profile updated");
    setEditing(null);
    router.refresh();
  };

  const submitReset = async (u: SiteUserRow) => {
    setBusy(true);
    const result = await sendUserPasswordResetAction({
      email: u.profile.email,
      fullName: u.profile.full_name,
    });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.sent) {
      toast.success(`Reset link sent to ${u.profile.email}`);
    } else {
      toast.warning(
        `Reset link not sent${result.reason ? ` (${result.reason})` : ""}`,
      );
    }
  };

  const submitDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const result = await deleteUserMembershipAction(deleting.membershipId);
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.remainingMemberships === 0) {
      toast.warning(
        `${deleting.profile.email} removed — they have no other site memberships and will be locked out.`,
      );
    } else {
      toast.success(`Removed ${deleting.profile.email} from this site`);
    }
    setDeleting(null);
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
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-6"
                >
                  No users at this site yet. Invite the first one.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.profile.id === callerProfileId;
                return (
                  <TableRow key={u.membershipId}>
                    <TableCell className="font-medium">
                      {u.profile.full_name || "—"}
                      {isSelf && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          You
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{u.profile.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          setRole(u.membershipId, v as SiteRole)
                        }
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
                      <span
                        title={
                          isSelf
                            ? "You cannot deactivate your own account."
                            : undefined
                        }
                        className={isSelf ? "cursor-not-allowed" : ""}
                      >
                        <Switch
                          checked={u.isActive}
                          disabled={isSelf}
                          onCheckedChange={() =>
                            toggleActive(u.membershipId, u.isActive)
                          }
                        />
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(u)}>
                            <Pencil className="size-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => submitReset(u)}>
                            <KeyRound className="size-3.5" />
                            Send password reset
                          </DropdownMenuItem>
                          {!isSelf && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleting(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                                Remove from this site
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Invite */}
      <Dialog open={inviting} onOpenChange={(open) => !busy && setInviting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              If the email already has an account, they&apos;ll be added to
              this site with the selected role. Otherwise a new account is
              created and a welcome email is sent so they can set their
              password.
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

      {/* Edit */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !busy && !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Changes apply across all of this user&apos;s sites.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit_name">Full name</Label>
              <Input
                id="edit_name"
                value={editDraft.fullName}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, fullName: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editDraft.email}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, email: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={submitEdit}
              disabled={busy || !editDraft.email || !editDraft.fullName}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => !busy && !open && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove from this site?</DialogTitle>
            <DialogDescription>
              <strong>
                {deleting?.profile.full_name || deleting?.profile.email}
              </strong>{" "}
              will lose access to this site. Their account stays intact and
              they can be re-invited later. If this is their only site
              membership, they&apos;ll be locked out until added somewhere.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitDelete}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
