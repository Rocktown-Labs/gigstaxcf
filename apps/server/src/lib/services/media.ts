import { entryMedia, expenseMedia, mediaAssets } from "@gigstaxcf/db/schema";
import { and, eq } from "drizzle-orm";

import { ENV } from "@/env.server";
import { db } from "@/lib/db";

type MediaKind = "entry_screenshot" | "expense_receipt";
interface UploadFileToBlobOptions {
  kind: MediaKind;
  userId: number;
}

interface CreateMediaInput {
  userId: number;
  kind: MediaKind;
  storageProvider?: string;
  storageUrl: string;
  storageKey?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  capturedAt?: string | null;
}

interface MediaAssetUrlInput {
  id: number;
  storageProvider: string;
  storageUrl: string;
}

const PRIVATE_MEDIA_ROUTE_PREFIX = "/api/media";
const PRIVATE_BLOB_ROUTE_PREFIX = "/api/media";

export const R2_MEDIA_PROVIDER = "r2";
export const LEGACY_VERCEL_BLOB_PROVIDER = "vercel_blob";
export const PRIVATE_VERCEL_BLOB_PROVIDER = "vercel_blob_private";
export const PUBLIC_VERCEL_BLOB_PROVIDER = "vercel_blob_public";
export type VercelBlobStorageProvider =
  | typeof LEGACY_VERCEL_BLOB_PROVIDER
  | typeof PRIVATE_VERCEL_BLOB_PROVIDER
  | typeof PUBLIC_VERCEL_BLOB_PROVIDER;

export const isVercelBlobProvider = (storageProvider: string) =>
  storageProvider === LEGACY_VERCEL_BLOB_PROVIDER ||
  storageProvider === PRIVATE_VERCEL_BLOB_PROVIDER ||
  storageProvider === PUBLIC_VERCEL_BLOB_PROVIDER;

const isPrivateMediaProvider = (storageProvider: string) =>
  storageProvider === R2_MEDIA_PROVIDER ||
  storageProvider === LEGACY_VERCEL_BLOB_PROVIDER ||
  storageProvider === PRIVATE_VERCEL_BLOB_PROVIDER;

/**
 * Resolve the URL a client (or the AI pipeline) should use to fetch a media
 * asset. R2 and private legacy blobs are streamed through the authenticated
 * `/api/media/[id]` route; public legacy blobs keep their stored URL.
 */
export const resolveMediaAssetUrl = (input: MediaAssetUrlInput) =>
  isPrivateMediaProvider(input.storageProvider)
    ? `${PRIVATE_MEDIA_ROUTE_PREFIX}/${input.id}`
    : input.storageUrl;

const sanitizeFilename = (filename: string) => {
  const trimmed = filename.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  const base = (dot === -1 ? trimmed : trimmed.slice(0, dot))
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 60);
  const extension = (dot === -1 ? "" : trimmed.slice(dot))
    .replaceAll(/[^.a-z0-9]/gu, "")
    .slice(0, 10);

  const safeBase = base.length > 0 ? base : "upload";
  return `${safeBase}${extension}`;
};

const buildStoragePath = ({
  file,
  kind,
  userId,
}: {
  file: File;
  kind: MediaKind;
  userId: number;
}) => {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const random = crypto.randomUUID();
  const safeName = sanitizeFilename(file.name || "upload");

  return `${kind}/${userId}/${datePrefix}/${random}-${safeName}`;
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const r2Bucket = () => {
  const bucket = (ENV as Record<string, unknown>).MEDIA as R2Bucket | undefined;
  if (!bucket) {
    throw new Error("MEDIA (R2 bucket) binding is not configured");
  }
  return bucket;
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x80_00;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

/**
 * Upload a media file to R2. The Vercel Blob name is kept for continuity
 * with the ported call sites; there is no Vercel dependency anymore.
 */
export async function uploadFileToBlob(
  file: File,
  options: UploadFileToBlobOptions
) {
  const storagePath = buildStoragePath({
    file,
    kind: options.kind,
    userId: options.userId,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());

  await r2Bucket().put(storagePath, bytes, {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
  });

  return {
    blob: {
      pathname: storagePath,
      url: `r2://${storagePath}`,
    },
    buffer: bytes,
    byteSize: file.size || bytes.byteLength,
    mimeType: file.type || null,
    sha256: await sha256Hex(bytes),
    storagePath,
    storageProvider: R2_MEDIA_PROVIDER,
  };
}

/** Read stored object bytes (media serving + AI analysis). */
export async function getMediaBytes(storageKey: string | null | undefined) {
  if (!storageKey) {
    return null;
  }
  const object = await r2Bucket().get(storageKey);
  if (!object) {
    return null;
  }
  return {
    bytes: new Uint8Array(await object.arrayBuffer()),
    mimeType: object.httpMetadata?.contentType ?? null,
  };
}

export async function deleteMediaObject(storageKey: string | null | undefined) {
  if (!storageKey) {
    return;
  }
  await r2Bucket().delete(storageKey);
}

export async function createMediaAsset(input: CreateMediaInput) {
  const [existing] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.userId, input.userId),
        eq(mediaAssets.kind, input.kind),
        eq(mediaAssets.storageUrl, input.storageUrl)
      )
    )
    .limit(1);

  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : null;

  if (existing) {
    const [updated] = await db
      .update(mediaAssets)
      .set({
        byteSize: input.byteSize || null,
        capturedAt: capturedAt || existing.capturedAt,
        mimeType: input.mimeType || null,
        sha256: input.sha256 || null,
        storageKey: input.storageKey || null,
        storageProvider: input.storageProvider || LEGACY_VERCEL_BLOB_PROVIDER,
      })
      .where(eq(mediaAssets.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update media asset");
    }

    return updated;
  }

  const [created] = await db
    .insert(mediaAssets)
    .values({
      byteSize: input.byteSize || null,
      capturedAt,
      kind: input.kind,
      mimeType: input.mimeType || null,
      sha256: input.sha256 || null,
      storageKey: input.storageKey || null,
      storageProvider: input.storageProvider || LEGACY_VERCEL_BLOB_PROVIDER,
      storageUrl: input.storageUrl,
      userId: input.userId,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create media asset");
  }

  return created;
}

export async function linkMediaToEntry(
  entryId: number,
  mediaId: number,
  isPrimary = true
) {
  const [row] = await db
    .insert(entryMedia)
    .values({
      entryId,
      isPrimary,
      mediaId,
    })
    .onConflictDoUpdate({
      set: { isPrimary },
      target: [entryMedia.entryId, entryMedia.mediaId],
    })
    .returning();

  return row;
}

export async function linkMediaToExpense(
  expenseId: number,
  mediaId: number,
  isPrimary = true
) {
  const [row] = await db
    .insert(expenseMedia)
    .values({
      expenseId,
      isPrimary,
      mediaId,
    })
    .onConflictDoUpdate({
      set: { isPrimary },
      target: [expenseMedia.expenseId, expenseMedia.mediaId],
    })
    .returning();

  return row;
}

export { PRIVATE_BLOB_ROUTE_PREFIX };

/**
 * Load a media asset owned by the user (used by the /api/media/[id]
 * route ported from the gigstax Next.js app).
 */
export async function getMediaAssetForUser(
  userId: number,
  mediaId: number
): Promise<{
  id: number;
  mimeType: string | null;
  sha256: string | null;
  storageKey: string | null;
  storageProvider: string;
  storageUrl: string;
} | null> {
  const [media] = await db
    .select({
      id: mediaAssets.id,
      mimeType: mediaAssets.mimeType,
      sha256: mediaAssets.sha256,
      storageKey: mediaAssets.storageKey,
      storageProvider: mediaAssets.storageProvider,
      storageUrl: mediaAssets.storageUrl,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId)))
    .limit(1);

  return media ?? null;
}

/**
 * Delete a media asset owned by the user: removes the stored object and
 * the database row (entry/expense links cascade). Exposed as
 * DELETE /api/media/[id] (no equivalent existed in the gigstax Next.js
 * app, so this mirrors the route contract the ported server expects).
 */
export async function deleteMediaAssetForUser(userId: number, mediaId: number) {
  const [deleted] = await db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.userId, userId)))
    .returning({ id: mediaAssets.id });

  return deleted ?? null;
}
