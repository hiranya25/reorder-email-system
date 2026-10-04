import { ComingSoon } from "@/components/console/coming-soon";

export default function RecommendationsPage() {
  return (
    <ComingSoon
      slug="recommendations"
      title="Recommendations"
      subtitle="Pick 3 new-season products for each customer group."
      features={[
        "Customer groups by top category and lab grown / natural",
        "Visual product grid to fill 3 slots per group",
        "Per-customer overrides and a preview of who gets which picks"
      ]}
    />
  );
}
