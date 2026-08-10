"use client";

import * as React from "react";
import {
  BadgeDollarSign,
  FileText,
  Home,
  LinkIcon,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wrench
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  PROPERTY_STORAGE_KEY,
  createEmptyPropertyState,
  createPropertyFact,
  createPropertyRecord,
  loadPropertyState,
  removeProperty,
  savePropertyState,
  upsertProperty
} from "@/lib/properties/property-persistence";
import {
  type LifecycleStatus,
  type ListingStatus,
  type PropertyFact,
  type PropertyFactSourceType,
  type PropertyRecord,
  type PropertyState,
  lifecycleStatusOptions,
  listingStatusOptions,
  propertyFactSourceOptions
} from "@/lib/properties/types";
import { cn } from "@/lib/utils";

type TabId = "overview" | "facts" | "financials" | "systems" | "notes";

const tabs: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "facts", label: "Facts", icon: Search },
  { id: "financials", label: "Financials", icon: BadgeDollarSign },
  { id: "systems", label: "Systems", icon: Wrench },
  { id: "notes", label: "Notes", icon: FileText }
];

function parseNullableInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableFloat(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFactValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!value.trim()) {
    return null;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function formatFactValue(value: PropertyFact["value"]) {
  if (value === null) {
    return "";
  }

  return String(value);
}

function cloneProperty(property: PropertyRecord): PropertyRecord {
  return JSON.parse(JSON.stringify(property)) as PropertyRecord;
}

function propertyFingerprint(property: PropertyRecord | null) {
  return property ? JSON.stringify(property) : "";
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatAddress(property: PropertyRecord) {
  const line = [property.addressLine1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return line || "Untitled property";
}

function getLifecycleLabel(status: LifecycleStatus) {
  return (
    lifecycleStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

function getListingLabel(status: ListingStatus) {
  return listingStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function PropertyManager() {
  const [propertyState, setPropertyState] = React.useState<PropertyState>(() =>
    createEmptyPropertyState()
  );
  const [selectedPropertyId, setSelectedPropertyId] = React.useState<string | null>(
    null
  );
  const [draft, setDraft] = React.useState<PropertyRecord | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<LifecycleStatus | "all">(
    "all"
  );
  const [loadSource, setLoadSource] = React.useState<"storage" | "empty" | "reset">(
    "empty"
  );
  const [saveStatus, setSaveStatus] = React.useState("Ready");

  React.useEffect(() => {
    const result = loadPropertyState(window.localStorage);
    setPropertyState(result.state);
    setLoadSource(result.source);

    const firstProperty = result.state.properties[0] ?? null;
    setSelectedPropertyId(firstProperty?.id ?? null);
    setDraft(firstProperty ? cloneProperty(firstProperty) : null);
  }, []);

  const selectedProperty = React.useMemo(
    () =>
      propertyState.properties.find(
        (property) => property.id === selectedPropertyId
      ) ?? null,
    [propertyState.properties, selectedPropertyId]
  );

  const isDirty =
    propertyFingerprint(draft) !== propertyFingerprint(selectedProperty);

  const filteredProperties = propertyState.properties.filter((property) => {
    const searchable = [
      property.addressLine1,
      property.city,
      property.state,
      property.postalCode,
      property.mlsId,
      property.houseStyle,
      property.notes
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = searchable.includes(query.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || property.lifecycleStatus === statusFilter;

    return matchesQuery && matchesStatus;
  });

  const statusCounts = React.useMemo(() => {
    return propertyState.properties.reduce<Record<string, number>>(
      (counts, property) => ({
        ...counts,
        [property.lifecycleStatus]: (counts[property.lifecycleStatus] ?? 0) + 1
      }),
      {}
    );
  }, [propertyState.properties]);

  function replaceDraft(next: PropertyRecord) {
    setDraft(next);
    setSaveStatus("Unsaved changes");
  }

  function updateDraft(patch: Partial<PropertyRecord>) {
    if (!draft) {
      return;
    }

    replaceDraft({ ...draft, ...patch });
  }

  function updateFact(id: string, patch: Partial<PropertyFact>) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: draft.facts.map((fact) =>
        fact.id === id ? { ...fact, ...patch } : fact
      )
    });
  }

  function persistState(nextState: PropertyState, nextSelectedId: string | null) {
    const persisted = savePropertyState(window.localStorage, nextState);
    setPropertyState(persisted);
    setSelectedPropertyId(nextSelectedId);
    const selected = persisted.properties.find(
      (property) => property.id === nextSelectedId
    );
    setDraft(selected ? cloneProperty(selected) : null);
    setLoadSource("storage");
    setSaveStatus("Saved");
  }

  function handleSelectProperty(propertyId: string) {
    const property = propertyState.properties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    setSelectedPropertyId(propertyId);
    setDraft(cloneProperty(property));
    setSaveStatus("Ready");
  }

  function handleNewProperty() {
    const property = createPropertyRecord();
    setSelectedPropertyId(property.id);
    setDraft(property);
    setSaveStatus("New unsaved property");
    setActiveTab("overview");
  }

  function handleSave() {
    if (!draft) {
      return;
    }

    persistState(upsertProperty(propertyState, draft), draft.id);
  }

  function handleDelete() {
    if (!draft) {
      return;
    }

    const nextState = removeProperty(propertyState, draft.id);
    const nextSelected = nextState.properties[0] ?? null;
    persistState(nextState, nextSelected?.id ?? null);
  }

  function handleResetAll() {
    window.localStorage.removeItem(PROPERTY_STORAGE_KEY);
    const emptyState = createEmptyPropertyState();
    setPropertyState(emptyState);
    setSelectedPropertyId(null);
    setDraft(null);
    setLoadSource("empty");
    setSaveStatus("Reset");
  }

  function handleAddFact() {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: [...draft.facts, createPropertyFact()]
    });
  }

  function handleRemoveFact(factId: string) {
    if (!draft) {
      return;
    }

    replaceDraft({
      ...draft,
      facts: draft.facts.filter((fact) => fact.id !== factId)
    });
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Milestone 2</Badge>
            <Badge variant={loadSource === "storage" ? "success" : "outline"}>
              {loadSource === "storage" ? "Local Data" : "No Saved Properties"}
            </Badge>
            <Badge variant="outline">{propertyState.properties.length} total</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Properties
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Track acquisition candidates, incomplete listing facts, lifecycle
            status, and due-diligence notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDirty ? "warning" : "success"}>{saveStatus}</Badge>
          <Button type="button" variant="outline" onClick={handleResetAll}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={handleNewProperty}>
            <Plus aria-hidden="true" />
            New
          </Button>
          <Button type="button" onClick={handleSave} disabled={!draft || !isDirty}>
            <Save aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-md border border-border bg-card p-4 shadow-soft">
          <div className="grid gap-3">
            <Field label="Search">
              <Input
                value={query}
                placeholder="Address, town, MLS, notes"
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <Field label="Lifecycle Filter">
              <Select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as LifecycleStatus | "all")
                }
              >
                <option value="all">All Statuses</option>
                {lifecycleStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {statusCounts[option.value]
                      ? ` (${statusCounts[option.value]})`
                      : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Separator className="my-4" />

          {filteredProperties.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">
              No properties match the current filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProperties.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => handleSelectProperty(property.id)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors",
                    property.id === selectedPropertyId
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/70"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {formatAddress(property)}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {property.city || "Town unknown"} ·{" "}
                        {formatCurrency(property.askingPrice)}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {getLifecycleLabel(property.lifecycleStatus)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card shadow-soft">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">
                  {draft ? formatAddress(draft) : "No property selected"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {draft ? (
                    <>
                      <Badge variant="outline">
                        {getLifecycleLabel(draft.lifecycleStatus)}
                      </Badge>
                      <Badge variant="outline">
                        Listing: {getListingLabel(draft.listingStatus)}
                      </Badge>
                      <Badge variant="outline">{draft.facts.length} facts</Badge>
                    </>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={!draft}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-secondary"
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!draft ? (
              <EmptyState onCreate={handleNewProperty} />
            ) : (
              <>
                {activeTab === "overview" ? (
                  <OverviewTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "facts" ? (
                  <FactsTab
                    draft={draft}
                    addFact={handleAddFact}
                    removeFact={handleRemoveFact}
                    updateFact={updateFact}
                  />
                ) : null}
                {activeTab === "financials" ? (
                  <FinancialsTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "systems" ? (
                  <SystemsTab draft={draft} updateDraft={updateDraft} />
                ) : null}
                {activeTab === "notes" ? (
                  <NotesTab draft={draft} updateDraft={updateDraft} />
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background p-8 text-center">
      <Home className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm font-medium">No property selected</div>
      <Button type="button" onClick={onCreate}>
        <Plus aria-hidden="true" />
        Add Property
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
  action
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function OverviewTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Address And Status">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Address" className="md:col-span-2">
            <Input
              value={draft.addressLine1}
              onChange={(event) =>
                updateDraft({ addressLine1: event.target.value })
              }
            />
          </Field>
          <Field label="City">
            <Input
              value={draft.city}
              onChange={(event) => updateDraft({ city: event.target.value })}
            />
          </Field>
          <Field label="State">
            <Input
              value={draft.state}
              maxLength={2}
              onChange={(event) =>
                updateDraft({ state: event.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="Postal Code">
            <Input
              value={draft.postalCode}
              onChange={(event) =>
                updateDraft({ postalCode: event.target.value })
              }
            />
          </Field>
          <Field label="Lifecycle Status">
            <Select
              value={draft.lifecycleStatus}
              onChange={(event) =>
                updateDraft({
                  lifecycleStatus: event.target.value as LifecycleStatus
                })
              }
            >
              {lifecycleStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Listing Status">
            <Select
              value={draft.listingStatus}
              onChange={(event) =>
                updateDraft({ listingStatus: event.target.value as ListingStatus })
              }
            >
              {listingStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="MLS ID">
            <Input
              value={draft.mlsId}
              onChange={(event) => updateDraft({ mlsId: event.target.value })}
            />
          </Field>
          <Field label="Listing URL" className="md:col-span-2">
            <div className="flex gap-2">
              <Input
                value={draft.listingUrl}
                onChange={(event) =>
                  updateDraft({ listingUrl: event.target.value })
                }
              />
              {draft.listingUrl ? (
                <Button type="button" variant="outline" size="icon" asChild>
                  <a
                    href={draft.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open listing URL"
                  >
                    <LinkIcon aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Core Facts">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField
            label="Bedrooms"
            value={draft.bedrooms}
            step="0.5"
            onChange={(bedrooms) => updateDraft({ bedrooms })}
          />
          <NumberField
            label="Bathrooms"
            value={draft.bathrooms}
            step="0.5"
            onChange={(bathrooms) => updateDraft({ bathrooms })}
          />
          <NumberField
            label="Living Sqft"
            value={draft.livingSqft}
            onChange={(livingSqft) => updateDraft({ livingSqft })}
          />
          <NumberField
            label="Lot Acres"
            value={draft.lotAcres}
            step="0.1"
            onChange={(lotAcres) => updateDraft({ lotAcres })}
          />
          <NumberField
            label="Year Built"
            value={draft.yearBuilt}
            onChange={(yearBuilt) => updateDraft({ yearBuilt })}
          />
          <Field label="House Style">
            <Input
              value={draft.houseStyle}
              onChange={(event) =>
                updateDraft({ houseStyle: event.target.value })
              }
            />
          </Field>
          <NumberField
            label="Latitude"
            value={draft.latitude}
            step="0.000001"
            min={undefined}
            onChange={(latitude) => updateDraft({ latitude })}
          />
          <NumberField
            label="Longitude"
            value={draft.longitude}
            step="0.000001"
            min={undefined}
            onChange={(longitude) => updateDraft({ longitude })}
          />
        </div>
      </Section>
    </div>
  );
}

function FactsTab({
  draft,
  addFact,
  removeFact,
  updateFact
}: {
  draft: PropertyRecord;
  addFact: () => void;
  removeFact: (factId: string) => void;
  updateFact: (id: string, patch: Partial<PropertyFact>) => void;
}) {
  return (
    <Section
      title="Flexible Facts"
      action={
        <Button type="button" variant="outline" size="sm" onClick={addFact}>
          <Plus aria-hidden="true" />
          Add Fact
        </Button>
      }
    >
      {draft.facts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          Add facts for setting, road exposure, utilities, driveway, views, and
          other observed details.
        </div>
      ) : (
        <div className="grid gap-3">
          {draft.facts.map((fact) => (
            <div
              key={fact.id}
              className="grid gap-3 rounded-md border border-border bg-card p-3 xl:grid-cols-[minmax(140px,1fr)_minmax(160px,1fr)_120px_150px_110px_80px_44px]"
            >
              <Field label="Label">
                <Input
                  value={fact.label}
                  onChange={(event) =>
                    updateFact(fact.id, { label: event.target.value })
                  }
                />
              </Field>
              <Field label="Fact Key">
                <Input
                  value={fact.factKey}
                  onChange={(event) =>
                    updateFact(fact.id, { factKey: event.target.value })
                  }
                />
              </Field>
              <Field label="Value">
                <Input
                  value={formatFactValue(fact.value)}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      value: parseFactValue(event.target.value)
                    })
                  }
                />
              </Field>
              <Field label="Source">
                <Select
                  value={fact.sourceType}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      sourceType: event.target.value as PropertyFactSourceType
                    })
                  }
                >
                  {propertyFactSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Confidence">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.05"
                  value={fact.confidence ?? ""}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      confidence: parseNullableFloat(event.target.value)
                    })
                  }
                />
              </Field>
              <Field label="Verified">
                <div className="flex h-10 items-center">
                  <Switch
                    checked={fact.verified}
                    onCheckedChange={(verified) =>
                      updateFact(fact.id, { verified })
                    }
                  />
                </div>
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeFact(fact.id)}
                  title="Remove fact"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <Field label="Source Reference" className="xl:col-span-7">
                <Input
                  value={fact.sourceReference}
                  onChange={(event) =>
                    updateFact(fact.id, {
                      sourceReference: event.target.value
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function FinancialsTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <Section title="Financials">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NumberField
          label="Asking Price"
          value={draft.askingPrice}
          onChange={(askingPrice) => updateDraft({ askingPrice })}
        />
        <NumberField
          label="Estimated Purchase"
          value={draft.estimatedPurchasePrice}
          onChange={(estimatedPurchasePrice) =>
            updateDraft({ estimatedPurchasePrice })
          }
        />
        <NumberField
          label="Annual Property Tax"
          value={draft.annualPropertyTax}
          onChange={(annualPropertyTax) => updateDraft({ annualPropertyTax })}
        />
        <NumberField
          label="HOA Fee"
          value={draft.hoaFee}
          onChange={(hoaFee) => updateDraft({ hoaFee })}
        />
        <Field label="HOA Present">
          <Select
            value={
              draft.hoaPresent === null ? "unknown" : draft.hoaPresent ? "yes" : "no"
            }
            onChange={(event) =>
              updateDraft({
                hoaPresent:
                  event.target.value === "unknown"
                    ? null
                    : event.target.value === "yes"
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </div>
    </Section>
  );
}

function SystemsTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <Section title="Systems And Utilities">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NumberField
          label="Garage Spaces"
          value={draft.garageSpaces}
          onChange={(garageSpaces) => updateDraft({ garageSpaces })}
        />
        <Field label="Heating Type">
          <Input
            value={draft.heatingType}
            onChange={(event) =>
              updateDraft({ heatingType: event.target.value })
            }
          />
        </Field>
        <Field label="Water Source">
          <Input
            value={draft.waterSource}
            onChange={(event) =>
              updateDraft({ waterSource: event.target.value })
            }
          />
        </Field>
        <Field label="Sewer Type">
          <Input
            value={draft.sewerType}
            onChange={(event) => updateDraft({ sewerType: event.target.value })}
          />
        </Field>
      </div>
    </Section>
  );
}

function NotesTab({
  draft,
  updateDraft
}: {
  draft: PropertyRecord;
  updateDraft: (patch: Partial<PropertyRecord>) => void;
}) {
  return (
    <div className="grid gap-5">
      <Section title="Listing Remarks">
        <Textarea
          value={draft.listingRemarks}
          onChange={(event) =>
            updateDraft({ listingRemarks: event.target.value })
          }
        />
      </Section>
      <Section title="Private Notes">
        <Textarea
          value={draft.notes}
          onChange={(event) => updateDraft({ notes: event.target.value })}
        />
      </Section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
  min = 0
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: string;
  min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={(event) => {
          const parsed =
            step === "1"
              ? parseNullableInteger(event.target.value)
              : parseNullableFloat(event.target.value);
          onChange(parsed);
        }}
      />
    </Field>
  );
}
