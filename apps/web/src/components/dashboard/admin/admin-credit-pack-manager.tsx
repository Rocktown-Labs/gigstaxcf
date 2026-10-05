import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PencilLine } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";

interface AdminCreditPack {
  credits: number;
  currencyCode: string;
  description: string;
  displayName: string;
  id: number;
  isActive: boolean;
  lastSyncedAt: string | null;
  polarPriceId: string | null;
  polarProductId: string | null;
  priceCents: number;
  slug: string;
  sortOrder: number;
}

interface PackDraft {
  credits: string;
  currencyCode: string;
  description: string;
  displayName: string;
  isActive: boolean;
  polarPriceId: string;
  polarProductId: string;
  priceCents: string;
  sortOrder: string;
}

const EMPTY_DRAFT: PackDraft = {
  credits: "0",
  currencyCode: "USD",
  description: "",
  displayName: "",
  isActive: true,
  polarPriceId: "",
  polarProductId: "",
  priceCents: "0",
  sortOrder: "0",
};

function toDraft(pack: AdminCreditPack): PackDraft {
  return {
    credits: String(pack.credits || 0),
    currencyCode: pack.currencyCode || "USD",
    description: pack.description || "",
    displayName: pack.displayName || "",
    isActive: pack.isActive,
    polarPriceId: pack.polarPriceId || "",
    polarProductId: pack.polarProductId || "",
    priceCents: String(pack.priceCents || 0),
    sortOrder: String(pack.sortOrder || 0),
  };
}

function isDraftDirty(pack: AdminCreditPack, draft: PackDraft) {
  const baseline = toDraft(pack);

  return (
    baseline.credits !== draft.credits ||
    baseline.currencyCode !== draft.currencyCode ||
    baseline.description !== draft.description ||
    baseline.displayName !== draft.displayName ||
    baseline.isActive !== draft.isActive ||
    baseline.polarPriceId !== draft.polarPriceId ||
    baseline.polarProductId !== draft.polarProductId ||
    baseline.priceCents !== draft.priceCents ||
    baseline.sortOrder !== draft.sortOrder
  );
}

function formatMoney(pack: AdminCreditPack) {
  const amount = pack.priceCents / 100;

  try {
    return new Intl.NumberFormat("en-US", {
      currency: pack.currencyCode || "USD",
      style: "currency",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatShortId(value: string | null) {
  if (!value) {
    return "not set";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatLastSyncedAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "never";
}

const omitDraftKey = (
  record: Record<number, PackDraft>,
  key: number
): Record<number, PackDraft> => {
  const next: Record<number, PackDraft> = {};
  for (const [recordKey, value] of Object.entries(record)) {
    if (Number(recordKey) !== key) {
      next[Number(recordKey)] = value;
    }
  }
  return next;
};

export function AdminCreditPackManager() {
  const queryClient = useQueryClient();
  const [draftsById, setDraftsById] = useState<Record<number, PackDraft>>({});
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);

  const packsQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/admin/pricing/packs");
      if (!response.ok) {
        throw new Error("Failed to load credit packs");
      }

      const payload = (await response.json()) as { packs: AdminCreditPack[] };
      return payload.packs || [];
    },
    queryKey: ["admin-pricing-packs"],
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const sortedPacks = useMemo(() => {
    const packs = packsQuery.data ?? [];
    return [...packs].sort((left, right) => left.sortOrder - right.sortOrder);
  }, [packsQuery.data]);

  const selectedPack = useMemo(() => {
    if (selectedPackId === null) {
      return null;
    }

    return sortedPacks.find((pack) => pack.id === selectedPackId) ?? null;
  }, [selectedPackId, sortedPacks]);

  const patchMutation = useMutation({
    mutationFn: async (args: {
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const response = await apiFetch(`/api/admin/pricing/packs/${args.id}`, {
        body: JSON.stringify(args.patch),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        pack?: AdminCreditPack;
      };

      if (!response.ok || !payload.pack) {
        throw new Error(payload.error || "Failed to save pack");
      }

      return payload.pack;
    },
    onSuccess: (updatedPack) => {
      queryClient.setQueryData<AdminCreditPack[]>(
        ["admin-pricing-packs"],
        (current) => {
          const packs = current ?? [];
          return packs.map((pack) =>
            pack.id === updatedPack.id ? updatedPack : pack
          );
        }
      );

      setDraftsById((current) => omitDraftKey(current, updatedPack.id));
      setError("");
      setFeedback("Credit pack updated.");
    },
  });

  const resolveDraft = (pack: AdminCreditPack) =>
    draftsById[pack.id] || toDraft(pack);

  const setDraftValue = (packId: number, patch: Partial<PackDraft>) => {
    setDraftsById((current) => {
      const pack = (packsQuery.data ?? []).find((item) => item.id === packId);
      const currentDraft =
        current[packId] || (pack ? toDraft(pack) : EMPTY_DRAFT);

      return {
        ...current,
        [packId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const savePack = async (pack: AdminCreditPack) => {
    const draft = resolveDraft(pack);

    await patchMutation.mutateAsync({
      id: pack.id,
      patch: {
        credits: Math.max(0, Number.parseInt(draft.credits, 10) || 0),
        currencyCode: draft.currencyCode.trim().toUpperCase(),
        description: draft.description.trim(),
        displayName: draft.displayName.trim(),
        isActive: draft.isActive,
        polarPriceId: draft.polarPriceId.trim() || null,
        polarProductId: draft.polarProductId.trim() || null,
        priceCents: Math.max(0, Number.parseInt(draft.priceCents, 10) || 0),
        sortOrder: Math.max(0, Number.parseInt(draft.sortOrder, 10) || 0),
      },
    });
  };

  const selectedDraft = selectedPack ? resolveDraft(selectedPack) : null;
  const selectedDirty =
    selectedPack && selectedDraft
      ? isDraftDirty(selectedPack, selectedDraft)
      : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Credit Packs
        </p>
      </div>

      {feedback ? (
        <p className="bg-primary/10 text-primary rounded-lg p-3 text-sm">
          {feedback}
        </p>
      ) : null}

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </p>
      ) : null}

      {packsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading credit packs...</p>
      ) : null}

      {packsQuery.isError ? (
        <p className="text-destructive text-sm">Failed to load credit packs.</p>
      ) : null}

      {!packsQuery.isLoading && !packsQuery.isError ? (
        <div className="-mx-1 overflow-x-auto pb-2">
          <div className="flex snap-x snap-mandatory gap-4 px-1">
            {sortedPacks.map((pack) => {
              const isSynced =
                Boolean(pack.polarPriceId) &&
                Boolean(pack.polarProductId) &&
                Boolean(pack.lastSyncedAt);

              return (
                <article
                  key={pack.id}
                  className="border-border/60 from-card to-card/70 w-[320px] shrink-0 snap-start rounded-2xl border bg-gradient-to-b p-4 shadow-lg shadow-black/15"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base leading-tight font-semibold">
                        {pack.displayName}
                      </p>
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {pack.slug}
                      </p>
                    </div>
                    <Badge variant={pack.isActive ? "default" : "outline"}>
                      {pack.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-2">
                    <p className="text-xl font-bold">{formatMoney(pack)}</p>
                    <p className="text-muted-foreground text-xs">
                      {pack.credits} credits
                    </p>
                  </div>

                  <div className="border-border/60 bg-background/35 mt-4 rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        Polar Sync
                      </p>
                      {isSynced ? (
                        <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Synced
                        </Badge>
                      ) : (
                        <Badge variant="outline">Needs Sync</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                      <p>Product: {formatShortId(pack.polarProductId)}</p>
                      <p>Price: {formatShortId(pack.polarPriceId)}</p>
                      <p>
                        Last synced: {formatLastSyncedAt(pack.lastSyncedAt)}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full rounded-xl"
                    onClick={() => {
                      setSelectedPackId(pack.id);
                      setIsEditorOpen(true);
                    }}
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit Pack
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <Sheet
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            setSelectedPackId(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="border-border/70 bg-background w-full overflow-y-auto px-0 sm:max-w-2xl"
        >
          {selectedPack && selectedDraft ? (
            <>
              <SheetHeader className="border-border/60 space-y-3 border-b px-6 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-xl font-bold">
                    {selectedPack.displayName}
                  </SheetTitle>
                  <Badge
                    variant={selectedPack.isActive ? "default" : "outline"}
                  >
                    {selectedPack.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <SheetDescription>
                  Edit pack pricing, credits, and Polar metadata for
                  {` ${selectedPack.slug}.`}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Display Name
                    </p>
                    <Input
                      value={selectedDraft.displayName}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          displayName: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Description
                    </p>
                    <Input
                      value={selectedDraft.description}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          description: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Credits
                    </p>
                    <Input
                      type="number"
                      value={selectedDraft.credits}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          credits: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Price (cents)
                    </p>
                    <Input
                      type="number"
                      value={selectedDraft.priceCents}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          priceCents: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Currency
                    </p>
                    <Input
                      value={selectedDraft.currencyCode}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          currencyCode: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Sort Order
                    </p>
                    <Input
                      type="number"
                      value={selectedDraft.sortOrder}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          sortOrder: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Polar Product ID
                    </p>
                    <Input
                      value={selectedDraft.polarProductId}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          polarProductId: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Polar Price ID
                    </p>
                    <Input
                      value={selectedDraft.polarPriceId}
                      onChange={(event) =>
                        setDraftValue(selectedPack.id, {
                          polarPriceId: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="text-muted-foreground flex items-center gap-3 text-sm">
                  <Switch
                    checked={selectedDraft.isActive}
                    onCheckedChange={(checked) => {
                      setDraftValue(selectedPack.id, {
                        isActive: checked,
                      });
                    }}
                  />
                  Pack is active
                </div>

                <div className="border-border/60 bg-background/35 text-muted-foreground rounded-xl border p-3 text-xs">
                  <p>
                    Polar Product: {selectedPack.polarProductId || "not set"}
                  </p>
                  <p className="mt-1">
                    Polar Price: {selectedPack.polarPriceId || "not set"}
                  </p>
                  <p className="mt-1">
                    Last synced: {formatLastSyncedAt(selectedPack.lastSyncedAt)}
                  </p>
                </div>
              </div>

              <SheetFooter className="border-border/60 border-t px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setIsEditorOpen(false);
                    setSelectedPackId(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={patchMutation.isPending || !selectedDirty}
                  onClick={async () => {
                    try {
                      await savePack(selectedPack);
                    } catch (mutationError: unknown) {
                      setFeedback("");
                      setError(
                        mutationError instanceof Error
                          ? mutationError.message
                          : "Failed to update pack"
                      );
                    }
                  }}
                >
                  {patchMutation.isPending ? "Saving..." : "Save Pack"}
                </Button>
              </SheetFooter>
            </>
          ) : (
            <div className="text-muted-foreground px-6 py-8 text-sm">
              Select a pack from the card rail to edit credit pack details.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
