import { type ReadingSurvivalStats } from "../../../data/user/reading-survival-stats";
import type * as Line from "./stats-line-family-chart.types";

const COLOR = "#e91e63";
const AXIS = { titleSize: 12, titleWeight: "bold", tickSize: 11 } as const;

export function buildReadingSurvivalView(
  stats: ReadingSurvivalStats,
  context: Line.LinePresenterContext,
): Line.LineChartView {
  const { locale, translate } = context;
  const t = (key: string, params?: Record<string, unknown>) =>
    translate(`statsUser.readingSurvival.${key}`, params);
  const medianDropout = stats.medianDropout
    ? stats.medianDropout.from === stats.medianDropout.to
      ? `${stats.medianDropout.to}%`
      : `${stats.medianDropout.from}-${stats.medianDropout.to}%`
    : "100%+";
  const dangerZone = stats.dangerZone
    ? `${stats.dangerZone.from}-${stats.dangerZone.to}%`
    : "—";

  return {
    heading: t("title"),
    description: t("description"),
    emptyMessage: `${t("noData")} ${t("noDataHint")}`,
    hasData: stats.totalStarted > 0,
    labels: stats.points.map((point) => `${point.threshold}%`),
    series: [
      {
        id: "survival-rate",
        label: t("survivalRate"),
        color: COLOR,
        fillColor: "rgba(233, 30, 99, 0.15)",
        fill: true,
        stepped: true,
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBorderWidth: 2,
        points: stats.points.map((point) => ({
          value: point.survivalPercent,
          tooltipTitle: t("tooltipProgress", { label: `${point.threshold}%` }),
          tooltipLines: [
            t("tooltipSurvival", { value: point.survivalPercent.toFixed(1) }),
          ],
        })),
      },
    ],
    xAxis: { ...AXIS, title: t("axisProgressThreshold") },
    yAxes: [
      {
        ...AXIS,
        title: t("axisBooksSurviving"),
        minimum: 0,
        maximum: 100,
        tickFormat: "percent",
      },
    ],
    summary: [
      { label: t("started"), value: stats.totalStarted.toLocaleString(locale) },
      { label: t("completionRate"), value: `${stats.completionRate}%` },
      { label: t("medianDropout"), value: medianDropout },
      {
        label: t("dangerZone"),
        value: dangerZone,
        detail: stats.dangerZone
          ? `-${stats.dangerZone.dropPercent.toFixed(0)}%`
          : "",
      },
    ],
    tooltipAccent: COLOR,
    tooltipTitleSize: 13,
    tooltipBodySize: 12,
  };
}
