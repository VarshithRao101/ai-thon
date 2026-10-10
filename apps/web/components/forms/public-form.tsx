"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { nanoid } from "nanoid";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type FormDefinition,
  type FormField,
  optionsOf,
} from "@/lib/forms/schema";

type Props = { form: FormDefinition; workflowId: string };

type Done = { message: string; executionId?: string };

const INPUT_TYPE: Partial<Record<FormField["type"], string>> = {
  email: "email",
  phone: "tel",
  number: "number",
};
const AUTOCOMPLETE_BY_KEY: Record<string, string> = { name: "name" };

function FieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const common = {
    "aria-invalid": invalid || undefined,
    id: `f-${field.key}`,
    name: field.key,
    placeholder: field.placeholder,
    required: field.required,
    value,
  };
  if (field.type === "textarea") {
    return (
      <Textarea
        {...common}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        {...common}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {optionsOf(field).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const type = INPUT_TYPE[field.type] ?? "text";
  const autoComplete =
    field.type === "email" ? "email" : AUTOCOMPLETE_BY_KEY[field.key];
  return (
    <Input
      {...common}
      autoComplete={autoComplete}
      inputMode={field.type === "phone" ? "tel" : undefined}
      onChange={(e) => onChange(e.target.value)}
      type={type}
    />
  );
}

export function PublicForm({ form, workflowId }: Props) {
  // One id per page load: a double submit or a network retry runs the workflow once.
  const submissionId = useMemo(() => nanoid(24), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrors({});
    try {
      const response = await fetch(`/api/forms/${workflowId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, consent, website, submissionId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        executionId?: string;
        error?: string;
        errors?: Record<string, string>;
      };
      if (response.ok) {
        setDone({
          message: body.message ?? "Thanks!",
          executionId: body.executionId,
        });
        return;
      }
      setErrors(body.errors ?? {});
      setError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <output className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <p className="font-display font-semibold text-lg">{done.message}</p>
      </output>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      {form.fields.map((field) => (
        <div className="space-y-1.5" key={field.key}>
          <Label htmlFor={`f-${field.key}`}>
            {field.label}
            {field.required && <span className="text-primary"> *</span>}
          </Label>
          <FieldInput
            field={field}
            invalid={Boolean(errors[field.key])}
            onChange={(value) =>
              setValues((prev) => ({ ...prev, [field.key]: value }))
            }
            value={values[field.key] ?? ""}
          />
          {errors[field.key] && (
            <p className="text-destructive text-xs">{errors[field.key]}</p>
          )}
        </div>
      ))}

      {/* Honeypot: hidden from people, filled by bots. */}
      <div
        aria-hidden="true"
        className="absolute left-[-10000px] h-px w-px overflow-hidden"
      >
        <label htmlFor="f-website">Website</label>
        <input
          autoComplete="off"
          id="f-website"
          name="website"
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          value={website}
        />
      </div>

      {form.consentText && (
        <div className="space-y-1">
          <label
            className="flex items-start gap-2.5 text-sm"
            htmlFor="f-consent"
          >
            <input
              checked={consent}
              className="mt-0.5 size-4 accent-[var(--color-honey)]"
              id="f-consent"
              onChange={(e) => setConsent(e.target.checked)}
              type="checkbox"
            />
            <span className="text-muted-foreground">{form.consentText}</span>
          </label>
          {errors.consent && (
            <p className="text-destructive text-xs">{errors.consent}</p>
          )}
        </div>
      )}

      {error && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button
        className="h-11 w-full font-semibold"
        disabled={submitting}
        type="submit"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
      </Button>
    </form>
  );
}
