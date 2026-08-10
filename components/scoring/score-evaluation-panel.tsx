import type React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  MinusCircle,
  PlusCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ScoreEvaluation } from "@/lib/scoring/types";

function formatPoints(points: number) {
  if (points > 0) {
    return `+${points}`;
  }

  return points.toString();
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
              <Badge variant={evaluation.hardRejected ? "destructive" : "success"}>
                {evaluation.scoreLabel}
              </Badge>
              <Badge variant="outline">Profile v{evaluation.profileVersion}</Badge>
              <Badge variant="outline">Engine {evaluation.scoringEngineVersion}</Badge>
            </div>
            <div className="mt-3 text-4xl font-semibold">
              {evaluation.normalizedScore}
              <span className="text-base font-medium text-muted-foreground"> / 100</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {Object.entries(evaluation.categoryScores)
              .filter(([, points]) => points > 0)
              .map(([category, points]) => (
                <div
                  key={category}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="text-xs capitalize text-muted-foreground">
                    {category}
                  </div>
                  <div className="font-semibold">{points}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {evaluation.hardRejectReasons.length > 0 ? (
        <ResultSection
          title="Hard Rejections"
          icon={AlertTriangle}
          items={evaluation.hardRejectReasons}
        />
      ) : null}

      {evaluation.positiveFactors.length > 0 ? (
        <ResultSection
          title="Positive Contributors"
          icon={PlusCircle}
          items={evaluation.positiveFactors}
        />
      ) : null}

      {evaluation.penalties.length > 0 ? (
        <ResultSection
          title="Penalties"
          icon={MinusCircle}
          items={evaluation.penalties}
        />
      ) : null}

      {evaluation.missingData.length > 0 ? (
        <div className="rounded-md border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border p-4 text-sm font-semibold">
            <HelpCircle className="size-4" aria-hidden="true" />
            Missing Data
          </div>
          <div className="grid gap-2 p-4">
            {evaluation.missingData.map((item) => (
              <div key={item} className="text-sm text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background p-4 text-sm">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          No missing scoring data recorded.
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  icon: Icon,
  items
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: ScoreEvaluation["positiveFactors"];
}) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4 text-sm font-semibold">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={`${item.ruleKey}-${item.detail}`} className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.detail}
                </div>
              </div>
              <Badge variant={item.points < 0 ? "warning" : "outline"}>
                {formatPoints(item.points)}
              </Badge>
            </div>
            <Separator className="mt-3 sm:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
