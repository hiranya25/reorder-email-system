import { PageSkeleton } from "@/components/ui/page-skeleton";

// The campaign's sidebar and steps stay on screen; only the step content waits.
export default function Loading() {
  return <PageSkeleton />;
}
