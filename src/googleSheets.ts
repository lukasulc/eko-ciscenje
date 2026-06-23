import fallbackOfferingsData from "./data/offerings.json";
import {
  OfferingsSchema,
  type OfferingCategory,
  type OfferingItem,
} from "./schemas";

const DEFAULT_GID = "0";

interface LocalizedText {
  hr: string;
  en: string;
}

export interface AstroOfferingsCategory {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface AstroOfferingItem {
  id: string;
  categoryId: string;
  page?: OfferingsPage;
  name: LocalizedText;
  description: LocalizedText;
  // keep price as string to support flexible pricing models
  price?: string;
  badges: {
    hr: string[];
    en: string[];
  };
  available: boolean;
  featured?: boolean;
}

export interface AstroOfferingsData {
  source: "sheet" | "fallback";
  currency: string;
  updatedAt: string;
  categories: AstroOfferingsCategory[];
  items: AstroOfferingItem[];
}

type OfferingsPage = "commercial" | "residential";

const categoryDetails: Record<
  OfferingCategory,
  Omit<AstroOfferingsCategory, "id">
> = {
  Included: {
    title: { hr: "Uključeno u cijenu", en: "Included in the price" },
    description: {
      hr: "Usluge koje su uključene u osnovnu cijenu čišćenja.",
      en: "Services included in the base cleaning price.",
    },
  },
  Optional: {
    title: { hr: "Opcionalno", en: "Optionals" },
    description: {
      hr: "Dodatne usluge koje se mogu naručiti uz osnovno čišćenje.",
      en: "Additional services that can be ordered with the base cleaning.",
    },
  },
};
const categoryOrder: OfferingCategory[] = ["Included", "Optional"];
let offeringsDataPromise: Promise<AstroOfferingsData> | undefined;

const offeringsPageCategories: Record<OfferingsPage, OfferingCategory[]> = {
  commercial: ["Included", "Optional"],
  residential: ["Included", "Optional"],
};

function getEnv(name: string): string | undefined {
  return import.meta.env[name] ?? process.env[name];
}

function getSpreadsheetId(): string | undefined {
  return getEnv("SPREADSHEET_ID") || getEnv("GOOGLE_SPREADSHEET_ID");
}

function getPublicCsvUrl(spreadsheetId: string): string {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
  );

  url.searchParams.set("format", "csv");
  url.searchParams.set("gid", getEnv("GOOGLE_SHEETS_GID") || DEFAULT_GID);

  return url.toString();
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function findHeaderIndex(headers: string[], field: string): number | undefined {
  const index = headers.indexOf(field);

  return index === -1 ? undefined : index;
}

function readOptionalCell(
  row: string[],
  index: number | undefined,
): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  return row[index] || undefined;
}

function rowsToOfferings(rows: string[][]): unknown[] {
  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map(normalizeHeader);
  const requiredFieldIndex = {
    name: headers.indexOf("name"),
    price: headers.indexOf("price"),
    category: headers.indexOf("category"),
  };
  const optionalFieldIndex = {
    description: findHeaderIndex(headers, "description"),
    badges: findHeaderIndex(headers, "badges"),
    opis: findHeaderIndex(headers, "opis"),
    znacke: findHeaderIndex(headers, "znacke"),
    page: findHeaderIndex(headers, "page"),
  };
  const missingFields = Object.entries(requiredFieldIndex)
    .filter(([, index]) => index === -1)
    .map(([field]) => field);

  if (missingFields.length > 0) {
    throw new Error(
      `Google Sheet is missing required columns: ${missingFields.join(", ")}`,
    );
  }

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => ({
      name: row[requiredFieldIndex.name] ?? "",
      price: row[requiredFieldIndex.price] ?? "",
      category: row[requiredFieldIndex.category] ?? "",
      description: readOptionalCell(row, optionalFieldIndex.description),
      badges: readOptionalCell(row, optionalFieldIndex.badges),
      opis: readOptionalCell(row, optionalFieldIndex.opis),
      znacke: readOptionalCell(row, optionalFieldIndex.znacke),
      page: readOptionalCell(row, optionalFieldIndex.page),
    }));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseBadges(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,]/)
    .map((badge) => badge.trim())
    .filter(Boolean);
}

export function getOfferingsPageCategoryIds(
  offeringsData: AstroOfferingsData,
  page: OfferingsPage,
): string[] {
  const categoryIds = offeringsPageCategories[page];

  if (!categoryIds) {
    console.warn(`Unknown offerings page requested: ${page}`);
    return [];
  }

  return offeringsData.categories
    .filter((category) => categoryIds.includes(category.id as OfferingCategory))
    .map((category) => category.id);
}

export function getFallbackOfferingsData(): AstroOfferingsData {
  return {
    source: "fallback",
    currency: fallbackOfferingsData.currency,
    updatedAt: fallbackOfferingsData.updatedAt,
    categories: fallbackOfferingsData.categories,
    items: fallbackOfferingsData.items.map((item) => ({
      ...item,
      price: item.price,
    })),
  };
}

export async function getValidatedSheetOfferings(): Promise<
  OfferingItem[] | undefined
> {
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    return undefined;
  }

  const response = await fetch(getPublicCsvUrl(spreadsheetId));

  if (!response.ok) {
    throw new Error(
      `Google Sheet CSV fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const validation = OfferingsSchema.safeParse(
    rowsToOfferings(parseCsv(await response.text())),
  );

  if (!validation.success) {
    // log issues so a developer can fix the sheet.
    console.warn(
      `Google Sheet offerings validation failed with ${validation.error.issues.length} issue(s):`,
      validation.error.issues,
    );
    throw new Error(
      `Google Sheet offerings validation failed with ${validation.error.issues.length} issue(s).`,
    );
  }

  return validation.data;
}

async function loadAstroOfferingsData(): Promise<AstroOfferingsData> {
  let items: OfferingItem[] | undefined;

  try {
    items = await getValidatedSheetOfferings();
  } catch (error) {
    console.warn(
      `Google Sheet offerings could not be used. Falling back to src/data/offerings.json. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return getFallbackOfferingsData();
  }

  if (!items) {
    return getFallbackOfferingsData();
  }

  const usedCategories = categoryOrder.filter((category) =>
    items.some((item) => item.category === category),
  );

  return {
    source: "sheet",
    currency: "EUR",
    updatedAt: new Date().toISOString().slice(0, 10),
    categories: usedCategories.map((id) => ({
      id,
      ...categoryDetails[id],
    })),
    items: items.map((item, index) => ({
      id: `${slugify(item.name) || "offering-item"}-${index + 1}`,
      categoryId: item.category,
      page: item.page,
      name: { hr: item.name, en: item.name },
      description: {
        hr: item.opis ?? "",
        en: item.description ?? "",
      },
      price: item.price,
      badges: {
        hr: parseBadges(item.znacke),
        en: parseBadges(item.badges),
      },
      available: true,
    })),
  };
}

export async function getOfferingsData(): Promise<AstroOfferingsData> {
  offeringsDataPromise ??= loadAstroOfferingsData();

  return offeringsDataPromise;
}
