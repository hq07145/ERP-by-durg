"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type ConfirmSubmitProps = {
  action: (formData: FormData) => Promise<never>;
  fieldName: string;
  fieldValue: string;
  label: string;
  confirmation: string;
  className?: string;
  hiddenFields?: Record<string, string>;
};

function SubmitButton({
  label,
  confirmation,
  className,
}: {
  label: string;
  confirmation: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className ?? ""} ${
        pending ? "opacity-60 cursor-wait inline-flex items-center gap-1.5 pointer-events-none" : ""
      }`}
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (pending || !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      <span>{pending ? "Updating..." : label}</span>
    </button>
  );
}

export default function ConfirmSubmit({
  action,
  fieldName,
  fieldValue,
  label,
  confirmation,
  className,
  hiddenFields,
}: ConfirmSubmitProps) {
  return (
    <form action={action}>
      <input type="hidden" name={fieldName} value={fieldValue} />
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        label={label}
        confirmation={confirmation}
        className={className}
      />
    </form>
  );
}
