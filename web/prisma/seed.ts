// Triplane Prisma seed script.
//
// The base scaffold has nothing to seed (just the User model, which gets
// populated lazily on first authenticated request via `requireUser()`).
//
// Add seed data here as you add models in Phase 4 or in your downstream project.
// Run with: `bun run prisma db seed` (after configuring `prisma.seed` in package.json).

import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config({ path: ".env" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Triplane seed script — nothing to seed in the base scaffold.");
  console.log("Add seed data here as you add models.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
