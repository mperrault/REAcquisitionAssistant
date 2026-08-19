import type React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  MinusCircle,
  PlusCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RuleResult, ScoreEvaluation } from "@/lib/scoring/types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

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

function formatCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
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

function formatScoreGapCount(count: number) {
  return `${count} ${count === 1 ? "score gap" : "score gaps"}`;
}

export function ScoreEvaluationPanel({
  evaluation
}: {
  evaluation: ScoreEvaluation;
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
              <Badge variant="outline">Profile v{evaluation.profileVersion}</Badge>
              <Badge variant="outline">
                Engine {evaluation.scoringEngineVersion}
              </Badge>
              <Badge variant="outline">Raw {evaluation.rawScore}</Badge>
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

      <CategoryScores scores={evaluation.categoryScores} />

      <ResultSection
        title="Hard Rejections"
        icon={AlertTriangle}
        items={evaluation.hardRejectReasons}
        emptyText="No hard-reject rules matched."
      />

      <ResultSection
        title="Positive Factors"
        icon={PlusCircle}
        items={evaluation.positiveFactors}
        emptyText="No positive scoring factors matched."
      />

      <ResultSection
        title="Penalties"
        icon={MinusCircle}
        items={evaluation.penalties}
        emptyText="No scoring penalties matched."
      />

      <ScoreGapsSection items={evaluation.missingData} />
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
  scores
}: {
  scores: ScoreEvaluation["categoryScores"];
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-4 text-sm font-semibold">
        Category Scores
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(scores).map(([category, points]) => (
          <div
            key={category}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <span className="truncate text-sm text-muted-foreground">
              {formatCategoryLabel(category)}
            </span>
            <span className="shrink-0 text-sm font-semibold">
              {formatPoints(points)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

function ScoreGapsSection({
  items
}: {
  items: ScoreEvaluation["missingData"];
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4 text-sm font-semibold">
        <HelpCircle className="size-4" aria-hidden="true" />
        Score Gaps
        {items.length > 0 ? (
          <Badge variant="warning">{formatScoreGapCount(items.length)}</Badge>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2 p-4">
          {items.map((item) => (
            <div key={item} className="text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          No score gaps recorded.
        </div>
      )}
    </div>
  );
}
