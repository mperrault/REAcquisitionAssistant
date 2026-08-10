import {
  type ListingAlertMessage,
  type ListingAlertMessageInput,
  type ListingAlertRun,
  listingAlertConnectorConfigDefaults,
  type ListingAlertSource,
  type ListingAlertSourceProvider,
  type ListingAlertState,
  type ListingCandidate,
  type ListingCandidateExtract,
  listingAlertMessageSchema,
  listingAlertRunSchema,
  listingAlertSourceSchema,
  listingAlertStateSchema,
  listingCandidateSchema
} from "@/lib/listing-alerts/types";
import {
  normalizeListingCandidateKey,
  parseListingAlertText
} from "@/lib/listing-alerts/listing-alert-parser";

export const LISTING_ALERT_STORAGE_KEY =
  "re-acquisition-assistant.listing-alerts.v1";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type LoadListingAlertStateResult = {
  state: ListingAlertState;
  source: "storage" | "empty" | "reset";
};

export type IngestListingAlertTextResult = {
  state: ListingAlertState;
  run: ListingAlertRun;
  message: ListingAlertMessage;
  candidates: ListingCandidate[];
};

function nowIso() {
  return new Date().toISOString();
}

function createListingAlertId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyListingAlertState(): ListingAlertState {
  return {
    schemaVersion: 1,
    sources: [],
    messages: [],
    candidates: [],
    runs: []
  };
}

export function createListingAlertSource(
  patch: Partial<ListingAlertSource> = {},
  timestamp = nowIso(),
  createId = () => createListingAlertId("source")
): ListingAlertSource {
  return listingAlertSourceSchema.parse({
    id: patch.id ?? createId(),
    provider: patch.provider ?? ("gmail_label" satisfies ListingAlertSourceProvider),
    name: patch.name ?? "Gmail Listing Alerts",
    enabled: patch.enabled ?? true,
    mailboxLabel: patch.mailboxLabel ?? "RE Acquisition Assistant",
    searchQuery:
      patch.searchQuery ??
      'label:"RE Acquisition Assistant" newer_than:30d -category:promotions',
    connectorConfig: {
      ...listingAlertConnectorConfigDefaults,
      ...patch.connectorConfig
    },
    pollingMinutes: patch.pollingMinutes ?? 30,
    lastCheckedAt: patch.lastCheckedAt ?? null,
    createdAt: patch.createdAt ?? timestamp,
    updatedAt: patch.updatedAt ?? timestamp
  });
}

export function loadListingAlertState(
  storage: StorageLike
): LoadListingAlertStateResult {
  const rawValue = storage.getItem(LISTING_ALERT_STORAGE_KEY);

  if (!rawValue) {
    return {
      state: createEmptyListingAlertState(),
      source: "empty"
    };
  }

  try {
    return {
      state: listingAlertStateSchema.parse(JSON.parse(rawValue)),
      source: "storage"
    };
  } catch {
    return {
      state: createEmptyListingAlertState(),
      source: "reset"
    };
  }
}

export function saveListingAlertState(
  storage: StorageLike,
  state: ListingAlertState
): ListingAlertState {
  const parsed = listingAlertStateSchema.parse(state);
  storage.setItem(LISTING_ALERT_STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

export function upsertListingAlertSource(
  state: ListingAlertState,
  source: ListingAlertSource,
  timestamp = nowIso()
): ListingAlertState {
  const parsedSource = listingAlertSourceSchema.parse({
    ...source,
    updatedAt: timestamp
  });
  const exists = state.sources.some((item) => item.id === parsedSource.id);

  return {
    ...state,
    sources: exists
      ? state.sources.map((item) =>
          item.id === parsedSource.id ? parsedSource : item
        )
      : [parsedSource, ...state.sources]
  };
}

function createListingAlertMessage(
  sourceId: string,
  input: ListingAlertMessageInput,
  timestamp: string,
  createId: () => string
) {
  return listingAlertMessageSchema.parse({
    id: createId(),
    sourceId,
    externalMessageId: input.externalMessageId ?? createId(),
    subject: input.subject ?? "",
    from: input.from ?? "",
    receivedAt: input.receivedAt ?? timestamp,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml ?? "",
    processedAt: timestamp,
    createdAt: timestamp
  });
}

function createListingCandidate(
  sourceId: string,
  message: ListingAlertMessage,
  extract: ListingCandidateExtract,
  timestamp: string,
  createId: () => string
) {
  return listingCandidateSchema.parse({
    ...extract,
    id: createId(),
    sourceId,
    messageId: message.id,
    externalMessageId: message.externalMessageId,
    status: "new",
    importedPropertyId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function upsertMessage(
  messages: ListingAlertMessage[],
  message: ListingAlertMessage
) {
  const exists = messages.some(
    (item) =>
      item.sourceId === message.sourceId &&
      item.externalMessageId === message.externalMessageId
  );

  return exists
    ? messages.map((item) =>
        item.sourceId === message.sourceId &&
        item.externalMessageId === message.externalMessageId
          ? message
          : item
      )
    : [message, ...messages];
}

function upsertCandidates(
  existingCandidates: ListingCandidate[],
  nextCandidates: ListingCandidate[],
  timestamp: string
) {
  let candidatesCreated = 0;
  let candidatesUpdated = 0;
  const nextCandidateMap = new Map<string, ListingCandidate>();

  for (const candidate of existingCandidates) {
    nextCandidateMap.set(normalizeListingCandidateKey(candidate), candidate);
  }

  for (const candidate of nextCandidates) {
    const key = normalizeListingCandidateKey(candidate);
    const existing = nextCandidateMap.get(key);

    if (!existing) {
      nextCandidateMap.set(key, candidate);
      candidatesCreated += 1;
      continue;
    }

    nextCandidateMap.set(key, {
      ...existing,
      ...candidate,
      id: existing.id,
      status: existing.status,
      importedPropertyId: existing.importedPropertyId,
      createdAt: existing.createdAt,
      updatedAt: timestamp
    });
    candidatesUpdated += 1;
  }

  return {
    candidates: Array.from(nextCandidateMap.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    candidatesCreated,
    candidatesUpdated
  };
}

export function ingestListingAlertText(
  state: ListingAlertState,
  sourceId: string,
  input: ListingAlertMessageInput,
  timestamp = nowIso(),
  createId = () => createListingAlertId("alert")
): IngestListingAlertTextResult {
  const source = state.sources.find((item) => item.id === sourceId);

  if (!source) {
    throw new Error(`Listing alert source ${sourceId} does not exist.`);
  }

  const message = createListingAlertMessage(sourceId, input, timestamp, createId);
  const parseResult = parseListingAlertText(input.bodyText, {
    timestamp,
    createId
  });
  const parsedCandidates = parseResult.candidates.map((candidate) =>
    createListingCandidate(sourceId, message, candidate, timestamp, createId)
  );
  const upsertedCandidates = upsertCandidates(
    state.candidates,
    parsedCandidates,
    timestamp
  );
  const run = listingAlertRunSchema.parse({
    id: createId(),
    sourceId,
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
    messagesSeen: 1,
    candidatesCreated: upsertedCandidates.candidatesCreated,
    candidatesUpdated: upsertedCandidates.candidatesUpdated,
    warnings: [
      ...parseResult.warnings,
      ...parsedCandidates.flatMap((candidate) => candidate.warnings)
    ]
  });
  const nextSources = state.sources.map((item) =>
    item.id === sourceId
      ? listingAlertSourceSchema.parse({
          ...item,
          lastCheckedAt: timestamp,
          updatedAt: timestamp
        })
      : item
  );
  const nextState = listingAlertStateSchema.parse({
    ...state,
    sources: nextSources,
    messages: upsertMessage(state.messages, message),
    candidates: upsertedCandidates.candidates,
    runs: [run, ...state.runs]
  });

  return {
    state: nextState,
    run,
    message,
    candidates: parsedCandidates
  };
}

export function markListingCandidateImported(
  state: ListingAlertState,
  candidateId: string,
  propertyId: string,
  timestamp = nowIso()
): ListingAlertState {
  return listingAlertStateSchema.parse({
    ...state,
    candidates: state.candidates.map((candidate) =>
      candidate.id === candidateId
        ? {
            ...candidate,
            status: "imported",
            importedPropertyId: propertyId,
            updatedAt: timestamp
          }
        : candidate
    )
  });
}

export function markListingAlertSourceChecked(
  state: ListingAlertState,
  sourceId: string,
  timestamp = nowIso()
): ListingAlertState {
  return listingAlertStateSchema.parse({
    ...state,
    sources: state.sources.map((source) =>
      source.id === sourceId
        ? {
            ...source,
            lastCheckedAt: timestamp,
            updatedAt: timestamp
          }
        : source
    )
  });
}

export function clearListingAlertQueue(
  state: ListingAlertState
): ListingAlertState {
  return listingAlertStateSchema.parse({
    ...state,
    messages: [],
    candidates: [],
    runs: []
  });
}

export function markListingCandidateIgnored(
  state: ListingAlertState,
  candidateId: string,
  timestamp = nowIso()
): ListingAlertState {
  return listingAlertStateSchema.parse({
    ...state,
    candidates: state.candidates.map((candidate) =>
      candidate.id === candidateId
        ? {
            ...candidate,
            status: "ignored",
            updatedAt: timestamp
          }
        : candidate
    )
  });
}
