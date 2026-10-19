import { ConsoleShell } from "@/components/console/shell";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return (
    <ConsoleShell>
      <PageSkeleton />
    </ConsoleShell>
  );
}
