export const CITY_SERIES_COLORS = [
  "#2563eb",
  "#e5484d",
  "#168b6b",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#be185d",
  "#4d7c0f",
  "#9a5b36",
  "#52606d",
] as const;

const CITY_SERIES_COLOR_SET = new Set<string>(CITY_SERIES_COLORS);

export function reconcileCityColors(
  selectedCities: readonly string[],
  previousAssignments: ReadonlyMap<string, string>,
): Map<string, string> {
  const nextAssignments = new Map<string, string>();
  const usedColors = new Set<string>();

  for (const city of selectedCities) {
    const previousColor = previousAssignments.get(city);
    if (previousColor && CITY_SERIES_COLOR_SET.has(previousColor) && !usedColors.has(previousColor)) {
      nextAssignments.set(city, previousColor);
      usedColors.add(previousColor);
    }
  }

  for (const city of selectedCities) {
    if (nextAssignments.has(city)) continue;
    const availableColor = CITY_SERIES_COLORS.find((color) => !usedColors.has(color));
    if (!availableColor) break;
    nextAssignments.set(city, availableColor);
    usedColors.add(availableColor);
  }

  return nextAssignments;
}
