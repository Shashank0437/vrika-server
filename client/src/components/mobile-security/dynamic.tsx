"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Play, Upload } from "lucide-react";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import { engineAction, engineDownload, engineUpload, plain, type EngineParams } from "@/lib/mobileSecurity";
import { card, ErrorBanner, primaryButton, secondaryButton, Spinner } from "./ui";

export type Field =
  | { name: string; label: string; type?: "text" | "textarea" | "password"; placeholder?: string; defaultValue?: string; required?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; defaultValue?: string; required?: boolean }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean };

const inputCls =
  "w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary";

export function Panel({ title, description, icon, actions, children }: { title: string; description?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={`${card} flex flex-col overflow-hidden`}>
      <div className="flex items-start gap-3 border-b border-outline-variant/60 px-5 py-4">
        {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="flex-1 space-y-4 p-5">{children}</div>
    </div>
  );
}

/** Renders any engine payload as text — never as HTML. */
export function ResultView({ value, maxHeight = "max-h-96" }: { value: unknown; maxHeight?: string }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(value)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="Device capture" className="max-h-[480px] rounded-xl border border-outline-variant/60" />;
  }
  const text = typeof value === "string" ? plain(value) : JSON.stringify(value, null, 2);
  return (
    <pre className={`terminal-scroll ${maxHeight} overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#17151f] p-4 font-mono text-xs leading-relaxed text-[#d9d5ec]`}>
      {text || "(empty)"}
    </pre>
  );
}

export function useEngine() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T = Record<string, unknown>,>(name: string, params: EngineParams = {}, key = name): Promise<T | null> => {
    setBusy(key);
    setError(null);
    try {
      return await engineAction<T>(name, params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, setError, run };
}

/** Generic form bound to one allowlisted engine action. */
export function ActionForm({
  title,
  description,
  icon,
  action,
  fields = [],
  fixed = {},
  submitLabel = "Run",
  mode = "json",
  disabled,
  onResult,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action: string;
  fields?: Field[];
  fixed?: EngineParams;
  submitLabel?: string;
  mode?: "json" | "download" | "upload";
  disabled?: boolean;
  onResult?: (r: unknown) => void;
}) {
  const initial = Object.fromEntries(
    fields.map((f) => [f.name, f.type === "checkbox" ? Boolean(f.defaultValue) : (f.defaultValue ?? "")]),
  ) as Record<string, string | boolean>;
  const [values, setValues] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = fields.find((f) => f.type === "select" && f.required && !values[f.name]);
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params: EngineParams = { ...fixed, ...values };
      let r: unknown;
      if (mode === "download") {
        await engineDownload(action, params, `${action.replace(/\W+/g, "-")}.bin`);
        r = { status: "downloaded" };
      } else if (mode === "upload") {
        if (!file) throw new Error("Choose a file to upload");
        r = await engineUpload(action, file, params);
      } else {
        r = await engineAction(action, params, false);
      }
      setResult(r);
      onResult?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={title} description={description} icon={icon}>
      <form onSubmit={submit} className="space-y-3">
        {fields.map((f) => (
          <label key={f.name} className={f.type === "checkbox" ? "flex items-center gap-2 text-sm" : "block space-y-1"}>
            {f.type === "checkbox" ? (
              <>
                <input
                  type="checkbox"
                  checked={Boolean(values[f.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                  className="size-4 accent-[var(--color-primary)]"
                />
                {f.label}
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-on-surface-variant">{f.label}</span>
                {f.type === "select" ? (
                  <WorkspaceSelect
                    label={f.label}
                    value={String(values[f.name] ?? "")}
                    options={f.options}
                    placeholder={f.options.length ? "Select…" : "No options available"}
                    onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
                  />
                ) : f.type === "textarea" ? (
                  <textarea
                    className={`${inputCls} min-h-28 font-mono text-xs`}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={inputCls}
                    type={f.type === "password" ? "password" : "text"}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </>
            )}
          </label>
        ))}
        {mode === "upload" && (
          <label className={`${secondaryButton} w-full cursor-pointer`}>
            <Upload className="size-4" />
            <span className="truncate">{file ? file.name : "Choose file"}</span>
            <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <button type="submit" className={primaryButton} disabled={busy || disabled}>
          {busy ? <Spinner /> : <Play className="size-4" />}
          {submitLabel}
        </button>
      </form>
      {error && <ErrorBanner message={error} />}
      {result !== null && mode !== "download" && <ResultView value={result} />}
    </Panel>
  );
}

export function KeyValueGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{k}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-on-surface">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}
