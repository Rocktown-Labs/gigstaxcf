import { billingMeters, users } from "@gigstaxcf/db/schema";
import { Polar } from "@polar-sh/sdk";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/server-env";
import type { UsageMeterKey } from "@/lib/services/ai-usage";

interface TrackPolarUsageArgs {
  meterKey: UsageMeterKey;
  metadata?: Record<string, unknown>;
  units: number;
  userId: number;
}

const polarAccessToken = serverEnv.POLAR_ACCESS_TOKEN || "";
const polarServer =
  serverEnv.POLAR_SERVER === "sandbox" ? "sandbox" : "production";

const polarClient = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarServer,
    })
  : null;

const METER_KEY_TO_EVENT_NAME: Record<UsageMeterKey, string> = {
  ai_extract_credits: "gigstax.ai_extract_credit",
  bulk_upload_batches: "gigstax.bulk_upload_batch",
};

function fallbackMeterIdFromEnv(meterKey: UsageMeterKey) {
  if (meterKey === "ai_extract_credits") {
    return serverEnv.POLAR_AI_EXTRACT_METER_ID || null;
  }

  return serverEnv.POLAR_BULK_UPLOAD_METER_ID || null;
}

async function getUserExternalCustomerId(userId: number) {
  const [row] = await db
    .select({ authUserId: users.authUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.authUserId || null;
}

async function getMeterId(meterKey: UsageMeterKey) {
  const [row] = await db
    .select({ polarMeterId: billingMeters.polarMeterId })
    .from(billingMeters)
    .where(eq(billingMeters.key, meterKey))
    .limit(1);

  return row?.polarMeterId || fallbackMeterIdFromEnv(meterKey);
}

export async function trackPolarUsage(args: TrackPolarUsageArgs) {
  if (!polarClient) {
    return { reason: "polar_not_configured", tracked: false as const };
  }

  const units = Math.max(0, Math.floor(args.units));
  if (units <= 0) {
    return { reason: "zero_units", tracked: false as const };
  }

  const [externalCustomerId, meterId] = await Promise.all([
    getUserExternalCustomerId(args.userId),
    getMeterId(args.meterKey),
  ]);

  if (!externalCustomerId) {
    return { reason: "missing_external_customer", tracked: false as const };
  }

  if (!meterId) {
    return { reason: "missing_meter_id", tracked: false as const };
  }

  const now = new Date();
  const eventName = METER_KEY_TO_EVENT_NAME[args.meterKey];
  const events = Array.from({ length: units }).map((_, index) => ({
    externalCustomerId,
    externalId: `${args.meterKey}:${args.userId}:${now.getTime()}:${index}:${crypto.randomUUID()}`,
    metadata: {
      ...args.metadata,
      meter_id: meterId,
      meter_key: args.meterKey,
    },
    name: eventName,
    timestamp: now,
  }));

  await polarClient.events.ingest({ events });

  return {
    tracked: true as const,
    units,
  };
}

export async function upsertMeterPolarId(args: {
  meterKey: UsageMeterKey;
  polarMeterId: string;
}) {
  await db
    .update(billingMeters)
    .set({
      polarMeterId: args.polarMeterId,
      updatedAt: new Date(),
    })
    .where(eq(billingMeters.key, args.meterKey));
}

export async function getMeterPolarId(meterKey: UsageMeterKey) {
  const [row] = await db
    .select({ polarMeterId: billingMeters.polarMeterId })
    .from(billingMeters)
    .where(and(eq(billingMeters.key, meterKey)))
    .limit(1);

  return row?.polarMeterId || null;
}
