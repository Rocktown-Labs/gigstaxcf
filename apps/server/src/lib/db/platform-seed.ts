import { platforms } from "@gigstaxcf/db/schema";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const DEFAULT_PLATFORMS = [
  { colorHex: "#2563eb", displayName: "Walmart Spark", slug: "walmart_spark" },
  { colorHex: "#10b981", displayName: "Uber Eats", slug: "uber_eats" },
  { colorHex: "#111111", displayName: "Uber", slug: "uber" },
  { colorHex: "#ec4899", displayName: "Lyft", slug: "lyft" },
  { colorHex: "#ef4444", displayName: "DoorDash", slug: "doordash" },
  { colorHex: "#16a34a", displayName: "Instacart", slug: "instacart" },
  { colorHex: "#f97316", displayName: "Grubhub", slug: "grubhub" },
  { colorHex: "#14b8a6", displayName: "Shipt", slug: "shipt" },
  { colorHex: "#f59e0b", displayName: "Amazon Flex", slug: "amazon_flex" },
  { colorHex: "#8b5cf6", displayName: "Roadie", slug: "roadie" },
  { colorHex: "#64748b", displayName: "Other", slug: "other" },
];

let ensureDefaultPlatformsPromise: Promise<void> | null = null;

export function ensureDefaultPlatforms() {
  if (ensureDefaultPlatformsPromise) {
    return ensureDefaultPlatformsPromise;
  }

  ensureDefaultPlatformsPromise = (async () => {
    await db
      .insert(platforms)
      .values(DEFAULT_PLATFORMS)
      .onConflictDoUpdate({
        set: {
          colorHex: sql`excluded.color_hex`,
          displayName: sql`excluded.display_name`,
        },
        target: platforms.slug,
      });
    await db.execute(sql`
      INSERT INTO "user_platforms" (
        "user_id",
        "platform_id",
        "color_hex",
        "is_active",
        "updated_at"
      )
      SELECT DISTINCT
        e."user_id",
        e."platform_id",
        p."color_hex",
        true,
        now()
      FROM "earnings_entries" e
      INNER JOIN "platforms" p
        ON p."id" = e."platform_id"
      ON CONFLICT ("user_id", "platform_id")
      DO NOTHING
    `);
  })().catch((error) => {
    ensureDefaultPlatformsPromise = null;
    throw error;
  });

  return ensureDefaultPlatformsPromise;
}
