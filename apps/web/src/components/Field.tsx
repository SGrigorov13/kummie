import type { InputHTMLAttributes } from "react";
import { AlertIcon } from "./Icons";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string | undefined;
};

/** Label above, 44px min height, radius 8px; errors in ink with an icon — never colour alone. */
export function Field({ id, label, error, ...input }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error ? (
        <p className="field__error" id={errorId}>
          <AlertIcon />
          {error}
        </p>
      ) : null}
    </div>
  );
}
