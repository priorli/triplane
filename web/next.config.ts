import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",

  outputFileTracingIncludes: {
    "/**": [
      "./src/generated/prisma/**/*",
      "./node_modules/.prisma/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },

  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default withNextIntl(nextConfig);
