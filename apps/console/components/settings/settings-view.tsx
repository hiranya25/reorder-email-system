"use client";

import { DEFAULT_RULES, DEMO_CAMPAIGN } from "@reorder/core";
import type { ReorderSetting } from "@reorder/email";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConsoleStore, useStoreHydrated } from "@/lib/store";
import type { AuditEntry } from "@/lib/types";
import { useSessionUser } from "../session-provider";
import { AuditTable } from "../approve/audit-table";
import { PageHeader } from "../console/page-header";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Field, Input } from "../ui/field";
import { Modal } from "../ui/modal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Saved({ show }: { show: boolean }) {
  return show ? <span className="text-[13px] font-semibold text-ok-fg">Saved</span> : null;
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [on, () => (setOn(true), setTimeout(() => setOn(false), 1800))];
}

export function SettingsView({ usersCard, audit }: { usersCard: React.ReactNode; audit: AuditEntry[] }) {
  const hydrated = useStoreHydrated();
  // Forms read the stored values once loaded; remount them after hydration.
  return hydrated ? <SettingsForms usersCard={usersCard} audit={audit} /> : <p className="text-sm text-ink-muted">Loading settings…</p>;
}

function SettingsForms({ usersCard, audit }: { usersCard: React.ReactNode; audit: AuditEntry[] }) {
  const settings = useConsoleStore((s) => s.settings);
  const rules = useConsoleStore((s) => s.rules);
  const saveRules = useConsoleStore((s) => s.saveRules);
  const isAdmin = useSessionUser().role === "admin";
  const [approvalsNeeded, setApprovalsNeeded] = useState(String(settings.requiredApprovals));
  const [approvalsSaved, flashApprovals] = useFlash();
  const campaigns = useConsoleStore((s) => s.campaigns);
  const updateSettings = useConsoleStore((s) => s.updateSettings);
  const clearAll = useConsoleStore((s) => s.clearAll);
  const router = useRouter();

  const [brand, setBrand] = useState(settings.brand);
  const [brandSaved, flashBrand] = useFlash();
  const [reorder, setReorder] = useState<ReorderSetting>(settings.reorder);
  const [urlTemplate, setUrlTemplate] = useState(settings.reorder.mode === "url" ? settings.reorder.template : "https://");
  const [mailto, setMailto] = useState(settings.reorder.mode === "mailto" ? settings.reorder.address : "");
  const [reorderSaved, flashReorder] = useFlash();
  const [generic, setGeneric] = useState(rules.genericLocalParts.join(", "));
  const [large, setLarge] = useState(String(rules.largeAccountProducts));
  const [rulesSaved, flashRules] = useFlash();
  const [tests, setTests] = useState(settings.testEmails.join("\n"));
  const [testsSaved, flashTests] = useFlash();
  const [clearOpen, setClearOpen] = useState(false);

  const urlInvalid = reorder.mode === "url" && !/^https:\/\/[^\s]+\.[^\s]+/i.test(urlTemplate);
  const mailInvalid = reorder.mode === "mailto" && !EMAIL_RE.test(mailto.trim());
  const testList = tests.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const badTests = testList.filter((t) => !EMAIL_RE.test(t));
  const largeN = Number(large);
  const nameFor = (id: string) => (id === DEMO_CAMPAIGN.id ? `${DEMO_CAMPAIGN.name} (demo)` : (campaigns.find((c) => c.id === id)?.name ?? id));

  return (
    <>
      <PageHeader title="Settings" subtitle="Brand, the Reorder button, review rules, the team test list and the activity log." />
      {!isAdmin && <p className="mb-4 rounded-lg bg-canvas px-4 py-3 text-[13px] text-ink-muted">Only admins can change these settings.</p>}
      <fieldset disabled={!isAdmin} className="m-0 min-w-0 border-0 p-0">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Brand" subtitle="Shown in the email header and footer." aside={<Saved show={brandSaved} />} />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void updateSettings(
                {
                  brand: {
                    brandName: brand.brandName.trim(),
                    companyName: brand.companyName.trim(),
                    address: brand.address.trim(),
                    phone: brand.phone?.trim() || undefined,
                    logoUrl: brand.logoUrl?.trim() || undefined,
                  },
                },
                "Brand",
              ).then((ok) => ok && flashBrand());
            }}
          >
            <Field label="Brand name (email header)">
              <Input value={brand.brandName} onChange={(e) => setBrand({ ...brand, brandName: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Company name (footer)">
              <Input value={brand.companyName} onChange={(e) => setBrand({ ...brand, companyName: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Business address (footer, required for marketing email)">
              <Input value={brand.address} onChange={(e) => setBrand({ ...brand, address: e.target.value })} maxLength={160} />
            </Field>
            <Field label="Phone (email header)">
              <Input value={brand.phone ?? ""} onChange={(e) => setBrand({ ...brand, phone: e.target.value })} maxLength={30} placeholder="1-800-530-2647" />
            </Field>
            <Field label="Logo link (public https image, e.g. from Mailchimp's Content Studio)">
              <Input value={brand.logoUrl ?? ""} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} maxLength={255} placeholder="https://mcusercontent.com/…/amipi-logo.png" />
            </Field>
            <Button type="submit" disabled={!brand.brandName.trim() || !brand.address.trim()}>
              Save brand
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Reorder button" subtitle="What the Yes, Go Ahead button opens. Campaigns can't be approved until this is set." aside={<Saved show={reorderSaved} />} />
          <form
            className="space-y-3 text-[14px]"
            onSubmit={(e) => {
              e.preventDefault();
              const next: ReorderSetting = reorder.mode === "url" ? { mode: "url", template: urlTemplate.trim() } : reorder.mode === "mailto" ? { mode: "mailto", address: mailto.trim().toLowerCase() } : { mode: "none" };
              void updateSettings({ reorder: next }, `Reorder button: ${next.mode}`).then((ok) => ok && flashReorder());
            }}
          >
            {(
              [
                ["none", "Not decided yet", "The button links nowhere; approval stays blocked."],
                ["url", "A web page", "A prefilled cart or reorder page. Use {CUST_ID} and {SEASON} to personalise the link."],
                ["mailto", "An email to the sales team", "Opens a pre-written reorder email listing the items and quantities."],
              ] as const
            ).map(([mode, label, help]) => (
              <label key={mode} className="flex gap-2.5 rounded-lg border border-line p-3">
                <input type="radio" name="reorder" className="mt-1 size-4 accent-navy" checked={reorder.mode === mode} onChange={() => setReorder(mode === "url" ? { mode, template: urlTemplate } : mode === "mailto" ? { mode, address: mailto } : { mode })} />
                <span>
                  <span className="font-semibold">{label}</span>
                  <span className="block text-[12px] text-ink-muted">{help}</span>
                </span>
              </label>
            ))}
            {reorder.mode === "url" && (
              <Field label="Link" hint="Example: https://store.com/reorder?customer={CUST_ID}">
                <Input value={urlTemplate} onChange={(e) => setUrlTemplate(e.target.value)} />
                {urlInvalid && <span className="mt-1 block text-xs text-bad-fg">Use a full https:// link.</span>}
              </Field>
            )}
            {reorder.mode === "mailto" && (
              <Field label="Send reorder emails to">
                <Input type="email" value={mailto} onChange={(e) => setMailto(e.target.value)} placeholder="orders@yourbrand.com" />
                {mailInvalid && mailto && <span className="mt-1 block text-xs text-bad-fg">Enter a valid email address.</span>}
              </Field>
            )}
            <Button type="submit" disabled={urlInvalid || mailInvalid}>
              Save reorder button
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Review rules" subtitle="Used when sales data is imported; re-import to apply changes to an existing campaign." aside={<Saved show={rulesSaved} />} />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const parts = [...new Set(generic.split(/[\s,;]+/).map((g) => g.trim().toLowerCase().replace(/@.*$/, "")).filter(Boolean))];
              void saveRules({ genericLocalParts: parts, largeAccountProducts: largeN }).then((ok) => ok && flashRules());
            }}
          >
            <Field label="Generic inbox names (sent to review)" hint="Comma separated, without @: info, sales, office…">
              <textarea className="min-h-[84px] w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-navy focus:outline-none" value={generic} onChange={(e) => setGeneric(e.target.value)} />
            </Field>
            <Field label="Large account: more than this many different products">
              <Input type="number" min={3} max={500} value={large} onChange={(e) => setLarge(e.target.value)} className="w-32" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!Number.isInteger(largeN) || largeN < 3}>
                Save rules
              </Button>
              <Button variant="ghost" onClick={() => (setGeneric(DEFAULT_RULES.genericLocalParts.join(", ")), setLarge(String(DEFAULT_RULES.largeAccountProducts)))}>
                Reset to defaults
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Team test list" subtitle="Who receives test sends once Mailchimp is connected." aside={<Saved show={testsSaved} />} />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void updateSettings({ testEmails: testList }, `Test list: ${testList.length} addresses`).then((ok) => ok && flashTests());
            }}
          >
            <textarea className="min-h-[96px] w-full rounded-lg border border-line px-3 py-2 font-mono text-[13px] focus:border-navy focus:outline-none" placeholder={"shruti@yourbrand.com\nfounder@yourbrand.com"} value={tests} onChange={(e) => setTests(e.target.value)} aria-label="Test email addresses" />
            {badTests.length > 0 && <p className="text-xs text-bad-fg">Not valid: {badTests.join(", ")}</p>}
            <Button type="submit" disabled={badTests.length > 0}>
              Save test list
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Final approval" subtitle="How many different people must approve a campaign before it can be exported or sent." aside={<Saved show={approvalsSaved} />} />
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void updateSettings({ requiredApprovals: Number(approvalsNeeded) }, `Approvals needed: ${approvalsNeeded}`).then((ok) => ok && flashApprovals());
            }}
          >
            <Field label="Approvals needed">
              <select value={approvalsNeeded} onChange={(e) => setApprovalsNeeded(e.target.value)} className="h-10 w-32 rounded-lg border border-line bg-white px-2.5 text-sm">
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "person" : "people"}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">Save</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Campaign data" subtitle="Deletes every campaign, import, decision, catalog and product edit. Users, sign-in and the activity log are kept." />
          <Button variant="secondary" onClick={() => setClearOpen(true)} className="border-bad-fg/40 text-bad-fg hover:bg-bad-bg">
            Clear all campaign data
          </Button>
        </Card>
      </div>
      </fieldset>

      <div className="mt-5">{usersCard}</div>

      <Card className="mt-5">
        <CardHeader title="Activity log" subtitle="The latest 100 approvals, imports, exports and settings changes." />
        <AuditTable entries={audit.slice(0, 100)} showCampaign campaignName={nameFor} />
      </Card>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Clear all campaign data?">
        <p className="text-[14px]">This permanently deletes every campaign, import, decision, catalog, product edit and remembered email for everyone. Users, sign-in and the activity log are kept. It can&apos;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            Cancel
          </Button>
          <Button
            className="border-bad-fg bg-bad-fg hover:bg-bad-fg/90"
            onClick={async () => {
              setClearOpen(false);
              if (await clearAll()) {
                router.push("/campaigns");
                router.refresh();
              }
            }}
          >
            Clear everything
          </Button>
        </div>
      </Modal>
    </>
  );
}
