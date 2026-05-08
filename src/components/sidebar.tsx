"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  LayoutDashboard,
  History,
  CheckSquare,
  MapPin,
  Link2,
  Mail,
  Users,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

type NavItem = { href: string; label: string; icon: React.ElementType };

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

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = profile.role === "admin";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
            Stepan Millsdale
          </p>
        </div>
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
          <p className="mt-1 inline-block rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sidebar-accent-foreground">
            {profile.role}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
