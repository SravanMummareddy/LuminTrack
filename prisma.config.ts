import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Used by `prisma migrate` / `prisma studio`. For Neon, use the DIRECT
  // (non-pooled) connection string. The app runtime connects separately via
  // the driver adapter in src/server/db.ts using the pooled DATABASE_URL.
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
