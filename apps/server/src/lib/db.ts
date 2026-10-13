import { createDb } from "@gigstaxcf/db";

import { ENV } from "@/env.server";

/**
 * Request-scoped drizzle client over the PlanetScale (pooled) connection
 * injected by Alchemy. Module-level constant keeps the copied gigstax
 * services (`import { db } from "@/lib/db"`) unchanged.
 */
export const db = createDb(ENV);

export type Database = ReturnType<typeof createDb>;
