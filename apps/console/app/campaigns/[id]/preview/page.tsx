import { ComingSoon } from "@/components/console/coming-soon";

export default function PreviewPage() {
  return (
    <ComingSoon
      slug="preview"
      title="Email preview"
      subtitle="See exactly what each customer will receive before anything is sent."
      features={[
        "Preview as any customer, desktop / mobile toggle",
        "Checks for each email (greeting name, products shown, missing images, picks chosen)",
        "Sending details and Send test to team"
      ]}
    />
  );
}
