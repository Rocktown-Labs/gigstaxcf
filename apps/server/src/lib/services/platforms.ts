import { platforms, userPlatforms } from "@gigstaxcf/db/schema";
import { and, asc, eq, inArray, notInArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureDefaultPlatforms } from "@/lib/db/platform-seed";

const HEX_COLOR_REGEX = /^#(?<hex>[0-9a-fA-F]{6})$/u;
const DEFAULT_PLATFORM_COLOR = "#22c55e";

export interface PlatformSelectionInput {
  colorHex?: string;
  displayName?: string;
  slug?: string;
}

export interface PlatformOption {
  colorHex: string;
  displayName: string;
  id: number;
  isCustom: boolean;
  selected: boolean;
  slug: string;
}

export interface UserPlatformState {
  availablePlatforms: PlatformOption[];
  selectedPlatforms: PlatformOption[];
}

const formatDisplayNameFromSlug = (slug: string) =>
  slug
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length > 1
        ? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
        : segment.toUpperCase()
    )
    .join(" ");

const normalizeHexColor = (
  colorHex: string | null | undefined,
  fallback = DEFAULT_PLATFORM_COLOR
) => {
  if (!colorHex) {
    return fallback;
  }

  const normalized = colorHex.trim();
  const prefixed = normalized.startsWith("#") ? normalized : `#${normalized}`;

  if (!HEX_COLOR_REGEX.test(prefixed)) {
    return fallback;
  }

  return prefixed.toLowerCase();
};

const slugifyPlatformName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 48);

async function createCustomPlatform(args: {
  colorHex: string;
  displayName: string;
  userId: number;
}) {
  const baseSlug = slugifyPlatformName(args.displayName) || "custom_platform";
  const customSlug = `${baseSlug}_${args.userId}_${crypto.randomUUID().slice(0, 8)}`;

  const [created] = await db
    .insert(platforms)
    .values({
      colorHex: normalizeHexColor(args.colorHex),
      createdByUserId: args.userId,
      displayName: args.displayName.trim(),
      isActive: true,
      isSystem: false,
      slug: customSlug,
    })
    .returning({
      colorHex: platforms.colorHex,
      displayName: platforms.displayName,
      id: platforms.id,
      slug: platforms.slug,
    });

  if (!created) {
    throw new Error("Failed to create custom platform");
  }

  return created;
}

async function loadPlatformState(userId: number): Promise<UserPlatformState> {
  await ensureDefaultPlatforms();

  const [availableRows, selectedRows] = await Promise.all([
    db
      .select({
        colorHex: platforms.colorHex,
        displayName: platforms.displayName,
        id: platforms.id,
        isSystem: platforms.isSystem,
        slug: platforms.slug,
      })
      .from(platforms)
      .where(
        and(
          eq(platforms.isActive, true),
          or(
            eq(platforms.isSystem, true),
            eq(platforms.createdByUserId, userId)
          )
        )
      )
      .orderBy(asc(platforms.displayName)),
    db
      .select({
        colorHex: userPlatforms.colorHex,
        displayName: platforms.displayName,
        id: platforms.id,
        isSystem: platforms.isSystem,
        slug: platforms.slug,
      })
      .from(userPlatforms)
      .innerJoin(platforms, eq(userPlatforms.platformId, platforms.id))
      .where(
        and(
          eq(userPlatforms.userId, userId),
          eq(userPlatforms.isActive, true),
          eq(platforms.isActive, true)
        )
      )
      .orderBy(asc(platforms.displayName)),
  ]);

  const selectedById = new Map(
    selectedRows.map((row) => [
      row.id,
      {
        colorHex: normalizeHexColor(row.colorHex, row.colorHex),
        displayName: row.displayName,
        id: row.id,
        isCustom: !row.isSystem,
        selected: true,
        slug: row.slug,
      } satisfies PlatformOption,
    ])
  );

  const availablePlatforms = availableRows.map((row) => {
    const selected = selectedById.get(row.id);

    return {
      colorHex: selected?.colorHex || normalizeHexColor(row.colorHex),
      displayName: row.displayName,
      id: row.id,
      isCustom: !row.isSystem,
      selected: selected !== undefined,
      slug: row.slug,
    } satisfies PlatformOption;
  });

  const selectedPlatforms = availablePlatforms.filter(
    (option) => option.selected
  );

  return {
    availablePlatforms,
    selectedPlatforms,
  };
}

export function getUserPlatformState(userId: number) {
  return loadPlatformState(userId);
}

export async function getUserPlatformOptions(userId: number) {
  const state = await loadPlatformState(userId);
  if (state.selectedPlatforms.length > 0) {
    return state.selectedPlatforms;
  }

  return state.availablePlatforms;
}

export async function syncUserPlatformSelections(
  userId: number,
  selections: PlatformSelectionInput[]
): Promise<UserPlatformState> {
  await ensureDefaultPlatforms();

  const deduped = new Map<string, PlatformSelectionInput>();

  for (const selection of selections) {
    const slug = selection.slug?.trim().toLowerCase();
    const displayName = selection.displayName?.trim();

    if (!slug && !displayName) {
      continue;
    }

    const dedupeKey = slug
      ? `slug:${slug}`
      : `name:${displayName?.toLowerCase()}`;
    deduped.set(dedupeKey, {
      colorHex: normalizeHexColor(selection.colorHex),
      displayName,
      slug,
    });
  }

  if (deduped.size === 0) {
    throw new Error("At least one platform selection is required.");
  }

  const normalizedSelections = [...deduped.values()];
  const knownSlugs = normalizedSelections
    .map((selection) => selection.slug)
    .filter((slug): slug is string => slug !== undefined);

  const existingRows = knownSlugs.length
    ? await db
        .select({
          colorHex: platforms.colorHex,
          displayName: platforms.displayName,
          id: platforms.id,
          slug: platforms.slug,
        })
        .from(platforms)
        .where(
          and(
            inArray(platforms.slug, knownSlugs),
            or(
              eq(platforms.isSystem, true),
              eq(platforms.createdByUserId, userId)
            )
          )
        )
    : [];

  const existingBySlug = new Map(existingRows.map((row) => [row.slug, row]));
  const now = new Date();
  const selectedByPlatformId = new Map<number, string>();

  for (const selection of normalizedSelections) {
    const selectionColor = normalizeHexColor(selection.colorHex);
    let platformRow = selection.slug
      ? existingBySlug.get(selection.slug)
      : undefined;

    if (!platformRow) {
      const displayName =
        selection.displayName ||
        (selection.slug ? formatDisplayNameFromSlug(selection.slug) : "Other");

      const [createdPlatform] = await db
        .insert(platforms)
        .values({
          colorHex: selectionColor,
          createdByUserId: userId,
          displayName,
          isActive: true,
          isSystem: false,
          slug: `${slugifyPlatformName(displayName) || "custom_platform"}_${userId}_${crypto.randomUUID().slice(0, 8)}`,
        })
        .returning({
          colorHex: platforms.colorHex,
          displayName: platforms.displayName,
          id: platforms.id,
          slug: platforms.slug,
        });

      if (!createdPlatform) {
        throw new Error("Failed to create platform");
      }

      platformRow = createdPlatform;
      existingBySlug.set(createdPlatform.slug, createdPlatform);
    }

    selectedByPlatformId.set(platformRow.id, selectionColor);
  }

  for (const [platformId, colorHex] of selectedByPlatformId) {
    await db
      .insert(userPlatforms)
      .values({
        colorHex,
        isActive: true,
        platformId,
        updatedAt: now,
        userId,
      })
      .onConflictDoUpdate({
        set: {
          colorHex,
          isActive: true,
          updatedAt: now,
        },
        target: [userPlatforms.userId, userPlatforms.platformId],
      });
  }

  const selectedPlatformIds = [...selectedByPlatformId.keys()];
  await db
    .update(userPlatforms)
    .set({
      isActive: false,
      updatedAt: now,
    })
    .where(
      and(
        eq(userPlatforms.userId, userId),
        notInArray(userPlatforms.platformId, selectedPlatformIds)
      )
    );

  return loadPlatformState(userId);
}

export async function createUserCustomPlatform(args: {
  colorHex: string;
  displayName: string;
  userId: number;
}) {
  const created = await createCustomPlatform(args);

  await db
    .insert(userPlatforms)
    .values({
      colorHex: normalizeHexColor(args.colorHex, created.colorHex),
      isActive: true,
      platformId: created.id,
      updatedAt: new Date(),
      userId: args.userId,
    })
    .onConflictDoUpdate({
      set: {
        colorHex: normalizeHexColor(args.colorHex, created.colorHex),
        isActive: true,
        updatedAt: new Date(),
      },
      target: [userPlatforms.userId, userPlatforms.platformId],
    });

  return created;
}
