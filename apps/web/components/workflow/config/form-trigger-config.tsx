"use client";

import {
  Copy,
  ExternalLink,
  GripVertical,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CONSENT,
  FIELD_TYPES,
  type FormField,
  type FormFieldType,
  fieldKeyFrom,
  formFromConfig,
} from "@/lib/forms/schema";

type Props = {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
  workflowId?: string;
};

const TRAILING_SLASH = /\/$/;
const NEW_QUESTION_KEY = /^question\d+$/;

/** Public base URL: the tunnel URL on stage (PUBLIC_APP_URL), else this origin. */
function usePublicBaseUrl(): string {
  const [base, setBase] = useState("");
  useEffect(() => {
    setBase(window.location.origin);
    fetch("/api/public-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { publicUrl?: string } | null) => {
        if (body?.publicUrl) {
          setBase(body.publicUrl.replace(TRAILING_SLASH, ""));
        }
      })
      .catch(() => undefined);
  }, []);
  return base;
}

function useQr(url: string, size: number): string {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    if (!url) {
      return;
    }
    QRCode.toDataURL(url, {
      margin: 1,
      width: size,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url, size]);
  return dataUrl;
}

export function FormTriggerConfig({
  config,
  onUpdateConfig,
  disabled,
  workflowId,
}: Props) {
  const form = useMemo(() => formFromConfig(config), [config]);
  const base = usePublicBaseUrl();
  const formUrl = workflowId && base ? `${base}/f/${workflowId}` : "";
  const qrSmall = useQr(formUrl, 200);
  const qrLarge = useQr(formUrl, 720);
  const [showQr, setShowQr] = useState(false);

  // Unset fields/consent fall back to the defaults everywhere (builder, page, runner).
  const saveFields = (fields: FormField[]) =>
    onUpdateConfig("formFields", JSON.stringify(fields));

  const updateField = (index: number, patch: Partial<FormField>) => {
    const fields = form.fields.map((f, i) =>
      i === index ? { ...f, ...patch } : f
    );
    saveFields(fields);
  };

  const addField = () => {
    const taken = new Set(form.fields.map((f) => f.key));
    let n = form.fields.length + 1;
    while (taken.has(`question${n}`)) {
      n += 1;
    }
    saveFields([
      ...form.fields,
      {
        key: `question${n}`,
        label: `Question ${n}`,
        type: "text",
        required: false,
      },
    ]);
  };

  const removeField = (index: number) =>
    saveFields(form.fields.filter((_, i) => i !== index));

  const copyUrl = () => {
    navigator.clipboard.writeText(formUrl);
    toast.success("Form link copied");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <Label className="ml-1">Public form link</Label>
        <div className="flex gap-2">
          <Input
            className="font-mono text-xs"
            readOnly
            value={formUrl || "Save the workflow first"}
          />
          <Button
            disabled={!formUrl}
            onClick={copyUrl}
            size="icon"
            title="Copy link"
            variant="outline"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            asChild
            disabled={!formUrl}
            size="icon"
            title="Open form"
            variant="outline"
          >
            <a href={formUrl || "#"} rel="noopener" target="_blank">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {qrSmall && (
            <button
              className="rounded-md bg-white p-1"
              onClick={() => setShowQr(true)}
              title="Show large QR code"
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: data URL QR code */}
              <img
                alt="QR code for the form"
                className="size-20"
                height={200}
                src={qrSmall}
                width={200}
              />
            </button>
          )}
          <div className="space-y-1 text-muted-foreground text-xs">
            <p>
              Publish the workflow to open the form. Submissions run the
              published version.
            </p>
            <Button
              className="h-7 px-2 text-xs"
              disabled={!qrLarge}
              onClick={() => setShowQr(true)}
              variant="secondary"
            >
              <QrCode className="mr-1 size-3.5" />
              Show QR for the audience
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="ml-1" htmlFor="formTitle">
          Form title
        </Label>
        <Input
          disabled={disabled}
          id="formTitle"
          onChange={(e) => onUpdateConfig("formTitle", e.target.value)}
          value={(config.formTitle as string) ?? form.title}
        />
      </div>
      <div className="space-y-2">
        <Label className="ml-1" htmlFor="formDescription">
          Description
        </Label>
        <Textarea
          disabled={disabled}
          id="formDescription"
          onChange={(e) => onUpdateConfig("formDescription", e.target.value)}
          rows={2}
          value={(config.formDescription as string) ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label className="ml-1">Questions</Label>
        <div className="space-y-2">
          {form.fields.map((field, index) => (
            <div className="space-y-2 rounded-lg border p-2.5" key={field.key}>
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  aria-label="Question"
                  className="h-8"
                  disabled={disabled}
                  onBlur={(e) => {
                    // New questions get a readable key from their label.
                    if (
                      NEW_QUESTION_KEY.test(field.key) &&
                      e.target.value.trim()
                    ) {
                      const key = fieldKeyFrom(e.target.value);
                      if (!form.fields.some((f) => f.key === key)) {
                        updateField(index, { key });
                      }
                    }
                  }}
                  onChange={(e) =>
                    updateField(index, { label: e.target.value })
                  }
                  value={field.label}
                />
                <Button
                  aria-label="Remove question"
                  className="size-8 shrink-0"
                  disabled={disabled || form.fields.length <= 1}
                  onClick={() => removeField(index)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <Select
                  disabled={disabled}
                  onValueChange={(value) =>
                    updateField(index, { type: value as FormFieldType })
                  }
                  value={field.type}
                >
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    checked={field.required}
                    disabled={disabled}
                    onChange={(e) =>
                      updateField(index, { required: e.target.checked })
                    }
                    type="checkbox"
                  />
                  Required
                </label>
                <code
                  className="ml-auto truncate text-[10px] text-muted-foreground"
                  title="Use in later steps"
                >
                  {field.key}
                </code>
              </div>
              {field.type === "select" && (
                <Input
                  className="ml-6 h-8 w-[calc(100%-1.5rem)] text-xs"
                  disabled={disabled}
                  onChange={(e) =>
                    updateField(index, { options: e.target.value })
                  }
                  placeholder="Options, comma-separated"
                  value={field.options ?? ""}
                />
              )}
            </div>
          ))}
        </div>
        <Button
          className="w-full"
          disabled={disabled}
          onClick={addField}
          size="sm"
          variant="outline"
        >
          <Plus className="mr-1 size-4" />
          Add question
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="ml-1" htmlFor="formConsentText">
          Consent text (DPDP)
        </Label>
        <Textarea
          disabled={disabled}
          id="formConsentText"
          onChange={(e) => onUpdateConfig("formConsentText", e.target.value)}
          rows={2}
          value={(config.formConsentText as string) ?? DEFAULT_CONSENT}
        />
        <p className="text-muted-foreground text-xs">
          People must tick this before submitting. Leave empty to skip.
        </p>
      </div>
      <div className="space-y-2">
        <Label className="ml-1" htmlFor="formSubmitMessage">
          Thank-you message
        </Label>
        <Input
          disabled={disabled}
          id="formSubmitMessage"
          onChange={(e) => onUpdateConfig("formSubmitMessage", e.target.value)}
          value={(config.formSubmitMessage as string) ?? form.submitMessage}
        />
      </div>

      <Dialog onOpenChange={setShowQr} open={showQr}>
        <DialogContent className="max-w-[min(92vw,820px)]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {form.title}
            </DialogTitle>
            <DialogDescription>
              Scan to fill in the form. It runs this workflow live.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qrLarge && (
              // biome-ignore lint/performance/noImgElement: data URL QR code
              <img
                alt="QR code for the form"
                className="w-full max-w-[min(70vh,560px)] rounded-xl bg-white p-3"
                height={720}
                src={qrLarge}
                width={720}
              />
            )}
            <p className="break-all font-mono text-muted-foreground text-sm">
              {formUrl}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
