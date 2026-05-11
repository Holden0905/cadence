"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  CheckSquare,
  MapPin,
  Link2,
  Mail,
  Users,
  Building2,
  LogOut,
  ChevronsUpDown,
  Check,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { switchSiteAction, signOutAction } from "@/app/(platform)/actions";
import { toast } from "sonner";
import type { Profile, Site, SiteMembership, SiteRole } from "@/lib/types";

type NavItem = { href: string; label: string; icon: React.ElementType };

const ROLE_LABEL: Record<SiteRole, string> = {
  super_admin: "Super admin",
  site_admin: "Site admin",
  inspector: "Inspector",
};

const userItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
];

const adminItems: NavItem[] = [
  { href: "/review", label: "Review", icon: CheckSquare },
];

const adminConfigItems: NavItem[] = [
  { href: "/admin/areas", label: "Areas", icon: MapPin },
  { href: "/admin/requirements", label: "Requirements", icon: Link2 },
  { href: "/admin/recipients", label: "Recipients", icon: Mail },
  { href: "/admin/users", label: "Users", icon: Users },
];

const superAdminItems: NavItem[] = [
  { href: "/admin/sites", label: "Sites", icon: Building2 },
];

export function Sidebar({
  profile,
  currentSite,
  currentRole,
  memberships,
}: {
  profile: Profile;
  currentSite: Site;
  currentRole: SiteRole;
  memberships: SiteMembership[];
}) {
  const pathname = usePathname();
  const isAdmin = currentRole === "site_admin" || currentRole === "super_admin";
  const isSuperAdmin = currentRole === "super_admin";
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const handleSwitchSite = async (siteId: string) => {
    if (siteId === currentSite.id) return;
    setSwitching(siteId);
    const result = await switchSiteAction(siteId);
    if (result && "error" in result) {
      toast.error(result.error);
      setSwitching(null);
    }
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active =
      pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={36}
          height={36}
          priority
        />
        <div>
          <p className="text-base font-semibold leading-tight text-sidebar-foreground">
            Cadence
          </p>
          <p className="text-xs text-sidebar-foreground/60">
            {ROLE_LABEL[currentRole]}
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-left hover:bg-sidebar-accent transition">
              <Building2 className="size-4 shrink-0 text-sidebar-foreground/70" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-sidebar-foreground">
                  {currentSite.name}
                </p>
                {currentSite.location && (
                  <p className="text-[11px] text-sidebar-foreground/60 truncate">
                    {currentSite.location}
                  </p>
                )}
              </div>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56"
            sideOffset={6}
          >
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Switch site
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {memberships.map((m) => {
              const active = m.site.id === currentSite.id;
              const loading = switching === m.site.id;
              return (
                <DropdownMenuItem
                  key={m.site.id}
                  onClick={() => handleSwitchSite(m.site.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.site.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize truncate">
                        {ROLE_LABEL[m.role]}
                      </p>
                    </div>
                    {loading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      active && <Check className="size-3.5" />
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {userItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {isAdmin && (
          <>
            <div className="pt-2">
              {adminItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
            <div className="pt-4 pb-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Admin
              </p>
            </div>
            {adminConfigItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
            {isSuperAdmin &&
              superAdminItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {profile.full_name || profile.email}
          </p>
          <p className="text-xs text-sidebar-foreground/60 truncate">
            {profile.email}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setSigningOut(true);
            await signOutAction();
          }}
          disabled={signingOut}
          className="w-full justify-start"
        >
          {signingOut ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          Sign out
        </Button>
      </div>
    </aside>
  );
}
