import { requireSiteContext } from "@/lib/admin-guard";
import { AboutContent } from "@/components/about-content";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  await requireSiteContext();
  return (
    <div className="px-8 py-8 max-w-4xl">
      <AboutContent />
    </div>
  );
}
