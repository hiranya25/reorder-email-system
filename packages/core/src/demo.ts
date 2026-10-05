import type { Row } from "./import/sheet";
import type { Campaign } from "./types";

/**
 * Synthetic demo campaign shown before anything is uploaded. It runs through the
 * same import pipeline as a real file. No real customer data lives in the repo.
 */
export const DEMO_CAMPAIGN: Campaign = {
  id: "demo",
  name: "Holiday 2026 Reorder",
  seasonStart: "2025-10-01",
  seasonEnd: "2026-01-31",
  status: "imported",
  fileName: "demo_sales_export.csv",
  createdAt: "2026-10-01T09:00:00.000Z",
  isDemo: true,
};

export const DEMO_HEADERS = ["Account_id", "Customer Name", "email", "trans_dt - Month", "origin", "Trans_qty", "Item Category", "item_id", "style_desc", "Assigned Sales Rep"];

/** Small seeded PRNG so the demo is identical on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST = ["Oliver", "Maya", "Daniel", "Priya", "Grace", "Leo", "Nora", "Samuel", "Ava", "Isaac", "Clara", "Ethan", "Hannah", "Felix", "Ruby", "Owen", "Iris", "Jonah", "Lena", "Miles"];
const BRANDS = ["Northwind", "Harbor & Vale", "Silverline", "Aurora", "Bellmont", "Copperfield", "Driftwood", "Evergreen", "Fairhaven", "Goldcrest", "Hollis", "Ironwood", "Juniper", "Kingsley", "Lakeside", "Marlowe", "Newbury", "Oakridge", "Pembrook", "Quarry Lane", "Redfern", "Stonebridge", "Thornton", "Union Square", "Valemont", "Westbrook", "Yardley", "Zenith", "Ashford", "Brightwater", "Cedar Point", "Dunmore", "Elmhurst", "Foxglove", "Glenview", "Hawthorne"];
const SUFFIX = ["Jewelers", "Fine Jewelry", "& Co", "Diamonds", "Jewelers Inc", "Gallery"];
const REPS = ["JYOTI", "JOHNNY", "CS-AM", "S1-CS2", "ADIT-AM", "COMPANY"];
const MONTHS = ["October", "November", "December", "January"];
const CATS: { cat: string; code: string; styles: string[] }[] = [
  { cat: "BRACELET", code: "B4", styles: ["ct Round Classic Tennis Bracelet", "ct Full-Way Tennis Bracelet", "ct Oval Tennis Bracelet"] },
  { cat: "STUDS", code: "ES3", styles: ["ct Martini Solitaire Studs", "ct Basket Studs"] },
  { cat: "NECKLACE", code: "N2", styles: ["ct Riviera Necklace", "ct Graduated Necklace"] },
  { cat: "BAND", code: "BD1", styles: ["ct Eternity Band", "ct Half-Way Band"] },
  { cat: "HOOPS", code: "H5", styles: ["ct Inside-Out Hoops", "ct Huggie Hoops"] },
  { cat: "rings", code: "R6", styles: ["ct Halo Ring"] },
  { cat: "BANGLE", code: "BG7", styles: ["ct Bangle"] },
  { cat: "pendant", code: "P8", styles: ["ct Solitaire Pendant"] },
];
const METALS = ["14WD", "14YD", "14WNA", "PTA"];

/** Builds the demo export as a sheet (header row first). */
export function demoSheet(): Row[] {
  const rand = rng(20261001);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const rows: Row[] = [DEMO_HEADERS];
  const n = 72;

  for (let i = 0; i < n; i++) {
    const id = String(1000 + i * 37);
    const brand = BRANDS[i % BRANDS.length]!;
    const name = `${brand}${i >= BRANDS.length ? " Branch 1" : ""} ${SUFFIX[i % SUFFIX.length]}`.replace(" Branch 1 ", " Branch 1 ");
    const first = FIRST[i % FIRST.length]!.toLowerCase();
    const domain = `${brand.toLowerCase().replace(/[^a-z]/g, "")}.example`;
    let email = `${first}@${domain}`;
    if (i % 9 === 4) email = `info@${domain}`; // generic inbox
    if (i % 23 === 7) email = `sales@${domain}`;
    if (i === 10) email = `${first}@${domain}; buyer@${domain}`; // two emails in one field
    if (i === BRANDS.length) email = `oliver@northwind.example`; // shares email with account 0
    if (i % 17 === 13) email = ""; // no email on file
    const rep = REPS[i % REPS.length]!;
    // Most buy 1-4 products; a few large accounts buy 20+.
    const products = i % 25 === 3 ? 22 + (i % 5) : rand() < 0.4 ? 1 : rand() < 0.4 ? 2 : 3 + Math.floor(rand() * 3);
    const cat0 = pick(CATS);
    for (let p = 0; p < products; p++) {
      const c = p === 0 || rand() < 0.5 ? cat0 : pick(CATS);
      const lab = rand() < 0.62;
      const size = 1 + Math.floor(rand() * 8);
      const sku = `${lab ? "L" : ""}${c.code}${String(size).padStart(2, "0")}${Math.floor(rand() * 5)}0-${pick(METALS)}`;
      const style = (i * 7 + p) % 41 === 5 ? "" : `${size} ${pick(c.styles)}`; // a few lines with no description
      const lines = rand() < 0.15 ? 2 : 1; // repeat orders across months
      for (let l = 0; l < lines; l++) {
        rows.push([id, name, email, pick(MONTHS), lab ? "Lab Grown" : "Natural", 1 + (rand() < 0.2 ? Math.floor(rand() * 4) : 0), c.cat, sku, style, rep]);
      }
    }
  }
  const total = rows.slice(1).reduce((s, r) => s + Number(r[5]), 0);
  rows.push(["Total", null, null, null, null, total, null, null, null, null]);
  return rows;
}
