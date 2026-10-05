import type { Product } from "./catalog/types";
import type { Row } from "./import/sheet";
import type { CustomerItem, CustomerRecord } from "./import/types";
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

/** Simple product drawing as a data URI, so the demo needs no image host. */
function demoImage(label: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><rect width="360" height="360" fill="${tint}"/><g fill="none" stroke="#b08d57" stroke-width="6"><path d="M180 92l58 58-58 118-58-118z"/><path d="M122 150h116M150 92l30 58 30-58M180 150v118"/></g><text x="180" y="318" font-family="Georgia,serif" font-size="22" fill="#6b5a3a" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Synthetic catalog for the demo: every purchased SKU plus new-season items. */
export function demoCatalog(customers: CustomerRecord[]): Product[] {
  const purchased = new Map<string, CustomerItem>();
  for (const c of customers) for (const i of c.items) if (!purchased.has(i.sku) || (!purchased.get(i.sku)!.name && i.name)) purchased.set(i.sku, i);

  const products: Product[] = [];
  const newByCategory = new Map<string, string[]>();
  const categories = [...new Set([...purchased.values()].map((i) => i.category))].sort();
  categories.forEach((cat, ci) => {
    for (let k = 0; k < 3; k++) {
      const lab = k % 2 === 0;
      const sku = `${lab ? "L" : ""}NEW${ci}${k}-14WD`;
      const name = `${["Aurora", "Celeste", "Lumen"][k]} ${cat.replace(/s$/, "")}`;
      products.push({ sku, name, imageUrl: demoImage(name, "#eceff5"), productUrl: `https://store.example/products/${sku.toLowerCase()}`, category: cat, origin: lab ? "Lab grown" : "Natural", inStock: true, isNew: true });
      newByCategory.set(cat, [...(newByCategory.get(cat) ?? []), sku]);
    }
  });

  [...purchased.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .forEach((i, n) => {
      const outOfStock = n % 13 === 6;
      const successor = outOfStock && n % 2 === 0 ? newByCategory.get(i.category)?.[0] : undefined;
      // Most products the sales file couldn't describe are named in the catalog; one is not.
      const name = i.name || (n % 5 === 0 ? "" : `Classic ${i.category.replace(/s$/, "")} ${i.sku.split("-")[0]}`);
      products.push({
        sku: i.sku,
        name: name ? name.replace(/\s+/g, " ") : "",
        imageUrl: n % 9 === 4 ? undefined : demoImage(i.category, "#f2ede4"),
        productUrl: `https://store.example/products/${i.sku.toLowerCase()}`,
        category: i.category,
        origin: i.origin,
        inStock: !outOfStock,
        isNew: false,
        successorSku: successor,
      });
    });
  return products;
}
