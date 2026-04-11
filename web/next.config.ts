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

  images: {
    // Presigned GET URLs from Tigris include a signed query string; set
    // search:"" so next/image passes them through without rejecting the
    // query string. Swap the hostname for your own bucket host in production.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fly.storage.tigris.dev",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "*.fly.storage.tigris.dev",
        pathname: "/**",
        search: "",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
