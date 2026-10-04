import { ComingSoon } from "@/components/console/coming-soon";

export default function ResultsPage() {
  return (
    <ComingSoon
      slug="results"
      title="Results"
      subtitle="Prove it works."
      features={[
        "Opens, clicks, reorder clicks and recommendation clicks",
        "Breakdown by customer group and sales rep",
        "Export to CSV"
      ]}
    />
  );
}
