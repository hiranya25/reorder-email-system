import { ComingSoon } from "@/components/console/coming-soon";

export default function MappingPage() {
  return (
    <ComingSoon
      slug="mapping"
      title="Customer mapping"
      subtitle="Confirm which email receives each customer's reorder email. Nothing is sent until every account is approved or excluded."
      features={[
        "Filters: All / Ready / Needs review / No email, search and sales-rep filter",
        "Approve, exclude, add an email, pick one of two emails, merge shared emails",
        "Approve all ready, with a confirmation",
        "Approved emails are remembered for next season"
      ]}
    />
  );
}
