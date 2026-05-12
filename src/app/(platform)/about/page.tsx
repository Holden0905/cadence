import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LayoutDashboard,
  History,
  CheckSquare,
  MapPin,
  Link2,
  Mail,
  Users,
  Building2,
} from "lucide-react";
import { requireSiteContext } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

type Section = {
  icon: React.ElementType;
  title: string;
  body: string;
};

const SECTIONS: Section[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "Your weekly inspection status at a glance. Shows the current cycle's matrix with all areas and inspection types. Click any cell to upload or view documents.",
  },
  {
    icon: History,
    title: "History",
    body: "View past completed cycles. Upload late submissions or corrections. Send completion reports when everything's approved.",
  },
  {
    icon: CheckSquare,
    title: "Review",
    body: "Admin view for approving submitted inspections. Individual or bulk approve across all cycles.",
  },
  {
    icon: MapPin,
    title: "Areas",
    body: "Manage plant areas where inspections occur. Add, edit, or deactivate areas.",
  },
  {
    icon: Link2,
    title: "Requirements",
    body: "The applicability matrix. Toggle which inspection types apply to each area and assign primary and backup owners who receive nudge emails.",
  },
  {
    icon: Mail,
    title: "Recipients",
    body: "Manage the email distribution list for the automated weekly summary reports.",
  },
  {
    icon: Users,
    title: "Users",
    body: "Invite users by email, assign roles (inspector, site admin, super admin), and manage site access.",
  },
  {
    icon: Building2,
    title: "Sites",
    body: "Super admin only. Manage multiple facility sites across the organization.",
  },
];

export default async function AboutPage() {
  await requireSiteContext();

  return (
    <div className="px-8 py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={56}
          height={56}
          priority
        />
        <div>
          <h1 className="text-2xl font-semibold">About Cadence</h1>
          <p className="text-sm text-muted-foreground">
            Weekly environmental inspection tracking
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed">
            <strong>Cadence</strong> is an automated weekly environmental
            inspection tracking system built for Stepan Company. It replaces
            the manual process of collecting, tracking, and reporting weekly
            AVO, VEO, OEL, Baghouse, and CT Sample inspections across plant
            areas. Cadence auto-generates weekly inspection cycles, assigns
            tasks to responsible owners, accepts document uploads, sends
            automated reminder and summary emails, and provides admin review
            and approval workflows.
          </p>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold mb-3">What each page does</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-muted p-1.5">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {s.body}
                </CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Cadence — Proactive Environmental Services · for Stepan Company
      </p>
    </div>
  );
}
