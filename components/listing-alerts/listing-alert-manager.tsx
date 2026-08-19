"use client";

import Image from "next/image";
import * as React from "react";
import {
  CheckCircle2,
  ImageOff,
  Inbox,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
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
  createPropertyDraftFromListingCandidate,
  NO_EMAIL_HTML_PHOTO_WARNING,
  NO_MATCHING_PROPERTY_PHOTO_WARNING,
  NO_PROPERTY_PHOTO_IN_HTML_WARNING
} from "@/lib/listing-alerts/listing-alert-parser";
import {
  applyListingCandidateGeographyFilter,
  countEnabledProfileTowns
} from "@/lib/listing-alerts/geography-filter";
import {
  clearListingAlertQueue,
  createEmptyListingAlertState,
  createListingAlertSource,
  ingestListingAlertText,
  loadListingAlertState,
  markListingAlertSourceChecked,
  markListingCandidatesIgnored,
  markListingCandidateIgnored,
  markListingCandidateImported,
  reprocessListingAlertMessages,
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
import {
  type CandidateSortMode,
  type CandidateTriageFilter,
  type CandidateScorePreview,
  filterAndSortListingCandidates,
  LOW_CONFIDENCE_THRESHOLD
} from "@/lib/listing-alerts/listing-alert-triage";
import {
  type ListingCandidateEnrichmentResponse,
  listingCandidateEnrichmentResponseSchema
} from "@/lib/listing-alerts/listing-enrichment";
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

const triageOptions: Array<{ value: CandidateTriageFilter; label: string }> = [
  { value: "all", label: "All Triage" },
  { value: "needs_review", label: "Needs Review" },
  { value: "has_photo", label: "Has Photo" },
  { value: "missing_photo", label: "Missing Photo" },
  {
    value: "low_confidence",
    label: `Low Confidence <${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}%`
  },
  { value: "warnings", label: "Warnings" },
  { value: "outside_geography", label: "Outside Geography" },
  { value: "strong_score", label: "Strong Score" },
  { value: "rejected_by_profile", label: "Rejected by Profile" }
];

const sortOptions: Array<{ value: CandidateSortMode; label: string }> = [
  { value: "received_desc", label: "Newest Email" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "score_desc", label: "Best Score" },
  { value: "confidence_desc", label: "Best Parsed" },
  { value: "confidence_asc", label: "Worst Parsed" },
  { value: "price_asc", label: "Lowest Price" },
  { value: "price_desc", label: "Highest Price" }
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

function formatNumber(value: number | null) {
  return value === null ? null : value.toLocaleString();
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

function getActiveProfile(profileState: ProfileState | null) {
  if (!profileState) {
    return null;
  }

  return (
    profileState.profiles.find(
      (profile) => profile.id === profileState.activeProfileId
    ) ?? null
  );
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

function getAlertProviderLabel(provenance: ReturnType<typeof getCandidateProvenance>) {
  const searchable = `${provenance.from} ${provenance.messageSubject}`.toLowerCase();

  if (searchable.includes("realtor")) {
    return "Realtor alert";
  }

  if (searchable.includes("zillow")) {
    return "Zillow alert";
  }

  if (searchable.includes("redfin")) {
    return "Redfin alert";
  }

  return provenance.label === "IMAP Poll" ? "Email alert" : provenance.label;
}

function getListingSourceLabel(provenance: ReturnType<typeof getCandidateProvenance>) {
  return `Listing source: ${getAlertProviderLabel(provenance)}`;
}

function formatScoreGapCount(count: number) {
  return `${count} ${count === 1 ? "score gap" : "score gaps"}`;
}

function formatScoreGapTitle(missingData: string[]) {
  return missingData.length > 0
    ? `Missing scoring inputs:\n${missingData.join("\n")}`
    : "No score gaps";
}

function getMissingPhotoReason(candidate: ListingCandidate) {
  return (
    candidate.warnings.find((warning) =>
      [
        NO_EMAIL_HTML_PHOTO_WARNING,
        NO_PROPERTY_PHOTO_IN_HTML_WARNING,
        NO_MATCHING_PROPERTY_PHOTO_WARNING
      ].includes(warning)
    ) ?? "No photo in alert"
  );
}

function canEnrichCandidate(candidate: ListingCandidate) {
  return Boolean(
    candidate.listingUrl && (!candidate.primaryPhotoUrl || candidate.askingPrice === null)
  );
}

function mergeEnrichmentIntoCandidate(
  candidate: ListingCandidate,
  enrichment: ListingCandidateEnrichmentResponse,
  timestamp: string
) {
  if (candidate.id !== enrichment.candidateId) {
    return { candidate, changed: false };
  }

  const shouldApplyPrice =
    candidate.askingPrice === null && enrichment.updates.askingPrice !== null;
  const shouldApplyPhoto =
    !candidate.primaryPhotoUrl && Boolean(enrichment.updates.primaryPhotoUrl);
  const primaryPhotoUrl = shouldApplyPhoto
    ? enrichment.updates.primaryPhotoUrl
    : candidate.primaryPhotoUrl;
  const photoUrls = Array.from(
    new Set([
      ...(primaryPhotoUrl ? [primaryPhotoUrl] : []),
      ...enrichment.updates.photoUrls,
      ...candidate.photoUrls
    ])
  );
  const warnings = Array.from(
    new Set([
      ...candidate.warnings.filter((warning) => {
        if (
          shouldApplyPhoto &&
          [
            NO_EMAIL_HTML_PHOTO_WARNING,
            NO_PROPERTY_PHOTO_IN_HTML_WARNING,
            NO_MATCHING_PROPERTY_PHOTO_WARNING
          ].includes(warning)
        ) {
          return false;
        }

        if (shouldApplyPrice && warning === "No asking price found.") {
          return false;
        }

        return true;
      }),
      ...enrichment.warnings.map((warning) => `Enrichment: ${warning}`)
    ])
  );
  const warningsChanged =
    warnings.length !== candidate.warnings.length ||
    warnings.some((warning, index) => warning !== candidate.warnings[index]);

  if (!shouldApplyPrice && !shouldApplyPhoto && !warningsChanged) {
    return { candidate, changed: false };
  }

  return {
    candidate: {
      ...candidate,
      askingPrice: shouldApplyPrice
        ? enrichment.updates.askingPrice
        : candidate.askingPrice,
      primaryPhotoUrl,
      photoUrls,
      warnings,
      updatedAt:
        shouldApplyPrice || shouldApplyPhoto || warningsChanged
          ? timestamp
          : candidate.updatedAt
    },
    changed: shouldApplyPrice || shouldApplyPhoto
  };
}

function getMissingPhotoLabel(reason: string) {
  if (reason === NO_EMAIL_HTML_PHOTO_WARNING) {
    return "No email HTML";
  }

  if (reason === NO_PROPERTY_PHOTO_IN_HTML_WARNING) {
    return "No photo URL";
  }

  if (reason === NO_MATCHING_PROPERTY_PHOTO_WARNING) {
    return "No matching photo";
  }

  return "No photo in alert";
}

function getScorePreviewVariant(scorePreview: CandidateScorePreview | undefined) {
  if (!scorePreview) {
    return "outline" as const;
  }

  if (scorePreview.evaluation.hardRejected) {
    return "destructive" as const;
  }

  if (scorePreview.evaluation.normalizedScore >= 70) {
    return "success" as const;
  }

  if (scorePreview.evaluation.normalizedScore >= 45) {
    return "secondary" as const;
  }

  return "warning" as const;
}

function getScorePreviewLabel(scorePreview: CandidateScorePreview | undefined) {
  if (!scorePreview) {
    return "No score";
  }

  if (scorePreview.evaluation.hardRejected) {
    return "Rejected";
  }

  if (scorePreview.evaluation.normalizedScore >= 70) {
    return `Strong ${scorePreview.evaluation.normalizedScore}`;
  }

  if (scorePreview.evaluation.normalizedScore >= 45) {
    return `Possible ${scorePreview.evaluation.normalizedScore}`;
  }

  return `Weak ${scorePreview.evaluation.normalizedScore}`;
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
  const [candidateTriageFilter, setCandidateTriageFilter] =
    React.useState<CandidateTriageFilter>("all");
  const [candidateSortMode, setCandidateSortMode] =
    React.useState<CandidateSortMode>("received_desc");
  const [alertText, setAlertText] = React.useState(sampleAlertText);
  const [isPolling, setIsPolling] = React.useState(false);
  const [enrichingCandidateIds, setEnrichingCandidateIds] = React.useState<
    Set<string>
  >(() => new Set());
  const [loadSource, setLoadSource] = React.useState<"storage" | "empty" | "reset">(
    "empty"
  );
  const [actionStatus, setActionStatus] = React.useState("Ready");

  React.useEffect(() => {
    const alertResult = loadListingAlertState(window.localStorage);
    let loadedAlertState = alertResult.state;
    let shouldPersistAlertState = false;

    if (loadedAlertState.sources.length === 0) {
      loadedAlertState = upsertListingAlertSource(
        loadedAlertState,
        createDefaultSource()
      );
      shouldPersistAlertState = true;
    }

    const propertyResult = loadPropertyState(window.localStorage);
    const profileResult = loadProfileState(window.localStorage);
    const scoreResult = loadScoreState(window.localStorage);
    const loadedActiveProfile = getActiveProfile(profileResult.state);
    const geographyFilter = applyListingCandidateGeographyFilter(
      loadedAlertState,
      loadedActiveProfile
    );

    loadedAlertState = geographyFilter.state;

    if (shouldPersistAlertState || geographyFilter.ignoredCount > 0) {
      loadedAlertState = saveListingAlertState(
        window.localStorage,
        loadedAlertState
      );
    }

    const firstSource = loadedAlertState.sources[0] ?? null;

    setListingState(loadedAlertState);
    setPropertyState(propertyResult.state);
    setProfileState(profileResult.state);
    setScoreState(scoreResult.state);
    setSelectedSourceId(firstSource?.id ?? null);
    setSourceDraft(firstSource ? cloneSource(firstSource) : null);
    setLoadSource(alertResult.source === "empty" ? "storage" : alertResult.source);
    setActionStatus(
      geographyFilter.ignoredCount > 0
        ? `${geographyFilter.ignoredCount} ignored by geography`
        : "Ready"
    );
  }, []);

  const selectedSource = React.useMemo(
    () =>
      listingState.sources.find((source) => source.id === selectedSourceId) ??
      null,
    [listingState.sources, selectedSourceId]
  );

  const activeProfile = React.useMemo(() => {
    return getActiveProfile(profileState);
  }, [profileState]);

  const enabledTownCount = React.useMemo(
    () => countEnabledProfileTowns(activeProfile),
    [activeProfile]
  );

  const candidateCounts = React.useMemo(() => {
    return listingState.candidates.reduce<Record<string, number>>(
      (counts, candidate) => ({
        ...counts,
        [candidate.status]: (counts[candidate.status] ?? 0) + 1
      }),
      {}
    );
  }, [listingState.candidates]);

  const triageResult = React.useMemo(
    () =>
      filterAndSortListingCandidates({
        state: listingState,
        selectedSourceId,
        statusFilter: candidateStatusFilter,
        triageFilter: candidateTriageFilter,
        sortMode: candidateSortMode,
        activeProfile
      }),
    [
      activeProfile,
      candidateSortMode,
      candidateStatusFilter,
      candidateTriageFilter,
      listingState,
      selectedSourceId
    ]
  );
  const filteredCandidates = triageResult.candidates;
  const scorePreviews = triageResult.scorePreviews;
  const visibleNewCandidateIds = React.useMemo(
    () =>
      filteredCandidates
        .filter((candidate) => candidate.status === "new")
        .map((candidate) => candidate.id),
    [filteredCandidates]
  );
  const visibleEnrichableCandidates = React.useMemo(
    () => filteredCandidates.filter(canEnrichCandidate),
    [filteredCandidates]
  );

  const latestRun = listingState.runs[0] ?? null;
  const selectedSourceMessageCount = React.useMemo(() => {
    if (!selectedSourceId) {
      return 0;
    }

    return listingState.messages.filter(
      (message) => message.sourceId === selectedSourceId
    ).length;
  }, [listingState.messages, selectedSourceId]);

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
    const geographyFilter = applyListingCandidateGeographyFilter(
      result.state,
      activeProfile,
      timestamp
    );
    const geographyStatus =
      geographyFilter.ignoredCount > 0
        ? `, ${geographyFilter.ignoredCount} ignored by geography`
        : "";

    persistListingState(
      geographyFilter.state,
      `${result.run.candidatesCreated} new, ${result.run.candidatesUpdated} updated${geographyStatus}`
    );
  }

  function handleReprocessQueue() {
    if (!selectedSource || selectedSourceMessageCount === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const result = reprocessListingAlertMessages(
      listingState,
      selectedSource.id,
      timestamp
    );
    const geographyFilter = applyListingCandidateGeographyFilter(
      result.state,
      activeProfile,
      timestamp
    );
    const geographyStatus =
      geographyFilter.ignoredCount > 0
        ? `, ${geographyFilter.ignoredCount} ignored by geography`
        : "";

    persistListingState(
      geographyFilter.state,
      `${result.messagesProcessed} messages reprocessed, ${result.candidatesCreated} new, ${result.candidatesUpdated} updated${geographyStatus}`
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
      const geographyFilter = applyListingCandidateGeographyFilter(
        nextListingState,
        activeProfile,
        pollResult.checkedAt
      );
      const geographyStatus =
        geographyFilter.ignoredCount > 0
          ? `, ${geographyFilter.ignoredCount} ignored by geography`
          : "";

      persistListingState(
        geographyFilter.state,
        `${pollResult.messages.length} messages, ${candidatesCreated} new, ${candidatesUpdated} updated${geographyStatus}`
      );
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Mailbox poll failed"
      );
    } finally {
      setIsPolling(false);
    }
  }

  async function fetchCandidateEnrichment(candidate: ListingCandidate) {
    const response = await fetch("/api/listing-alerts/enrich-listing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          id: candidate.id,
          listingUrl: candidate.listingUrl,
          addressLine1: candidate.addressLine1,
          city: candidate.city,
          state: candidate.state,
          postalCode: candidate.postalCode,
          askingPrice: candidate.askingPrice,
          primaryPhotoUrl: candidate.primaryPhotoUrl,
          photoUrls: candidate.photoUrls
        }
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "Listing enrichment failed."
      );
    }

    return listingCandidateEnrichmentResponseSchema.parse(payload);
  }

  async function handleEnrichCandidates(candidates: ListingCandidate[]) {
    const enrichableCandidates = candidates.filter(canEnrichCandidate);

    if (enrichableCandidates.length === 0) {
      return;
    }

    setEnrichingCandidateIds(
      (currentIds) =>
        new Set([
          ...Array.from(currentIds),
          ...enrichableCandidates.map((candidate) => candidate.id)
        ])
    );
    setActionStatus(`Enriching ${enrichableCandidates.length} candidate(s)`);

    try {
      const results: ListingCandidateEnrichmentResponse[] = [];
      const errors: string[] = [];

      for (const candidate of enrichableCandidates) {
        try {
          results.push(await fetchCandidateEnrichment(candidate));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Enrichment failed");
        }
      }

      const timestamp = new Date().toISOString();
      let enrichedCount = 0;
      const nextCandidates = listingState.candidates.map((candidate) => {
        const enrichment = results.find(
          (result) => result.candidateId === candidate.id
        );

        if (!enrichment) {
          return candidate;
        }

        const merged = mergeEnrichmentIntoCandidate(
          candidate,
          enrichment,
          timestamp
        );

        if (merged.changed) {
          enrichedCount += 1;
        }

        return merged.candidate;
      });
      const warningCount = results.reduce(
        (count, result) => count + result.warnings.length,
        0
      );
      const firstWarning = results
        .flatMap((result) => result.warnings)
        .find(Boolean);
      const firstError = errors.find(Boolean);
      const warningStatus =
        warningCount > 0
          ? `, ${warningCount} fetch warning(s)${
              firstWarning ? `: ${firstWarning}` : ""
            }`
          : "";
      const errorStatus =
        errors.length > 0
          ? `, ${errors.length} failed${firstError ? `: ${firstError}` : ""}`
          : "";

      persistListingState(
        {
          ...listingState,
          candidates: nextCandidates
        },
        `${enrichedCount} enriched${warningStatus}${errorStatus}`
      );
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Listing enrichment failed"
      );
    } finally {
      setEnrichingCandidateIds((currentIds) => {
        const nextIds = new Set(currentIds);

        for (const candidate of enrichableCandidates) {
          nextIds.delete(candidate.id);
        }

        return nextIds;
      });
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

  function handleIgnoreVisibleCandidates() {
    if (visibleNewCandidateIds.length === 0) {
      return;
    }

    const nextListingState = markListingCandidatesIgnored(
      listingState,
      visibleNewCandidateIds
    );
    persistListingState(
      nextListingState,
      `${visibleNewCandidateIds.length} visible candidate${
        visibleNewCandidateIds.length === 1 ? "" : "s"
      } ignored`
    );
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
            <Badge variant={enabledTownCount > 0 ? "outline" : "warning"}>
              {enabledTownCount} towns
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
            onClick={handleReprocessQueue}
            disabled={!selectedSource || selectedSourceMessageCount === 0}
          >
            <RefreshCw aria-hidden="true" />
            Reprocess
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
                  <Badge variant="outline">
                    {filteredCandidates.length} visible
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEnrichCandidates(visibleEnrichableCandidates)}
                  disabled={
                    visibleEnrichableCandidates.length === 0 ||
                    enrichingCandidateIds.size > 0
                  }
                >
                  <Sparkles aria-hidden="true" />
                  Enrich Missing
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleIgnoreVisibleCandidates}
                  disabled={visibleNewCandidateIds.length === 0}
                >
                  <XCircle aria-hidden="true" />
                  Ignore Visible
                </Button>
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
                  className="w-40"
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
                <Select
                  className="w-44"
                  value={candidateTriageFilter}
                  onChange={(event) =>
                    setCandidateTriageFilter(
                      event.target.value as CandidateTriageFilter
                    )
                  }
                >
                  {triageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  className="w-40"
                  value={candidateSortMode}
                  onChange={(event) =>
                    setCandidateSortMode(event.target.value as CandidateSortMode)
                  }
                >
                  {sortOptions.map((option) => (
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
                No candidates match the current source, status, and triage
                filters.
              </div>
            ) : (
              filteredCandidates.map((candidate) => {
                const provenance = getCandidateProvenance(candidate, listingState);
                const missingPhotoReason = getMissingPhotoReason(candidate);
                const missingPhotoLabel =
                  getMissingPhotoLabel(missingPhotoReason);
                const scorePreview = scorePreviews.get(candidate.id);
                const listingSourceLabel = getListingSourceLabel(provenance);
                const isEnrichingCandidate = enrichingCandidateIds.has(
                  candidate.id
                );

                return (
                  <article key={candidate.id} className="p-4 sm:p-5">
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row">
                        {candidate.primaryPhotoUrl ? (
                          <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-md border border-border bg-secondary sm:h-28 sm:w-40">
                            <Image
                              src={candidate.primaryPhotoUrl}
                              alt={`${formatAddress(candidate)} listing photo`}
                              fill
                              sizes="(min-width: 640px) 160px, 100vw"
                              className="object-cover"
                              loading="lazy"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div
                            className="flex h-32 w-full shrink-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary px-3 text-center text-xs font-medium text-muted-foreground sm:h-28 sm:w-40"
                            title={missingPhotoReason}
                          >
                            <ImageOff aria-hidden="true" className="size-5" />
                            <span>{missingPhotoLabel}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
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
                            {activeProfile ? (
                              <Badge variant={getScorePreviewVariant(scorePreview)}>
                                {getScorePreviewLabel(scorePreview)}
                              </Badge>
                            ) : null}
                            {candidate.primaryPhotoUrl ? (
                              <Badge variant="outline">
                                {candidate.photoUrls.length || 1} photo
                              </Badge>
                            ) : (
                              <Badge variant="warning">{missingPhotoLabel}</Badge>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap items-stretch gap-2">
                            <div
                              className={`rounded-md border px-3 py-2 ${
                                candidate.askingPrice === null
                                  ? "border-amber-200 bg-amber-50 text-amber-900"
                                  : "border-border bg-background"
                              }`}
                            >
                              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                                Price
                              </div>
                              <div className="text-base font-semibold leading-tight">
                                {formatCurrency(candidate.askingPrice)}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                                Beds
                              </div>
                              <div className="text-base font-semibold leading-tight">
                                {candidate.bedrooms ?? "-"}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                                Baths
                              </div>
                              <div className="text-base font-semibold leading-tight">
                                {candidate.bathrooms ?? "-"}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                                Sqft
                              </div>
                              <div className="text-base font-semibold leading-tight">
                                {formatNumber(candidate.livingSqft) ?? "-"}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2">
                              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                                Acres
                              </div>
                              <div className="text-base font-semibold leading-tight">
                                {candidate.lotAcres ?? "-"}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {listingSourceLabel}
                            </span>
                            <span>{formatDateTime(provenance.receivedAt)}</span>
                            {provenance.messageSubject ? (
                              <span className="block max-w-[32rem] truncate">
                                {provenance.messageSubject}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 max-w-5xl text-sm text-muted-foreground">
                            {candidate.listingRemarks || candidate.rawText}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {scorePreview?.evaluation.hardRejectReasons
                              .slice(0, 1)
                              .map((reason) => (
                                <Badge key={reason.ruleKey} variant="destructive">
                                  Reject: {reason.label}
                                </Badge>
                              ))}
                            {scorePreview &&
                            scorePreview.evaluation.missingData.length > 0 ? (
                              <Badge
                                variant="warning"
                                title={formatScoreGapTitle(
                                  scorePreview.evaluation.missingData
                                )}
                              >
                                {formatScoreGapCount(
                                  scorePreview.evaluation.missingData.length
                                )}
                              </Badge>
                            ) : null}
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
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:max-w-64 xl:justify-end">
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
                        {canEnrichCandidate(candidate) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEnrichCandidates([candidate])}
                            disabled={isEnrichingCandidate}
                          >
                            <Sparkles
                              aria-hidden="true"
                              className={cn(isEnrichingCandidate && "animate-spin")}
                            />
                            Enrich
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
