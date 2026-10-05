export type WeekStartsOn = "monday" | "sunday";

const DAYS_PER_WEEK = 7;

const WEEKDAY_LABELS_BY_START: Record<WeekStartsOn, string[]> = {
  monday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sunday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export const isWeekStartsOn = (value: unknown): value is WeekStartsOn =>
  value === "sunday" || value === "monday";

export const getWeekStartsOn = (
  value: unknown,
  fallback: WeekStartsOn = "sunday"
): WeekStartsOn => (isWeekStartsOn(value) ? value : fallback);

export const getWeekdayLabels = (weekStartsOn: WeekStartsOn) =>
  WEEKDAY_LABELS_BY_START[weekStartsOn];

export const getWeekStartOffset = (
  dayOfWeek: number,
  weekStartsOn: WeekStartsOn
) => {
  if (weekStartsOn === "monday") {
    return (dayOfWeek + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  }

  return dayOfWeek;
};

export const getWeekStartDate = (date: Date, weekStartsOn: WeekStartsOn) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = getWeekStartOffset(copy.getDay(), weekStartsOn);
  copy.setDate(copy.getDate() - offset);
  return copy;
};

export const getWeekStartDateUtc = (date: Date, weekStartsOn: WeekStartsOn) => {
  const copy = new Date(date);
  const offset = getWeekStartOffset(copy.getUTCDay(), weekStartsOn);
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
};
