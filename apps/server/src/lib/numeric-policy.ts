const EPSILON_MULTIPLIER = 8;

const getTolerance = (value: number) =>
  Number.EPSILON * Math.max(1, Math.abs(value)) * EPSILON_MULTIPLIER;

export const roundToFractionDigits = (value: number, digits: number) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  const absolute = Math.abs(value);
  const rounded = Math.round((absolute + Number.EPSILON) * factor) / factor;

  return value < 0 ? -rounded : rounded;
};

export const hasMaxFractionDigits = (value: number, digits: number) => {
  if (!Number.isFinite(value)) {
    return false;
  }

  const rounded = roundToFractionDigits(value, digits);
  return Math.abs(value - rounded) <= getTolerance(value);
};

export const formatFixed = (value: number, digits: number) =>
  roundToFractionDigits(value, digits).toFixed(digits);

export const sanitizeDecimalInput = (raw: string, _digits: number) => {
  const cleaned = raw.replaceAll(/[^0-9.]/gu, "");
  if (!cleaned) {
    return "";
  }

  const firstDotIndex = cleaned.indexOf(".");
  const normalized =
    firstDotIndex === -1
      ? cleaned
      : `${cleaned.slice(0, firstDotIndex)}.${cleaned
          .slice(firstDotIndex + 1)
          .replaceAll(".", "")}`;

  const [wholePart = "", fractionPart] = normalized.split(".");
  const trimmedWhole = wholePart.replaceAll(/^0+(?=\d)/gu, "");
  const normalizedWhole =
    trimmedWhole || (normalized.startsWith(".") ? "0" : "");

  if (fractionPart !== undefined) {
    return `${normalizedWhole || "0"}.${fractionPart}`;
  }

  return normalizedWhole;
};

export const sanitizeIntegerInput = (raw: string) => {
  const cleaned = raw.replaceAll(/[^0-9]/gu, "");
  if (!cleaned) {
    return "";
  }

  return cleaned.replaceAll(/^0+(?=\d)/gu, "");
};

export const parseFiniteNumber = (raw: unknown) => {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
