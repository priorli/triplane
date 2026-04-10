import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Load message bundles. Add new namespace imports as you create them.
  const common = (await import(`@/messages/${locale}/common.json`)).default;
  const landing = (await import(`@/messages/${locale}/landing.json`)).default;

  return {
    locale,
    messages: { common, landing },
  };
});
