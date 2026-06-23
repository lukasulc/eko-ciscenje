import type { Locale } from "./siteSettings";

export const routeTranslations: Record<Locale, Record<string, string>> = {
  hr: {
    "about": "o-nama",
    "projects": "usluge",
    "project-1": "ciscenje-stanova",
    "project-2": "ciscenje-uredskih-prostora",
    // "reviews": "recenzije",
  },
  en: {
    "about": "about",
    "projects": "offerings",
    "project-1": "residential-cleaning",
    "project-2": "commercial-cleaning",
    // "reviews": "reviews",
  },
};

export const localizedCollections = {} as const;
