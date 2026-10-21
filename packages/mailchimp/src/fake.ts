import { createServer, type Server } from "node:http";
import type { FetchLike } from "./client";
import { subscriberHash, type MemberStatus } from "./client";

/**
 * An in-memory stand-in for the Mailchimp endpoints the console uses, for tests only.
 * Unknown addresses are "not in the audience" (404) until seeded or added.
 */
export interface FakeMember {
  email: string;
  status: MemberStatus;
  merge: Record<string, string>;
}

export interface FakeState {
  listId: string;
  listName: string;
  /** Field limit; Mailchimp refuses new fields past it. */
  maxFields: number;
  mergeFields: { tag: string; name: string; type: string }[];
  members: Map<string, FakeMember>;
  segments: { id: number; name: string; members: Set<string> }[];
  campaigns: Map<string, { id: string; status: string; segmentId: number; settings: Record<string, unknown>; html?: string; tests: string[][]; sentTo?: string[] }>;
  /** Count of each "METHOD /path-pattern" call, for assertions. */
  calls: Map<string, number>;
  /** Make the next N calls to this path pattern fail with 503 (retry tests). */
  failNext: Map<string, number>;
}

export function newFakeState(listId = "list123"): FakeState {
  return {
    listId,
    listName: "AMIPI Core",
    maxFields: 30,
    mergeFields: [
      { tag: "FNAME", name: "First Name", type: "text" },
      { tag: "LNAME", name: "Last Name", type: "text" },
    ],
    members: new Map(),
    segments: [],
    campaigns: new Map(),
    calls: new Map(),
    failNext: new Map(),
  };
}

export function seedMember(state: FakeState, email: string, status: MemberStatus = "subscribed") {
  state.members.set(subscriberHash(email), { email: email.toLowerCase(), status, merge: {} });
}

type Res = { status: number; body: unknown };
const notFound = (detail: string): Res => ({ status: 404, body: { title: "Resource Not Found", detail } });

export function handle(state: FakeState, method: string, rawPath: string, body: Record<string, unknown> | undefined): Res {
  const path = rawPath.replace(/^\/3\.0/, "").split("?")[0]!;
  const pattern = path.replace(/[0-9a-f]{32}/g, ":hash").replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/campaigns\/[\w-]+/, "/campaigns/:cid");
  const key = `${method} ${pattern}`;
  state.calls.set(key, (state.calls.get(key) ?? 0) + 1);
  const fails = state.failNext.get(pattern) ?? 0;
  if (fails > 0) {
    state.failNext.set(pattern, fails - 1);
    return { status: 503, body: { title: "Service Unavailable", detail: "Try again" } };
  }

  if (method === "GET" && path === "/ping") return { status: 200, body: { health_status: "Everything's Chimpy!" } };

  const list = path.match(/^\/lists\/([^/]+)(\/.*)?$/);
  if (list) {
    if (list[1] !== state.listId) return notFound("The requested resource could not be found.");
    const rest = list[2] ?? "";
    if (method === "GET" && rest === "") return { status: 200, body: { id: state.listId, name: state.listName, stats: { member_count: [...state.members.values()].filter((m) => m.status === "subscribed").length } } };
    if (method === "GET" && rest === "/merge-fields") return { status: 200, body: { merge_fields: state.mergeFields } };
    if (method === "POST" && rest === "/merge-fields") {
      if (state.mergeFields.length >= state.maxFields) return { status: 400, body: { title: "Invalid Resource", detail: "Merge Max Limit Exceeded" } };
      state.mergeFields.push({ tag: String(body?.tag), name: String(body?.name), type: String(body?.type) });
      return { status: 200, body: {} };
    }
    const member = rest.match(/^\/members\/([0-9a-f]{32})$/);
    if (member) {
      const m = state.members.get(member[1]!);
      if (method === "GET") return m ? { status: 200, body: { status: m.status, email_address: m.email } } : notFound("The requested resource could not be found.");
      if (method === "PUT") {
        const email = String(body?.email_address).toLowerCase();
        if (subscriberHash(email) !== member[1]) return { status: 400, body: { title: "Invalid Resource", detail: "Email does not match hash" } };
        const merge = (body?.merge_fields ?? {}) as Record<string, string>;
        const unknown = Object.keys(merge).filter((t) => !state.mergeFields.some((f) => f.tag === t));
        if (unknown.length) return { status: 400, body: { title: "Invalid Resource", detail: `Unknown merge fields: ${unknown.join(", ")}` } };
        if (m) m.merge = { ...m.merge, ...merge };
        else state.members.set(member[1]!, { email, status: (body?.status_if_new as MemberStatus) ?? "subscribed", merge });
        return { status: 200, body: {} };
      }
    }
    if (method === "GET" && rest === "/segments") return { status: 200, body: { segments: state.segments.map((s) => ({ id: s.id, name: s.name })) } };
    if (method === "POST" && rest === "/segments") {
      const seg = { id: state.segments.length + 101, name: String(body?.name), members: new Set<string>() };
      state.segments.push(seg);
      return { status: 200, body: { id: seg.id } };
    }
    const seg = rest.match(/^\/segments\/(\d+)(\/members)?$/);
    if (seg) {
      const s = state.segments.find((x) => x.id === Number(seg[1]));
      if (!s) return notFound("Segment not found");
      if (method === "GET" && seg[2]) return { status: 200, body: { members: [...s.members].map((e) => ({ email_address: e })), total_items: s.members.size } };
      if (method === "POST") {
        for (const e of (body?.members_to_add as string[]) ?? []) {
          const m = state.members.get(subscriberHash(e));
          if (m) s.members.add(m.email);
        }
        for (const e of (body?.members_to_remove as string[]) ?? []) s.members.delete(e.toLowerCase());
        return { status: 200, body: {} };
      }
    }
  }

  if (method === "POST" && path === "/campaigns") {
    const id = `cmp${state.campaigns.size + 1}`;
    const r = body?.recipients as { segment_opts?: { saved_segment_id?: number } };
    state.campaigns.set(id, { id, status: "save", segmentId: Number(r?.segment_opts?.saved_segment_id), settings: (body?.settings ?? {}) as Record<string, unknown>, tests: [] });
    return { status: 200, body: { id } };
  }
  const camp = path.match(/^\/campaigns\/([\w-]+)(\/.*)?$/);
  if (camp) {
    const c = state.campaigns.get(camp[1]!);
    if (!c) return notFound("Campaign not found");
    const rest = camp[2] ?? "";
    if (method === "GET" && rest === "") {
      const seg = state.segments.find((s) => s.id === c.segmentId);
      return { status: 200, body: { status: c.status, recipients: { recipient_count: seg ? [...seg.members].filter((e) => state.members.get(subscriberHash(e))?.status === "subscribed").length : 0 }, emails_sent: c.sentTo?.length ?? 0 } };
    }
    if (method === "PATCH" && rest === "") {
      if (c.status === "sent") return { status: 400, body: { title: "Bad Request", detail: "Campaign already sent" } };
      const r = body?.recipients as { segment_opts?: { saved_segment_id?: number } };
      c.segmentId = Number(r?.segment_opts?.saved_segment_id ?? c.segmentId);
      c.settings = { ...c.settings, ...((body?.settings ?? {}) as Record<string, unknown>) };
      return { status: 200, body: {} };
    }
    if (method === "PUT" && rest === "/content") {
      c.html = String(body?.html);
      return { status: 200, body: {} };
    }
    if (method === "POST" && rest === "/actions/test") {
      c.tests.push((body?.test_emails as string[]) ?? []);
      return { status: 204, body: {} };
    }
    if (method === "POST" && rest === "/actions/send") {
      if (c.status === "sent") return { status: 400, body: { title: "Bad Request", detail: "Campaign already sent" } };
      if (!c.html) return { status: 400, body: { title: "Bad Request", detail: "Your Campaign is not ready to send." } };
      const seg = state.segments.find((s) => s.id === c.segmentId);
      c.sentTo = seg ? [...seg.members].filter((e) => state.members.get(subscriberHash(e))?.status === "subscribed") : [];
      c.status = "sent";
      return { status: 204, body: {} };
    }
  }
  return notFound(`No fake for ${method} ${path}`);
}

/** A fetch() that talks to the fake, for unit tests. */
export function fakeFetch(state: FakeState): FetchLike {
  return async (url, init) => {
    const r = handle(state, init.method, new URL(url).pathname + new URL(url).search, init.body ? JSON.parse(init.body) : undefined);
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
}

/** The fake as an HTTP server, for end-to-end tests. GET /__state shows what it holds. */
export function startFakeServer(port: number, initial = newFakeState()): Server {
  let state = initial;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? "/";
      if (url.startsWith("/__reset") && req.method === "POST") {
        state = newFakeState(state.listId);
        return send(200, { ok: true });
      }
      if (url.startsWith("/__seed") && req.method === "POST") {
        const { members = [] } = JSON.parse(raw || "{}") as { members?: { email: string; status?: MemberStatus }[] };
        for (const m of members) seedMember(state, m.email, m.status);
        return send(200, { ok: true });
      }
      if (url.startsWith("/__state")) {
        return send(200, {
          mergeFields: state.mergeFields.map((f) => f.tag),
          members: [...state.members.values()],
          segments: state.segments.map((s) => ({ ...s, members: [...s.members] })),
          campaigns: [...state.campaigns.values()],
        });
      }
      const r = handle(state, req.method ?? "GET", url, raw ? JSON.parse(raw) : undefined);
      send(r.status, r.body);
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}
