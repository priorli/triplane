import { defineRouting } from "next-intl/routing";

export const locales = ["en-US"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en-US";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
