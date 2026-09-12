import type React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  RuleResult,
  ScoreBadge,
  ScoreEvaluation
} from "@/lib/scoring/types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];
type ScoreCategory = RuleResult["category"];
type CategoryLabels = Partial<Record<ScoreCategory, string>>;

const categoryDisplayLabels: Record<ScoreCategory, string> = {
  location: "Location Signals",
  setting: "Setting & Views",
  style: "House Style",
  renovation: "Renovation Fit",
  financial: "Financial Value",
  resale: "Resale Signals",
  maintenance: "Maintenance Burden",
  risk: "Risk Penalties",
  utility: "Systems & Utilities"
};

const categoryDisplayOrder: ScoreCategory[] = [
  "location",
  "setting",
  "style",
  "renovation",
  "financial",
  "resale",
  "maintenance",
  "risk",
  "utility"
];

function formatPoints(points: number) {
  if (points > 0) {
    return `+${points}`;
  }

  return points.toString();
}

function formatRulePoints(item: RuleResult) {
  if (item.result === "hard_reject") {
    return "Hard reject";
  }

  return formatPoints(item.points);
}

function formatCategoryLabel(
  category: ScoreCategory,
  categoryLabels?: CategoryLabels
) {
  return categoryLabels?.[category] ?? categoryDisplayLabels[category];
}

function getRuleResultVariant(item: RuleResult): BadgeVariant {
  if (item.result === "hard_reject") {
    return "destructive";
  }

  if (item.result === "penalty" || item.points < 0) {
    return "warning";
  }

  if (item.result === "bonus" || item.points > 0) {
    return "success";
  }

  return "outline";
}

function getMetricVariant(value: number): BadgeVariant {
  return value > 0 ? "warning" : "outline";
}

function getScoreBadgeVariant(badge: ScoreBadge): BadgeVariant {
  if (badge.tone === "success") {
    return "success";
  }

  if (badge.tone === "warning") {
    return "warning";
  }

  if (badge.tone === "secondary") {
    return "secondary";
  }

  return "outline";
}

export function ScoreEvaluationPanel({
  evaluation,
  categoryMaxScores,
  categoryLabels,
  isPreview = false
}: {
  evaluation: ScoreEvaluation;
  categoryMaxScores?: Partial<Record<ScoreCategory, number>>;
  categoryLabels?: CategoryLabels;
  isPreview?: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={evaluation.hardRejected ? "destructive" : "success"}
              >
                {evaluation.scoreLabel}
              </Badge>
              <Badge variant="outline">Setup v{evaluation.profileVersion}</Badge>
              <Badge variant="outline">
                Engine {evaluation.scoringEngineVersion}
              </Badge>
              <Badge variant="outline">Raw {evaluation.rawScore}</Badge>
              {isPreview ? <Badge variant="warning">Draft score</Badge> : null}
            </div>
            <div className="mt-3 text-4xl font-semibold">
              {evaluation.normalizedScore}
              <span className="text-base font-medium text-muted-foreground">
                {" "}
                / 100
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()}
            </div>
            {evaluation.badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {evaluation.badges.map((badge) => (
                  <Badge
                    key={badge.key}
                    variant={getScoreBadgeVariant(badge)}
                    title={badge.detail}
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <ScoreMetric
              label="Hard Rejects"
              value={evaluation.hardRejectReasons.length}
              variant={
                evaluation.hardRejectReasons.length > 0
                  ? "destructive"
                  : "outline"
              }
            />
            <ScoreMetric
              label="Positives"
              value={evaluation.positiveFactors.length}
              variant={
                evaluation.positiveFactors.length > 0 ? "success" : "outline"
              }
            />
            <ScoreMetric
              label="Penalties"
              value={evaluation.penalties.length}
              variant={getMetricVariant(evaluation.penalties.length)}
            />
            <ScoreMetric
              label="Score Gaps"
              value={evaluation.missingData.length}
              variant={getMetricVariant(evaluation.missingData.length)}
            />
          </div>
        </div>
      </div>

      <ScoreDriverSummary evaluation={evaluation} />

      <CategoryScores
        evaluation={evaluation}
        categoryMaxScores={categoryMaxScores}
        categoryLabels={categoryLabels}
      />

      <ScoreDrivers
        evaluation={evaluation}
        categoryMaxScores={categoryMaxScores}
        categoryLabels={categoryLabels}
      />

      <ScoreImprovementSection evaluation={evaluation} />

      <ResultSection
        title="Hard Rejections"
        icon={AlertTriangle}
        items={evaluation.hardRejectReasons}
        emptyText="No hard-reject rules matched."
      />
    </div>
  );
}

function ScoreDriverSummary({
  evaluation
}: {
  evaluation: ScoreEvaluation;
}) {
  const helped = evaluation.positiveFactors.slice(0, 3);
  const hurt = [...evaluation.penalties, ...evaluation.hardRejectReasons].slice(
    0,
    3
  );
  const gaps = evaluation.missingData.slice(0, 3);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-4 text-sm font-semibold">
        Score Summary
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <ScoreSummaryColumn
          title="What Helped"
          items={helped.map((item) => ({
            key: `${item.ruleKey}-${item.detail}`,
            label: item.label,
            badgeLabel: formatRulePoints(item),
            detail: `${formatRulePoints(item)} · ${item.detail}`,
            variant: "success" as BadgeVariant
          }))}
          emptyText="No positive scoring drivers matched."
        />
        <ScoreSummaryColumn
          title="What Hurt"
          items={hurt.map((item) => ({
            key: `${item.ruleKey}-${item.result}-${item.detail}`,
            label: item.label,
            badgeLabel: formatRulePoints(item),
            detail: `${formatRulePoints(item)} · ${item.detail}`,
            variant: getRuleResultVariant(item)
          }))}
          emptyText="No penalties or hard rejections matched."
        />
        <ScoreSummaryColumn
          title="What To Resolve"
          items={gaps.map((item) => ({
            key: item,
            label: item,
            badgeLabel: "Gap",
            detail: "",
            variant: "warning" as BadgeVariant
          }))}
          emptyText="No score gaps recorded."
        />
      </div>
    </div>
  );
}

function ScoreSummaryColumn({
  title,
  items,
  emptyText
}: {
  title: string;
  items: Array<{
    key: string;
    label: string;
    badgeLabel: string;
    detail: string;
    variant: BadgeVariant;
  }>;
  emptyText: string;
}) {
  return (
    <div className="grid content-start gap-2 rounded-md border border-border bg-card p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {title}
      </div>
      {items.length > 0 ? (
        items.map((item) => (
          <div key={item.key} className="grid gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{item.label}</span>
              <Badge variant={item.variant}>{item.badgeLabel}</Badge>
            </div>
            {item.detail ? (
              <div className="text-xs text-muted-foreground">
                {item.detail.replace(/^.*? · /, "")}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

function ScoreMetric({
  label,
  value,
  variant
}: {
  label: string;
  value: number;
  variant: BadgeVariant;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Badge variant={variant} className="mt-1">
        {value}
      </Badge>
    </div>
  );
}

function CategoryScores({
  evaluation,
  categoryMaxScores,
  categoryLabels
}: {
  evaluation: ScoreEvaluation;
  categoryMaxScores?: Partial<Record<ScoreCategory, number>>;
  categoryLabels?: CategoryLabels;
}) {
  const groups = getCategoryDriverGroups(evaluation, categoryMaxScores);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-4 text-sm font-semibold">
        Scoring Priorities
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const missedPoints =
            group.maxPoints !== null
              ? Math.max(0, group.maxPoints - group.earned)
              : null;

          return (
            <div
              key={group.category}
              className="grid gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-muted-foreground">
                  {formatCategoryLabel(group.category, categoryLabels)}
                </span>
                <span className="shrink-0 text-sm font-semibold">
                  {formatPoints(group.earned)}
                  {group.maxPoints !== null ? (
                    <span className="font-medium text-muted-foreground">
                      {" "}
                      / {group.maxPoints}
                    </span>
                  ) : null}
                </span>
              </div>
              {missedPoints !== null ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={missedPoints > 0 ? "warning" : "success"}>
                    {missedPoints} missed
                  </Badge>
                  <span>{group.maxPoints} max points</span>
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {getCategoryScoreDetail(evaluation, group.category, group.earned, categoryLabels)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreDrivers({
  evaluation,
  categoryMaxScores,
  categoryLabels
}: {
  evaluation: ScoreEvaluation;
  categoryMaxScores?: Partial<Record<ScoreCategory, number>>;
  categoryLabels?: CategoryLabels;
}) {
  const groups = getCategoryDriverGroups(evaluation, categoryMaxScores);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-4 text-sm font-semibold">
        Scoring Priority Details
      </div>
      <div className="grid gap-3 p-4">
        {groups.map((group) => (
          <div
            key={group.category}
            className="grid gap-3 rounded-md border border-border bg-card p-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold">
                {formatCategoryLabel(group.category, categoryLabels)}
              </div>
              <Badge variant={group.earned > 0 ? "success" : "outline"}>
                {formatPoints(group.earned)}
                {group.maxPoints !== null ? ` / ${group.maxPoints}` : ""}
              </Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <RuleList
                title="Positives"
                items={group.positiveFactors}
                emptyText="No positives."
              />
              <RuleList
                title="Penalties"
                items={[...group.penalties, ...group.hardRejectReasons]}
                emptyText="No penalties."
              />
              <GapList items={group.missingData} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreImprovementSection({
  evaluation
}: {
  evaluation: ScoreEvaluation;
}) {
  const items = getScoreImprovementItems(evaluation);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4 text-sm font-semibold">
        <HelpCircle className="size-4" aria-hidden="true" />
        What Would Improve This Score
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2 p-4">
          {items.map((item) => (
            <div
              key={`${item.label}-${item.detail}`}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.detail}
                </div>
              </div>
              <Badge variant={item.variant}>{item.badge}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          No immediate score improvements identified.
        </div>
      )}
    </div>
  );
}

function RuleList({
  title,
  items,
  emptyText
}: {
  title: string;
  items: RuleResult[];
  emptyText: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {title}
      </div>
      {items.length > 0 ? (
        items.map((item) => (
          <div key={`${item.ruleKey}-${item.result}-${item.detail}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{item.label}</span>
              <Badge variant={getRuleResultVariant(item)}>
                {formatRulePoints(item)}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {item.detail}
            </div>
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

function GapList({ items }: { items: string[] }) {
  return (
    <div className="grid content-start gap-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Gaps
      </div>
      {items.length > 0 ? (
        items.map((item) => (
          <div key={item} className="text-sm text-muted-foreground">
            {item}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">No gaps.</div>
      )}
    </div>
  );
}

function getCategoryDriverGroups(
  evaluation: ScoreEvaluation,
  categoryMaxScores?: Partial<Record<ScoreCategory, number>>
) {
  const categories = new Set<ScoreCategory>([
    ...(Object.keys(categoryMaxScores ?? {}) as ScoreCategory[]),
    ...(Object.keys(evaluation.categoryScores) as ScoreCategory[])
  ]);

  for (const item of [
    ...evaluation.positiveFactors,
    ...evaluation.penalties,
    ...evaluation.hardRejectReasons
  ]) {
    categories.add(item.category);
  }

  for (const gap of evaluation.missingData) {
    const category = getGapCategory(gap);
    if (category) {
      categories.add(category);
    }
  }

  return [...categories]
    .map((category) => {
      const positiveFactors = evaluation.positiveFactors.filter(
        (item) => item.category === category
      );
      const penalties = evaluation.penalties.filter(
        (item) => item.category === category
      );
      const hardRejectReasons = evaluation.hardRejectReasons.filter(
        (item) => item.category === category
      );
      const missingData = evaluation.missingData.filter(
        (item) => getGapCategory(item) === category
      );

      return {
        category,
        earned: evaluation.categoryScores[category] ?? 0,
        maxPoints: categoryMaxScores?.[category] ?? null,
        positiveFactors,
        penalties,
        hardRejectReasons,
        missingData
      };
    })
    .filter(
      (group) =>
        group.maxPoints !== null ||
        group.earned !== 0 ||
        group.positiveFactors.length > 0 ||
        group.penalties.length > 0 ||
        group.hardRejectReasons.length > 0 ||
        group.missingData.length > 0
    )
    .sort(
      (a, b) =>
        categoryDisplayOrder.indexOf(a.category) -
        categoryDisplayOrder.indexOf(b.category)
    );
}

function getCategoryScoreDetail(
  evaluation: ScoreEvaluation,
  category: ScoreCategory,
  points: number,
  categoryLabels?: CategoryLabels
) {
  const categoryFactors = [
    ...evaluation.positiveFactors,
    ...evaluation.penalties,
    ...evaluation.hardRejectReasons
  ].filter((item) => item.category === category);

  if (categoryFactors.length > 0) {
    const labels = categoryFactors
      .slice(0, 2)
      .map((item) => item.label)
      .join(", ");

    return `${categoryFactors.length} matched: ${labels}`;
  }

  const categoryGap = getCategoryGap(evaluation.missingData, category);

  if (categoryGap) {
    return categoryGap;
  }

  if (points === 0) {
    return `No matching ${formatCategoryLabel(
      category,
      categoryLabels
    ).toLowerCase()} facts scored.`;
  }

  return "Score came from derived category rules.";
}

function getCategoryGap(missingData: string[], category: string) {
  return missingData.find((item) => getGapCategory(item) === category);
}

function getGapCategory(item: string) {
  const patterns: Record<ScoreCategory, RegExp> = {
    location: /town|state|drive time|commute/i,
    setting: /setting|view|acreage|lot acreage/i,
    style: /style/i,
    renovation: /renovation/i,
    financial: /asking price|purchase price|investment|financial/i,
    resale: /resale/i,
    maintenance: /maintenance/i,
    risk: /risk/i,
    utility: /utility/i
  };

  return Object.entries(patterns).find(([, pattern]) =>
    pattern.test(item)
  )?.[0] as ScoreCategory | undefined;
}

function getScoreImprovementItems(evaluation: ScoreEvaluation) {
  return [
    ...evaluation.hardRejectReasons.map((item) => ({
      label: item.label,
      detail: item.detail,
      badge: "Hard reject",
      variant: "destructive" as BadgeVariant
    })),
    ...evaluation.penalties.map((item) => ({
      label: item.label,
      detail: item.detail,
      badge: formatRulePoints(item),
      variant: getRuleResultVariant(item)
    })),
    ...evaluation.missingData.map((item) => ({
      label: "Resolve score gap",
      detail: item,
      badge: "Gap",
      variant: "warning" as BadgeVariant
    }))
  ].slice(0, 6);
}

function ResultSection({
  title,
  icon: Icon,
  items,
  emptyText
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: RuleResult[];
  emptyText: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4 text-sm font-semibold">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          items.map((item) => (
            <div
              key={`${item.ruleKey}-${item.result}-${item.detail}`}
              className="p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.detail}
                  </div>
                </div>
                <Badge variant={getRuleResultVariant(item)}>
                  {formatRulePoints(item)}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
