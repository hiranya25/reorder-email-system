import { closeDb, getDb, users } from "@reorder/db";
import { sql } from "drizzle-orm";
import { runMigrations } from "@reorder/db/migrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as repo from "@/lib/server/repo";

const url = process.env.DATABASE_URL!;
const A = { id: "", name: "Shruti" };
const B = { id: "", name: "Shreya" };

describe("server rules (PostgreSQL)", () => {
  beforeAll(async () => {
    await runMigrations(url);
  });
  afterAll(closeDb);
  beforeEach(async () => {
    const db = getDb(url);
    await db.execute(sql`truncate table users, campaigns, app_settings, remembered_contacts, product_edits, catalogs, audit_logs cascade`);
    const [a, b] = await db
      .insert(users)
      .values([
        { email: "shruti@amipi.com", name: "Shruti", role: "reviewer" },
        { email: "shreya@amipi.com", name: "Shreya", role: "reviewer" },
      ])
      .returning();
    A.id = a!.id;
    B.id = b!.id;
    await repo.createCampaign({ id: "c1", name: "Holiday", seasonStart: "2025-10-01", seasonEnd: "2026-01-31" }, A.id);
  });

  it("saves decisions and remembers approved emails (not for the demo)", async () => {
    await repo.decide("c1", [{ accountId: "100", emails: ["a@x.com"] }], "approved", A);
    let snap = await repo.loadCampaignSnapshot("c1");
    expect(snap!.decisions["100"]).toMatchObject({ status: "approved", emails: ["a@x.com"], decidedBy: "Shruti" });
    expect((await repo.loadWorkspace()).remembered["100"]?.emails).toEqual(["a@x.com"]);

    await repo.decide("demo", [{ accountId: "200", emails: ["d@x.com"] }], "approved", A);
    expect((await repo.loadWorkspace()).remembered["200"]).toBeUndefined();

    await repo.decide("c1", [{ accountId: "100", emails: [] }], "undecided", A);
    snap = await repo.loadCampaignSnapshot("c1");
    expect(snap!.decisions["100"]?.status).toBe("undecided");
    expect((await repo.loadWorkspace()).remembered["100"]).toBeUndefined();
  });

  it("locks at the first approval and needs a second, different approver to export", async () => {
    await repo.addApproval("c1", A, "10 emails");
    await expect(repo.decide("c1", [{ accountId: "1", emails: ["a@x.com"] }], "approved", A)).rejects.toThrow(/locked/);
    await expect(repo.savePicks("c1", { bySegment: {}, byCustomer: {} })).rejects.toThrow(/locked/);
    await expect(repo.setHidden("c1", "SKU", true)).rejects.toThrow(/locked/);
    await expect(repo.addApproval("c1", A, "again")).rejects.toThrow(/different person/);
    await expect(repo.markExported("c1", A.id, "csv")).rejects.toThrow(/2 approvals/);

    await repo.addApproval("c1", B, "10 emails");
    const snap = await repo.loadCampaignSnapshot("c1");
    expect(snap!.approval.approvers.map((a) => a.name)).toEqual(["Shruti", "Shreya"]);
    await repo.markExported("c1", A.id, "csv");
    expect((await repo.loadCampaignSnapshot("c1"))!.approval.exportedAt).toBeTruthy();

    await repo.reopen("c1", A.id);
    const reopened = await repo.loadCampaignSnapshot("c1");
    expect(reopened!.approval).toMatchObject({ approvers: [], exportedAt: undefined });
    await expect(repo.setHidden("c1", "SKU", true)).resolves.toBeUndefined();
  });

  it("holds product changes while an approved campaign waits to be sent", async () => {
    await repo.addApproval("c1", A, "x");
    await expect(repo.setProductEdit("real", "SKU1", { displayName: "New name" })).rejects.toThrow(/waiting to be sent/);
    // Demo edits are separate and unaffected.
    await expect(repo.setProductEdit("demo", "SKU1", { displayName: "Demo name" })).resolves.toBeUndefined();
    await repo.addApproval("c1", B, "x");
    await repo.markExported("c1", A.id, "csv");
    await expect(repo.setProductEdit("real", "SKU1", { displayName: "New name" })).resolves.toBeUndefined();
    expect((await repo.loadWorkspace()).productEdits.real.displayName.SKU1).toBe("New name");
  });

  it("uses the approvals setting", async () => {
    await repo.putSetting("settings", { ...repo.DEFAULT_SETTINGS, requiredApprovals: 1 }, A.id);
    await repo.addApproval("c1", A, "x");
    await expect(repo.markExported("c1", A.id, "csv")).resolves.toBeUndefined();
  });

  it("refuses imports for the demo and deleting it", async () => {
    await expect(repo.deleteCampaign("demo", A.id)).rejects.toThrow(/demo/);
  });
});
