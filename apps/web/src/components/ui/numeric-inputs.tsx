import type { ChangeEvent, ComponentProps, FocusEvent } from "react";

import {
  formatFixed,
  parseFiniteNumber,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-policy";

import { Input } from "./input";

interface BaseNumericInputProps extends Omit<
  ComponentProps<typeof Input>,
  "onChange" | "type" | "value"
> {
  onValueChange: (value: string) => void;
  value?: string;
}

interface DecimalInputProps extends BaseNumericInputProps {
  digits: number;
}

function DecimalInput({
  digits,
  onBlur,
  onValueChange,
  value = "",
  ...props
}: DecimalInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(sanitizeDecimalInput(event.target.value, digits));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = parseFiniteNumber(event.target.value);
    if (event.target.value.trim() === "") {
      onBlur?.(event);
      return;
    }

    if (parsed === null) {
      onValueChange("");
      onBlur?.(event);
      return;
    }

    onValueChange(formatFixed(parsed, digits));
    onBlur?.(event);
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function WholeNumberInput({
  onBlur,
  onValueChange,
  value = "",
  ...props
}: BaseNumericInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(sanitizeIntegerInput(event.target.value));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = parseFiniteNumber(event.target.value);
    if (event.target.value.trim() === "") {
      onBlur?.(event);
      return;
    }

    if (parsed === null) {
      onValueChange("");
      onBlur?.(event);
      return;
    }

    onValueChange(String(Math.max(0, Math.trunc(parsed))));
    onBlur?.(event);
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function MoneyInput(props: BaseNumericInputProps) {
  return <DecimalInput digits={2} {...props} />;
}

function MileageInput(props: BaseNumericInputProps) {
  return <DecimalInput digits={2} {...props} />;
}

export { MileageInput, MoneyInput, WholeNumberInput };
