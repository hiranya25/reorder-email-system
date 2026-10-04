import { ComingSoon } from "@/components/console/coming-soon";

export default function ImportPage() {
  return (
    <ComingSoon
      slug="import"
      title="Import data"
      subtitle="Bring in last season's sales export."
      features={[
        "Drag-and-drop .xlsx / .csv upload, parsed in your browser",
        "Column mapping (remembered for next season) and season date window",
        "Validation report: errors, warnings and auto-fixes in plain language",
        "Download the problem rows to fix them in Power BI"
      ]}
    />
  );
}
