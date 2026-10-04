import { ComingSoon } from "@/components/console/coming-soon";

export default function ApprovePage() {
  return (
    <ComingSoon
      slug="approve"
      title="Approve & sync"
      subtitle="Final gate before sending."
      features={[
        "Summary of recipients, exclusions and remaining blockers",
        "Approve & lock (reviewer), recorded in the audit log",
        "Download the Mailchimp import CSV; direct sync arrives with the backend"
      ]}
    />
  );
}
