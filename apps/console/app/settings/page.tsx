import { PageHeader } from "@/components/console/page-header";
import { ConsoleShell } from "@/components/console/shell";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <ConsoleShell>
      <PageHeader title="Settings" subtitle="Mailchimp connection, review rules, users and the audit log." />
      <Card className="max-w-2xl text-[14px]">
        <p className="font-semibold">Built in phase F6</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Review rules: generic-inbox list, large-account threshold, products per email</li>
          <li>Reorder button mode and the team&apos;s test-send list</li>
          <li>Users and roles (Admin, Reviewer, Viewer)</li>
          <li>Audit log of every approval and export</li>
          <li>Mailchimp connection arrives with the backend</li>
        </ul>
      </Card>
    </ConsoleShell>
  );
}
