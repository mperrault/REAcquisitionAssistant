"use client";

import * as React from "react";
import {
  CheckCircle2,
  Inbox,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  XCircle
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
  createPropertyDraftFromListingCandidate
} from "@/lib/listing-alerts/listing-alert-parser";
import {
  clearListingAlertQueue,
  createEmptyListingAlertState,
  createListingAlertSource,
  ingestListingAlertText,
  loadListingAlertState,
  markListingAlertSourceChecked,
  markListingCandidateIgnored,
  markListingCandidateImported,
  saveListingAlertState,
  upsertListingAlertSource,
  LISTING_ALERT_STORAGE_KEY
} from "@/lib/listing-alerts/listing-alert-persistence";
import type {
  ListingAlertConnectorConfig,
  ListingAlertConnectorSecurity,
  ListingAlertSource,
  ListingAlertSourceProvider,
  ListingAlertState,
  ListingCandidate,
  ListingCandidateStatus
} from "@/lib/listing-alerts/types";
import { listingAlertPollResponseSchema } from "@/lib/listing-alerts/polling-types";
import {
  createEmptyPropertyState,
  loadPropertyState,
  savePropertyState,
  upsertProperty
} from "@/lib/properties/property-persistence";
import type { PropertyState } from "@/lib/properties/types";
import { loadProfileState } from "@/lib/profiles/profile-persistence";
import type { ProfileState } from "@/lib/profiles/types";
import { evaluateProperty } from "@/lib/scoring/evaluate-property";
import {
  addScoreEvaluation,
  createEmptyScoreState,
  loadScoreState,
  saveScoreState
} from "@/lib/scoring/score-persistence";
import type { ScoreEvaluationState } from "@/lib/scoring/types";
import { cn } from "@/lib/utils";

const sampleAlertText = `New listing alert

287 County Road, Woodstock, CT 06281
$329,900
3 beds 2 baths 1,684 sq ft
5.2 acres
Built in 1978
MLS 24012345
Open fields, barn, pastoral views, private well and septic.
https://example.com/listing/287-county-road

14 Pond View Lane, Stafford, CT 06076
$289,000
2 bd 1.5 ba 1,248 sqft
1.7 acres
Pond view, wooded privacy, oil heat.
https://example.com/listing/14-pond-view-lane`;

const providerOptions: Array<{
  value: ListingAlertSourceProvider;
  label: string;
}> = [
  { value: "gmail_label", label: "Gmail Label" },
  { value: "gmail_query", label: "Gmail Query" },
  { value: "imap_mailbox", label: "IMAP Mailbox" },
  { value: "manual_test", label: "Manual Test Source" }
];

const securityOptions: Array<{
  value: ListingAlertConnectorSecurity;
  label: string;
}> = [
  { value: "ssl_tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "None" }
];

const statusOptions: Array<{ value: ListingCandidateStatus | "all"; label: string }> =
  [
    { value: "all", label: "All Candidates" },
    { value: "new", label: "New" },
    { value: "imported", label: "Imported" },
    { value: "ignored", label: "Ignored" }
  ];

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Price unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatAddress(candidate: ListingCandidate) {
  const parts = [candidate.addressLine1, candidate.city, candidate.state].filter(
    Boolean
  );

  return parts.join(", ") || "Untitled listing candidate";
}

function getCandidateStatusVariant(status: ListingCandidateStatus) {
  if (status === "imported") {
    return "success" as const;
  }

  if (status === "ignored") {
    return "outline" as const;
  }

  return "secondary" as const;
}

function isGmailProvider(provider: ListingAlertSourceProvider) {
  return provider === "gmail_label" || provider === "gmail_query";
}

function getConnectorStatus(source: ListingAlertSource | null) {
  if (!source) {
    return { label: "No source", variant: "outline" as const };
  }

  if (source.provider === "manual_test") {
    return { label: "Test source", variant: "secondary" as const };
  }

  if (source.provider === "imap_mailbox") {
    const config = source.connectorConfig;
    const configured =
      config.imapHost &&
      config.imapPort &&
      config.imapUsername &&
      config.imapMailbox &&
      config.credentialEnvVar;

    return configured
      ? { label: "Settings saved", variant: "success" as const }
      : { label: "Needs settings", variant: "warning" as const };
  }

  return source.connectorConfig.gmailAccountHint
    ? { label: "Account set", variant: "success" as const }
    : { label: "OAuth pending", variant: "warning" as const };
}

function getRuntimeStatus(source: ListingAlertSource | null) {
  if (!source) {
    return { label: "No source", variant: "outline" as const };
  }

  if (source.provider === "imap_mailbox") {
    return { label: "Manual poll ready", variant: "success" as const };
  }

  if (source.provider === "manual_test") {
    return { label: "Parser only", variant: "secondary" as const };
  }

  return { label: "OAuth pending", variant: "warning" as const };
}

function getProviderLabel(provider: ListingAlertSourceProvider) {
  return (
    providerOptions.find((option) => option.value === provider)?.label ?? provider
  );
}

function getCandidateProvenance(
  candidate: ListingCandidate,
  state: ListingAlertState
) {
  const source = state.sources.find((item) => item.id === candidate.sourceId);
  const message = state.messages.find(
    (item) =>
      item.id === candidate.messageId ||
      item.externalMessageId === candidate.externalMessageId
  );
  const isParserTest =
    candidate.externalMessageId.startsWith("test-message-") ||
    message?.subject === "Parser test listing alert";
  const label = isParserTest
    ? "Parser Test"
    : source?.provider === "imap_mailbox"
      ? "IMAP Poll"
      : source
        ? getProviderLabel(source.provider)
        : "Unknown Source";

  return {
    label,
    sourceName: source?.name ?? "Unknown source",
    messageSubject: message?.subject ?? "",
    from: message?.from ?? "",
    receivedAt: message?.receivedAt ?? candidate.createdAt
  };
}

function createDefaultSource() {
  return createListingAlertSource({
    name: "Saved Search Alerts",
    provider: "gmail_label",
    mailboxLabel: "RE Acquisition Assistant",
    searchQuery:
      'label:"RE Acquisition Assistant" newer_than:30d (from:zillow OR from:redfin OR from:realtor)',
    pollingMinutes: 30
  });
}

function cloneSource(source: ListingAlertSource): ListingAlertSource {
  return JSON.parse(JSON.stringify(source)) as ListingAlertSource;
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ListingAlertManager() {
  const [listingState, setListingState] = React.useState<ListingAlertState>(() =>
    createEmptyListingAlertState()
  );
  const [propertyState, setPropertyState] = React.useState<PropertyState>(() =>
    createEmptyPropertyState()
  );
  const [profileState, setProfileState] = React.useState<ProfileState | null>(null);
  const [scoreState, setScoreState] = React.useState<ScoreEvaluationState>(() =>
    createEmptyScoreState()
  );
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | null>(
    null
  );
  const [sourceDraft, setSourceDraft] =
    React.useState<ListingAlertSource | null>(null);
  const [candidateStatusFilter, setCandidateStatusFilter] = React.useState<
    ListingCandidateStatus | "all"
  >("new");
  const [alertText, setAlertText] = React.useState(sampleAlertText);
  const [isPolling, setIsPolling] = React.useState(false);
  const [loadSource, setLoadSource] = React.useState<"storage" | "empty" | "reset">(
    "empty"
  );
  const [actionStatus, setActionStatus] = React.useState("Ready");

  React.useEffect(() => {
    const alertResult = loadListingAlertState(window.localStorage);
    let loadedAlertState = alertResult.state;

    if (loadedAlertState.sources.length === 0) {
      loadedAlertState = upsertListingAlertSource(
        loadedAlertState,
        createDefaultSource()
      );
      saveListingAlertState(window.localStorage, loadedAlertState);
    }

    const propertyResult = loadPropertyState(window.localStorage);
    const profileResult = loadProfileState(window.localStorage);
    const scoreResult = loadScoreState(window.localStorage);
    const firstSource = loadedAlertState.sources[0] ?? null;

    setListingState(loadedAlertState);
    setPropertyState(propertyResult.state);
    setProfileState(profileResult.state);
    setScoreState(scoreResult.state);
    setSelectedSourceId(firstSource?.id ?? null);
    setSourceDraft(firstSource ? cloneSource(firstSource) : null);
    setLoadSource(alertResult.source === "empty" ? "storage" : alertResult.source);
  }, []);

  const selectedSource = React.useMemo(
    () =>
      listingState.sources.find((source) => source.id === selectedSourceId) ??
      null,
    [listingState.sources, selectedSourceId]
  );

  const activeProfile = React.useMemo(() => {
    if (!profileState) {
      return null;
    }

    return (
      profileState.profiles.find(
        (profile) => profile.id === profileState.activeProfileId
      ) ?? null
    );
  }, [profileState]);

  const candidateCounts = React.useMemo(() => {
    return listingState.candidates.reduce<Record<string, number>>(
      (counts, candidate) => ({
        ...counts,
        [candidate.status]: (counts[candidate.status] ?? 0) + 1
      }),
      {}
    );
  }, [listingState.candidates]);

  const filteredCandidates = listingState.candidates.filter((candidate) => {
    const matchesStatus =
      candidateStatusFilter === "all" ||
      candidate.status === candidateStatusFilter;
    const matchesSource =
      !selectedSourceId || candidate.sourceId === selectedSourceId;

    return matchesStatus && matchesSource;
  });

  const latestRun = listingState.runs[0] ?? null;

  function persistListingState(nextState: ListingAlertState, status: string) {
    const persisted = saveListingAlertState(window.localStorage, nextState);
    setListingState(persisted);
    setLoadSource("storage");
    setActionStatus(status);
  }

  function updateSourceDraft(patch: Partial<ListingAlertSource>) {
    if (!sourceDraft) {
      return;
    }

    setSourceDraft({ ...sourceDraft, ...patch });
    setActionStatus("Unsaved source changes");
  }

  function updateConnectorConfig(patch: Partial<ListingAlertConnectorConfig>) {
    if (!sourceDraft) {
      return;
    }

    updateSourceDraft({
      connectorConfig: {
        ...sourceDraft.connectorConfig,
        ...patch
      }
    });
  }

  function handleSelectSource(sourceId: string) {
    const source = listingState.sources.find((item) => item.id === sourceId);

    if (!source) {
      return;
    }

    setSelectedSourceId(sourceId);
    setSourceDraft(cloneSource(source));
    setActionStatus("Ready");
  }

  function handleNewSource() {
    const source = createListingAlertSource({
      name: "New Listing Alert Source",
      mailboxLabel: "",
      searchQuery: "",
      provider: "gmail_label"
    });
    const nextState = upsertListingAlertSource(listingState, source);
    persistListingState(nextState, "Source created");
    setSelectedSourceId(source.id);
    setSourceDraft(cloneSource(source));
  }

  function handleSaveSource() {
    if (!sourceDraft) {
      return;
    }

    const nextState = upsertListingAlertSource(listingState, sourceDraft);
    persistListingState(nextState, "Source saved");
  }

  function handleResetAlerts() {
    window.localStorage.removeItem(LISTING_ALERT_STORAGE_KEY);
    const source = createDefaultSource();
    const nextState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source
    );
    const persisted = saveListingAlertState(window.localStorage, nextState);

    setListingState(persisted);
    setSelectedSourceId(source.id);
    setSourceDraft(cloneSource(source));
    setLoadSource("storage");
    setActionStatus("Alerts reset");
  }

  function handleClearQueue() {
    persistListingState(
      clearListingAlertQueue(listingState),
      "Queue cleared; sources preserved"
    );
  }

  function handleProcessAlertText() {
    if (!selectedSource || !alertText.trim()) {
      return;
    }

    const timestamp = new Date().toISOString();
    const result = ingestListingAlertText(
      listingState,
      selectedSource.id,
      {
        externalMessageId: `test-message-${Date.now()}`,
        subject: "Parser test listing alert",
        from: "listing-alert@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp
    );

    persistListingState(
      result.state,
      `${result.run.candidatesCreated} new, ${result.run.candidatesUpdated} updated`
    );
  }

  async function handlePollSource() {
    if (!selectedSource || selectedSource.provider !== "imap_mailbox") {
      return;
    }

    setIsPolling(true);
    setActionStatus("Polling mailbox");

    try {
      const response = await fetch("/api/listing-alerts/poll-imap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: selectedSource,
          since: selectedSource.lastCheckedAt,
          maxMessages: 20
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Mailbox poll failed."
        );
      }

      const pollResult = listingAlertPollResponseSchema.parse(payload);
      let nextListingState = listingState;
      let candidatesCreated = 0;
      let candidatesUpdated = 0;

      for (const message of pollResult.messages) {
        const result = ingestListingAlertText(
          nextListingState,
          selectedSource.id,
          {
            externalMessageId: message.externalMessageId,
            subject: message.subject,
            from: message.from,
            receivedAt: message.receivedAt,
            bodyText: message.bodyText,
            bodyHtml: message.bodyHtml
          },
          pollResult.checkedAt
        );

        nextListingState = result.state;
        candidatesCreated += result.run.candidatesCreated;
        candidatesUpdated += result.run.candidatesUpdated;
      }

      nextListingState = markListingAlertSourceChecked(
        nextListingState,
        selectedSource.id,
        pollResult.checkedAt
      );

      persistListingState(
        nextListingState,
        `${pollResult.messages.length} messages, ${candidatesCreated} new, ${candidatesUpdated} updated`
      );
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Mailbox poll failed"
      );
    } finally {
      setIsPolling(false);
    }
  }

  function handleImportCandidate(candidateId: string) {
    const candidate = listingState.candidates.find(
      (item) => item.id === candidateId
    );

    if (!candidate || candidate.status === "imported") {
      return;
    }

    const timestamp = new Date().toISOString();
    const property = createPropertyDraftFromListingCandidate(candidate, timestamp);
    const nextPropertyState = upsertProperty(propertyState, property, timestamp);
    const persistedPropertyState = savePropertyState(
      window.localStorage,
      nextPropertyState
    );
    let nextScoreState = scoreState;

    if (activeProfile) {
      nextScoreState = addScoreEvaluation(
        scoreState,
        evaluateProperty(property, activeProfile)
      );
      nextScoreState = saveScoreState(window.localStorage, nextScoreState);
    }

    const nextListingState = markListingCandidateImported(
      listingState,
      candidate.id,
      property.id,
      timestamp
    );

    setPropertyState(persistedPropertyState);
    setScoreState(nextScoreState);
    persistListingState(nextListingState, "Imported to properties");
  }

  function handleIgnoreCandidate(candidateId: string) {
    const nextListingState = markListingCandidateIgnored(
      listingState,
      candidateId
    );
    persistListingState(nextListingState, "Candidate ignored");
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Milestone 2</Badge>
            <Badge variant={loadSource === "storage" ? "success" : "outline"}>
              {loadSource === "storage" ? "Local Data" : "No Saved Alerts"}
            </Badge>
            <Badge variant="outline">{listingState.sources.length} sources</Badge>
            <Badge variant="outline">
              {listingState.candidates.length} candidates
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Listing Alerts
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Ingest saved-search emails into deduplicated candidates and convert
            useful matches into property drafts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={actionStatus === "Ready" ? "success" : "warning"}>
            {actionStatus}
          </Badge>
          <Button type="button" variant="outline" onClick={handleResetAlerts}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={handleNewSource}>
            <Plus aria-hidden="true" />
            Source
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePollSource}
            disabled={
              !selectedSource ||
              selectedSource.provider !== "imap_mailbox" ||
              isPolling
            }
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(isPolling && "animate-spin")}
            />
            Poll Now
          </Button>
          <Button type="button" onClick={handleSaveSource} disabled={!sourceDraft}>
            <Save aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-md border border-border bg-card p-4 shadow-soft">
          <div className="grid gap-3">
            <Field label="Source">
              <Select
                value={selectedSourceId ?? ""}
                onChange={(event) => handleSelectSource(event.target.value)}
              >
                {listingState.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
            </Field>

            {sourceDraft ? (
              <>
                <Field label="Name">
                  <Input
                    value={sourceDraft.name}
                    onChange={(event) =>
                      updateSourceDraft({ name: event.target.value })
                    }
                  />
                </Field>
                <Field label="Provider">
                  <Select
                    value={sourceDraft.provider}
                    onChange={(event) =>
                      updateSourceDraft({
                        provider: event.target.value as ListingAlertSourceProvider
                      })
                    }
                  >
                    {providerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {isGmailProvider(sourceDraft.provider) ? (
                  <>
                    <Field label="Google Account">
                      <Input
                        value={sourceDraft.connectorConfig.gmailAccountHint}
                        onChange={(event) =>
                          updateConnectorConfig({
                            gmailAccountHint: event.target.value
                          })
                        }
                        placeholder="alerts@example.com"
                      />
                    </Field>
                    <Field label="Gmail Label">
                      <Input
                        value={sourceDraft.mailboxLabel}
                        onChange={(event) =>
                          updateSourceDraft({ mailboxLabel: event.target.value })
                        }
                        placeholder="RE Acquisition Assistant"
                      />
                    </Field>
                    <Field label="Gmail Search Query">
                      <Textarea
                        value={sourceDraft.searchQuery}
                        onChange={(event) =>
                          updateSourceDraft({ searchQuery: event.target.value })
                        }
                        rows={4}
                      />
                    </Field>
                  </>
                ) : null}
                {sourceDraft.provider === "imap_mailbox" ? (
                  <>
                    <Field label="IMAP Host">
                      <Input
                        value={sourceDraft.connectorConfig.imapHost}
                        onChange={(event) =>
                          updateConnectorConfig({ imapHost: event.target.value })
                        }
                        placeholder="mail.example.com"
                      />
                    </Field>
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                      <Field label="IMAP Port">
                        <Input
                          type="number"
                          min={1}
                          value={sourceDraft.connectorConfig.imapPort}
                          onChange={(event) =>
                            updateConnectorConfig({
                              imapPort: Number(event.target.value) || 993
                            })
                          }
                        />
                      </Field>
                      <Field label="Security">
                        <Select
                          value={sourceDraft.connectorConfig.imapSecurity}
                          onChange={(event) =>
                            updateConnectorConfig({
                              imapSecurity: event.target
                                .value as ListingAlertConnectorSecurity
                            })
                          }
                        >
                          {securityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Username">
                      <Input
                        value={sourceDraft.connectorConfig.imapUsername}
                        onChange={(event) =>
                          updateConnectorConfig({
                            imapUsername: event.target.value
                          })
                        }
                        placeholder="alerts@example.com"
                      />
                    </Field>
                    <Field label="Mailbox Folder">
                      <Input
                        value={sourceDraft.connectorConfig.imapMailbox}
                        onChange={(event) =>
                          updateConnectorConfig({
                            imapMailbox: event.target.value
                          })
                        }
                        placeholder="INBOX"
                      />
                    </Field>
                    <Field label="Password Secret">
                      <Input
                        value={sourceDraft.connectorConfig.credentialEnvVar}
                        onChange={(event) =>
                          updateConnectorConfig({
                            credentialEnvVar: event.target.value
                          })
                        }
                        placeholder="REA_LISTING_ALERT_IMAP_PASSWORD"
                      />
                    </Field>
                  </>
                ) : null}
                {sourceDraft.provider === "manual_test" ? (
                  <Field label="Test Label">
                    <Input
                      value={sourceDraft.mailboxLabel}
                      onChange={(event) =>
                        updateSourceDraft({ mailboxLabel: event.target.value })
                      }
                      placeholder="Parser Test"
                    />
                  </Field>
                ) : null}
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <Field label="Polling Minutes">
                    <Input
                      type="number"
                      min={5}
                      value={sourceDraft.pollingMinutes}
                      onChange={(event) =>
                        updateSourceDraft({
                          pollingMinutes: Number(event.target.value) || 30
                        })
                      }
                    />
                  </Field>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={sourceDraft.enabled}
                      onCheckedChange={(checked) =>
                        updateSourceDraft({ enabled: checked })
                      }
                    />
                    Enabled
                  </label>
                </div>
              </>
            ) : null}
          </div>

          <Separator className="my-4" />

          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Connector</span>
              <Badge variant={getConnectorStatus(selectedSource).variant}>
                {getConnectorStatus(selectedSource).label}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Runtime</span>
              <Badge variant={getRuntimeStatus(selectedSource).variant}>
                {getRuntimeStatus(selectedSource).label}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Last checked</span>
              <span className="text-right font-medium">
                {formatDateTime(selectedSource?.lastCheckedAt ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Latest run</span>
              <span className="text-right font-medium">
                {latestRun
                  ? `${latestRun.candidatesCreated} new / ${latestRun.candidatesUpdated} updated`
                  : "No runs"}
              </span>
            </div>
          </div>
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card shadow-soft">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Candidate Queue</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {candidateCounts.new ?? 0} new
                  </Badge>
                  <Badge variant="success">
                    {candidateCounts.imported ?? 0} imported
                  </Badge>
                  <Badge variant="outline">
                    {candidateCounts.ignored ?? 0} ignored
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearQueue}
                  disabled={
                    listingState.candidates.length === 0 &&
                    listingState.messages.length === 0 &&
                    listingState.runs.length === 0
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Clear Queue
                </Button>
                <Select
                  className="w-44"
                  value={candidateStatusFilter}
                  onChange={(event) =>
                    setCandidateStatusFilter(
                      event.target.value as ListingCandidateStatus | "all"
                    )
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-border">
            {filteredCandidates.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No candidates match the current source and status filter.
              </div>
            ) : (
              filteredCandidates.map((candidate) => {
                const provenance = getCandidateProvenance(candidate, listingState);

                return (
                  <article key={candidate.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">
                            {formatAddress(candidate)}
                          </h3>
                          <Badge
                            variant={getCandidateStatusVariant(candidate.status)}
                          >
                            {candidate.status}
                          </Badge>
                          <Badge variant="outline">
                            {Math.round(candidate.confidence * 100)}% parsed
                          </Badge>
                          <Badge variant="outline">{provenance.label}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{provenance.sourceName}</span>
                          <span>{formatDateTime(provenance.receivedAt)}</span>
                          {provenance.from ? <span>{provenance.from}</span> : null}
                          {provenance.messageSubject ? (
                            <span className="block max-w-[28rem] truncate">
                              {provenance.messageSubject}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{formatCurrency(candidate.askingPrice)}</span>
                          <span>
                            {candidate.bedrooms ?? "-"} bd /{" "}
                            {candidate.bathrooms ?? "-"} ba
                          </span>
                          <span>
                            {candidate.livingSqft
                              ? `${candidate.livingSqft.toLocaleString()} sqft`
                              : "Sqft unknown"}
                          </span>
                          <span>
                            {candidate.lotAcres
                              ? `${candidate.lotAcres} acres`
                              : "Acreage unknown"}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-3 max-w-5xl text-sm text-muted-foreground">
                          {candidate.listingRemarks || candidate.rawText}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {candidate.facts.slice(0, 6).map((fact) => (
                            <Badge key={fact.id} variant="outline">
                              {fact.label}
                            </Badge>
                          ))}
                          {candidate.warnings.map((warning) => (
                            <Badge key={warning} variant="warning">
                              {warning}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {candidate.listingUrl ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={candidate.listingUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Inbox aria-hidden="true" />
                              Open
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleImportCandidate(candidate.id)}
                          disabled={candidate.status === "imported"}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          Import
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleIgnoreCandidate(candidate.id)}
                          disabled={candidate.status === "imported"}
                        >
                          <XCircle aria-hidden="true" />
                          Ignore
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-md border border-border bg-card shadow-soft">
        <div className="border-b border-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Parser Test Input</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Validate alert extraction before the mailbox connector is wired.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleProcessAlertText}
              disabled={!selectedSource || !alertText.trim()}
            >
              <Play aria-hidden="true" />
              Process
            </Button>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <Textarea
            value={alertText}
            onChange={(event) => setAlertText(event.target.value)}
            rows={12}
            className={cn("font-mono text-xs leading-relaxed")}
          />
        </div>
      </section>
    </div>
  );
}
