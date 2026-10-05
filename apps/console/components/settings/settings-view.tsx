"use client";

import { DEFAULT_RULES, DEMO_CAMPAIGN } from "@reorder/core";
import type { ReorderSetting } from "@reorder/email";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConsoleStore, useStoreHydrated } from "@/lib/store";
import { AuditTable } from "../approve/audit-table";
import { PageHeader } from "../console/page-header";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Field, Input } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusChip } from "../ui/status-chip";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Saved({ show }: { show: boolean }) {
  return show ? <span className="text-[13px] font-semibold text-ok-fg">Saved</span> : null;
}

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [on, () => (setOn(true), setTimeout(() => setOn(false), 1800))];
}

export function SettingsView() {
  const hydrated = useStoreHydrated();
  // Forms read the stored values once loaded; remount them after hydration.
  return hydrated ? <SettingsForms /> : <p className="text-sm text-ink-muted">Loading settings…</p>;
}

function SettingsForms() {
  const settings = useConsoleStore((s) => s.settings);
  const rules = useConsoleStore((s) => s.rules);
  const audit = useConsoleStore((s) => s.audit);
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
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Brand" subtitle="Shown in the email header and footer." aside={<Saved show={brandSaved} />} />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings({ brand: { brandName: brand.brandName.trim(), companyName: brand.companyName.trim(), address: brand.address.trim() } }, "Brand");
              flashBrand();
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
            <Button type="submit" disabled={!brand.brandName.trim() || !brand.address.trim()}>
              Save brand
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Reorder button" subtitle="What REORDER THESE ITEMS opens. Campaigns can't be approved until this is set." aside={<Saved show={reorderSaved} />} />
          <form
            className="space-y-3 text-[14px]"
            onSubmit={(e) => {
              e.preventDefault();
              const next: ReorderSetting = reorder.mode === "url" ? { mode: "url", template: urlTemplate.trim() } : reorder.mode === "mailto" ? { mode: "mailto", address: mailto.trim().toLowerCase() } : { mode: "none" };
              updateSettings({ reorder: next }, `Reorder button: ${next.mode}`);
              flashReorder();
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
              useConsoleStore.setState(() => ({ rules: { genericLocalParts: parts, largeAccountProducts: largeN } }));
              useConsoleStore.getState().log({ action: "Settings changed", detail: "Review rules" });
              flashRules();
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
              updateSettings({ testEmails: testList }, `Test list: ${testList.length} addresses`);
              flashTests();
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
          <CardHeader title="Users and roles" subtitle="Google sign-in limited to the company domain arrives with the backend. Until then everyone using this browser acts as the reviewer." />
          <table className="w-full text-left text-[13px]">
            <tbody className="divide-y divide-line">
              {[
                ["Project Owner", "Admin", "Everything, including settings and Mailchimp sync"],
                ["Shruti", "Reviewer", "Approve mappings, choose picks, preview, final approval"],
                ["Founder", "Viewer", "See campaigns, previews and results"],
              ].map(([who, role, can]) => (
                <tr key={who}>
                  <td className="py-2.5 pr-3 font-semibold">{who}</td>
                  <td className="py-2.5 pr-3">
                    <StatusChip tone="neutral">{role}</StatusChip>
                  </td>
                  <td className="py-2.5 text-ink-muted">{can}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Data in this browser" subtitle="Imports, decisions and settings are stored only in this browser until the backend is connected." />
          <Button variant="secondary" onClick={() => setClearOpen(true)} className="border-bad-fg/40 text-bad-fg hover:bg-bad-bg">
            Clear all data
          </Button>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Activity log" subtitle="The latest 100 approvals, imports, exports and settings changes." />
        <AuditTable entries={audit.slice(0, 100)} showCampaign campaignName={nameFor} />
      </Card>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Clear all data in this browser?">
        <p className="text-[14px]">This removes every campaign, import, catalog, decision, setting and the activity log from this browser. It can&apos;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            Cancel
          </Button>
          <Button
            className="border-bad-fg bg-bad-fg hover:bg-bad-fg/90"
            onClick={() => {
              clearAll();
              setClearOpen(false);
              router.push("/campaigns");
            }}
          >
            Clear everything
          </Button>
        </div>
      </Modal>
    </>
  );
}
