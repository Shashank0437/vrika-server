"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Code2, ExternalLink, FileCode2, Globe, KeyRound, Loader2, Search, ShieldAlert, X } from "lucide-react";
import { formatBytes, plain, viewSource, type MobileReport, type Scorecard, type Severity } from "@/lib/mobileSecurity";
import { card, EmptyState, ErrorBanner, normalizeSeverity, SEVERITY_META, SeverityChip } from "./ui";

type Obj = Record<string, unknown>;

export const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v));

const SEVERITY_ORDER: Severity[] = ["high", "warning", "hotspot", "info", "secure"];
const sevRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

export function Section({ title, count, children, actions }: { title: string; count?: number; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {count !== undefined && (
            <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{count}</span>
          )}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface px-2.5 sm:w-60">
      <Search className="size-3.5 text-on-surface-variant" />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="no-search-cancel w-full bg-transparent text-xs outline-none"
      />
    </label>
  );
}

type FindingRow = {
  id: string;
  severity: Severity;
  title: string;
  description?: string;
  meta?: { label: string; value: string }[];
  body?: ReactNode;
};

function SeverityFilter({ counts, active, onChange }: { counts: Partial<Record<Severity, number>>; active: Severity | null; onChange: (s: Severity | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${active === null ? "bg-on-surface text-surface" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
      >
        All
      </button>
      {SEVERITY_ORDER.filter((s) => counts[s]).map((s) => (
        <button
          key={s}
          onClick={() => onChange(active === s ? null : s)}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${active === s ? SEVERITY_META[s].chip : "bg-surface-container text-on-surface-variant ring-transparent hover:bg-surface-container-high"}`}
        >
          <span className={`size-1.5 rounded-full ${SEVERITY_META[s].dot}`} />
          {SEVERITY_META[s].label} {counts[s]}
        </button>
      ))}
    </div>
  );
}

export function FindingList({ title, rows, emptyText = "No findings in this section." }: { title: string; rows: FindingRow[]; emptyText?: string }) {
  const [filter, setFilter] = useState<Severity | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useMemo(() => [...rows].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)), [rows]);
  const counts = useMemo(() => {
    const c: Partial<Record<Severity, number>> = {};
    for (const r of rows) c[r.severity] = (c[r.severity] ?? 0) + 1;
    return c;
  }, [rows]);
  const visible = sorted.filter(
    (r) =>
      (!filter || r.severity === filter) &&
      (!q || `${r.title} ${r.description ?? ""} ${r.id}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Section
      title={title}
      count={rows.length}
      actions={rows.length > 5 ? <FilterInput value={q} onChange={setQ} placeholder="Filter findings" /> : undefined}
    >
      {rows.length > 0 && (
        <div className="border-b border-outline-variant/40 px-5 py-3 sm:px-6">
          <SeverityFilter counts={counts} active={filter} onChange={setFilter} />
        </div>
      )}
      {visible.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-on-surface-variant">{rows.length ? "No findings match the filter." : emptyText}</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {visible.map((r) => {
            const expanded = open === r.id;
            return (
              <li key={r.id}>
                <button
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-surface-container-low sm:px-6"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : r.id)}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_META[r.severity].dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-on-surface">{r.title}</p>
                    {!expanded && r.description && <p className="mt-0.5 line-clamp-1 text-xs text-on-surface-variant">{r.description}</p>}
                  </div>
                  <SeverityChip severity={r.severity} />
                  <ChevronDown className={`mt-0.5 size-4 shrink-0 text-on-surface-variant transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="space-y-3 bg-surface-container-low/60 px-5 pb-5 pl-10 pt-1 sm:px-6 sm:pl-11">
                    {r.description && <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{r.description}</p>}
                    {r.meta && r.meta.length > 0 && (
                      <dl className="flex flex-wrap gap-2">
                        {r.meta.map((m) => (
                          <div key={m.label} className="rounded-lg bg-surface-container-lowest px-2.5 py-1 text-xs ring-1 ring-outline-variant/50">
                            <dt className="inline font-semibold text-on-surface">{m.label}: </dt>
                            <dd className="inline text-on-surface-variant">{m.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {r.body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ---------- Summary (scorecard) ---------- */

export function scorecardRows(card: Scorecard | null): FindingRow[] {
  if (!card) return [];
  return SEVERITY_ORDER.flatMap((sev) =>
    asArr(card[sev]).map((f, i) => {
      const o = asObj(f);
      return {
        id: `${sev}-${i}`,
        severity: sev,
        title: plain(o.title),
        description: plain(o.description),
        meta: o.section ? [{ label: "Section", value: str(o.section) }] : undefined,
      };
    }),
  );
}

export function AppInfo({ report }: { report: MobileReport }) {
  const rows: [string, unknown][] = [
    ["File name", report.file_name],
    ["Size", report.size],
    ["Package / Bundle", report.package_name || report.bundle_id],
    ["Version", [report.version_name || report.app_version, report.version_code || report.build].filter(Boolean).join(" · ")],
    ["Main activity", report.main_activity],
    ["Target SDK", report.target_sdk],
    ["Min SDK / OS", report.min_sdk || report.min_os_version],
    ["Platform", report.platform || report.sdk_name],
    ["MD5", report.md5],
    ["SHA1", report.sha1],
    ["SHA256", report.sha256],
  ];
  return (
    <Section title="App information">
      <dl className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 sm:px-6">
        {rows
          .filter(([, v]) => str(v))
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{k}</dt>
              <dd className="mt-0.5 break-all font-mono text-[13px] text-on-surface">{k === "Size" ? formatBytes(v) : str(v)}</dd>
            </div>
          ))}
      </dl>
    </Section>
  );
}

/* ---------- Code analysis ---------- */

function FileRefs({ files, onView }: { files: Obj; onView?: (file: string, lines: string) => void }) {
  const entries = Object.entries(files);
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, 8);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Affected files ({entries.length})</p>
      <ul className="space-y-1">
        {shown.map(([file, lines]) => (
          <li key={file} className="flex items-center gap-2 text-xs">
            <FileCode2 className="size-3.5 shrink-0 text-on-surface-variant" />
            {onView ? (
              <button className="truncate font-mono text-primary hover:underline" onClick={() => onView(file, str(lines))}>
                {file}
              </button>
            ) : (
              <span className="truncate font-mono text-on-surface">{file}</span>
            )}
            {str(lines) && <span className="shrink-0 text-on-surface-variant">L{str(lines)}</span>}
          </li>
        ))}
      </ul>
      {entries.length > 8 && (
        <button className="text-xs font-semibold text-primary hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show all ${entries.length} files`}
        </button>
      )}
    </div>
  );
}

export function codeRows(
  section: unknown,
  onView?: (file: string, lines: string) => void,
  actions?: (rule: string) => ReactNode,
): FindingRow[] {
  const findings = asObj(asObj(section).findings);
  return Object.entries(findings).map(([rule, value]) => {
    const v = asObj(value);
    const md = asObj(v.metadata);
    const meta = [
      { label: "Rule", value: rule },
      { label: "CWE", value: str(md.cwe) },
      { label: "OWASP Mobile", value: str(md["owasp-mobile"]) },
      { label: "MASVS", value: str(md.masvs) },
      { label: "CVSS", value: str(md.cvss) },
    ].filter((m) => m.value);
    const files = asObj(v.files);
    const fileRefs = Object.keys(files).length ? <FileRefs files={files} onView={onView} /> : null;
    const extra = actions?.(rule);
    return {
      id: rule,
      severity: normalizeSeverity(md.severity),
      title: plain(md.description) || rule,
      meta,
      body: fileRefs || extra ? (
        <>
          {fileRefs}
          {extra}
        </>
      ) : undefined,
    };
  });
}

export function SourceViewer({
  hash,
  file,
  lines,
  type,
  onClose,
}: {
  hash: string;
  file: string;
  lines: string;
  type: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlight = useMemo(() => new Set(lines.split(",").map((n) => Number(n.trim())).filter(Boolean)), [lines]);

  useEffect(() => {
    viewSource(hash, file, type)
      .then((r) => setData(str(r.data)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load source"));
  }, [hash, file, type]);

  useEffect(() => {
    if (data === null) return;
    const first = Math.min(...Array.from(highlight));
    if (Number.isFinite(first)) document.getElementById(`src-line-${first}`)?.scrollIntoView({ block: "center" });
  }, [data, highlight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Source of ${file}`} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-outline-variant/60 px-5 py-3">
          <Code2 className="size-4 text-primary" />
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-on-surface">{file}</p>
          <button className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-surface-container" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="terminal-scroll min-h-0 flex-1 overflow-auto bg-[#17151f] text-[12.5px] leading-relaxed">
          {error ? (
            <div className="p-5">
              <ErrorBanner message={error} />
            </div>
          ) : data === null ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-white/70">
              <Loader2 className="size-4 animate-spin" /> Loading source…
            </div>
          ) : (
            <pre className="py-3 font-mono">
              {data.split("\n").map((line, i) => {
                const n = i + 1;
                const hit = highlight.has(n);
                return (
                  <div key={n} id={`src-line-${n}`} className={`flex ${hit ? "bg-primary/35" : ""}`}>
                    <span className="w-14 shrink-0 select-none pr-4 text-right text-white/35">{n}</span>
                    <code className="whitespace-pre pr-6 text-[#e9e6f5]">{line || " "}</code>
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Configuration (manifest / network / ATS) ---------- */

export function configRows(report: MobileReport, actions?: (rule: string) => ReactNode): FindingRow[] {
  const manifest = asArr(asObj(report.manifest_analysis).manifest_findings).map((f, i) => {
    const o = asObj(f);
    const [title, ...rest] = plain(o.title).split("\n");
    return {
      id: `m-${i}`,
      severity: normalizeSeverity(o.severity),
      title: title || plain(o.name) || str(o.rule),
      description: [rest.join(" ").trim(), plain(o.description)].filter(Boolean).join("\n\n"),
      meta: [
        { label: "Source", value: "Manifest" },
        { label: "Rule", value: str(o.rule) },
        { label: "Component", value: str(o.component) },
      ].filter((m) => m.value),
      body: o.rule ? actions?.(str(o.rule)) : undefined,
    };
  });
  const network = asArr(asObj(report.network_security).network_findings).map((f, i) => {
    const o = asObj(f);
    return {
      id: `n-${i}`,
      severity: normalizeSeverity(o.severity),
      title: plain(o.description).split(".")[0] || "Network security configuration",
      description: plain(o.description),
      meta: [
        { label: "Source", value: "Network security config" },
        { label: "Scope", value: asArr(o.scope).map(str).join(", ") },
      ].filter((m) => m.value),
    };
  });
  const ats = asArr(asObj(report.ats_analysis).ats_findings).map((f, i) => {
    const o = asObj(f);
    return {
      id: `a-${i}`,
      severity: normalizeSeverity(o.severity),
      title: plain(o.issue) || "App Transport Security",
      description: plain(o.description),
      meta: [{ label: "Source", value: "App Transport Security" }],
    };
  });
  return [...manifest, ...network, ...ats];
}

/* ---------- Permissions ---------- */

export function PermissionsSection({ report }: { report: MobileReport }) {
  const [q, setQ] = useState("");
  const perms = Object.entries(asObj(report.permissions)).map(([name, v]) => {
    const o = asObj(v);
    return { name, status: str(o.status), info: plain(o.info), description: plain(o.description || o.reason) };
  });
  const malware = asObj(report.malware_permissions);
  const topMalware = new Set(asArr(malware.top_malware_permissions).map(str));
  const order = (s: string) => (s === "dangerous" ? 0 : s === "unknown" ? 1 : s === "signature" ? 2 : 3);
  const visible = perms
    .filter((p) => !q || `${p.name} ${p.info}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => order(a.status) - order(b.status));

  if (!perms.length) return <Section title="Permissions"><EmptyState icon={<KeyRound className="size-6" />} title="No permissions declared" /></Section>;

  return (
    <Section title="Permissions" count={perms.length} actions={<FilterInput value={q} onChange={setQ} placeholder="Filter permissions" />}>
      {topMalware.size > 0 && (
        <div className="flex items-start gap-3 border-b border-outline-variant/40 bg-error/5 px-5 py-3 text-sm sm:px-6">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-error" />
          <p className="text-on-surface-variant">
            <span className="font-semibold text-error">{topMalware.size}</span> of the requested permissions are commonly abused by known malware.
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-5 py-2.5 font-semibold sm:px-6">Permission</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40">
            {visible.map((p) => (
              <tr key={p.name} className="align-top hover:bg-surface-container-low/60">
                <td className="px-5 py-3 sm:px-6">
                  <p className="break-all font-mono text-xs text-on-surface">{p.name}</p>
                  {topMalware.has(p.name) && <span className="mt-1 inline-block text-[11px] font-semibold text-error">Malware-associated</span>}
                </td>
                <td className="px-3 py-3">
                  <SeverityChip severity={p.status === "dangerous" ? "high" : p.status === "unknown" ? "warning" : p.status === "signature" ? "info" : "secure"}>
                    {p.status || "normal"}
                  </SeverityChip>
                </td>
                <td className="px-3 py-3 text-xs text-on-surface-variant">
                  <p className="font-medium text-on-surface">{p.info}</p>
                  {p.description && <p className="mt-0.5">{p.description}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------- Binary & certificate ---------- */

export function binaryRows(report: MobileReport): FindingRow[] {
  const rows: FindingRow[] = [];
  const binary = report.binary_analysis;
  // Android: list of per-library objects; iOS: { findings: { issue: {...} } }.
  asArr(binary).forEach((lib, i) => {
    const o = asObj(lib);
    const name = str(o.name) || `binary-${i}`;
    for (const [key, val] of Object.entries(o)) {
      const v = asObj(val);
      if (!v.severity) continue;
      const sev = normalizeSeverity(v.severity);
      if (sev === "secure" || sev === "info") continue;
      rows.push({
        id: `${name}-${key}`,
        severity: sev,
        title: `${key.replace(/_/g, " ").toUpperCase()} — ${name.split("/").pop()}`,
        description: plain(v.description),
        meta: [{ label: "Library", value: name }],
      });
    }
  });
  Object.entries(asObj(asObj(binary).findings)).forEach(([issue, val]) => {
    const v = asObj(val);
    rows.push({
      id: `ios-${issue}`,
      severity: normalizeSeverity(v.severity),
      title: plain(issue),
      description: plain(v.detailed_desc),
      meta: [
        { label: "CWE", value: str(v.cwe) },
        { label: "OWASP Mobile", value: str(v["owasp-mobile"]) },
        { label: "MASVS", value: str(v.masvs) },
      ].filter((m) => m.value),
    });
  });
  return rows;
}

export function CertificateSection({ report }: { report: MobileReport }) {
  const cert = asObj(report.certificate_analysis);
  const rows: FindingRow[] = asArr(cert.certificate_findings).map((f, i) => {
    const t = asArr(f);
    return { id: `c-${i}`, severity: normalizeSeverity(t[0]), title: plain(t[2]), description: plain(t[1]) };
  });
  const info = str(cert.certificate_info);
  return (
    <div className="space-y-5">
      <FindingList title="Signing certificate findings" rows={rows} />
      {info && (
        <Section title="Certificate details">
          <pre className="terminal-scroll max-h-96 overflow-auto whitespace-pre-wrap break-all px-5 py-4 font-mono text-xs text-on-surface-variant sm:px-6">{info}</pre>
        </Section>
      )}
    </div>
  );
}

/* ---------- Network & privacy ---------- */

export function NetworkPrivacySection({ report }: { report: MobileReport }) {
  const domains = Object.entries(asObj(report.domains)).map(([domain, v]) => {
    const o = asObj(v);
    const geo = asObj(o.geolocation);
    return {
      domain,
      bad: str(o.bad).toLowerCase() === "yes",
      ofac: Boolean(o.ofac),
      where: [str(geo.city), str(geo.country_long || geo.country_short)].filter(Boolean).join(", "),
    };
  });
  domains.sort((a, b) => Number(b.bad) - Number(a.bad));
  const trackers = asObj(report.trackers);
  const trackerList = asArr(trackers.trackers).map(asObj);
  const urls = Array.from(new Set(asArr(report.urls).flatMap((u) => asArr(asObj(u).urls).map(str)))).slice(0, 300);
  const emails = Array.from(new Set(asArr(report.emails).flatMap((u) => asArr(asObj(u).emails).map(str))));
  const firebase = asArr(report.firebase_urls).map((f, i) => {
    const o = asObj(f);
    return { id: `fb-${i}`, severity: normalizeSeverity(o.severity), title: plain(o.title), description: plain(o.description) };
  });

  return (
    <div className="space-y-5">
      <Section title="Trackers" count={trackerList.length}>
        {trackerList.length ? (
          <ul className="grid gap-3 p-5 sm:grid-cols-2 sm:px-6">
            {trackerList.map((t) => (
              <li key={str(t.name)} className="flex items-start justify-between gap-3 rounded-xl border border-outline-variant/60 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{str(t.name)}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{str(t.categories)}</p>
                </div>
                {/^https?:\/\//.test(str(t.url)) && (
                  <a href={str(t.url)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-on-surface-variant hover:text-primary" aria-label={`About ${str(t.name)}`}>
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-6 text-sm text-on-surface-variant">No privacy trackers detected.</p>
        )}
      </Section>

      {firebase.length > 0 && <FindingList title="Firebase" rows={firebase} />}

      <Section title="Domains" count={domains.length}>
        {domains.length ? (
          <ul className="divide-y divide-outline-variant/40">
            {domains.map((d) => (
              <li key={d.domain} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
                <Globe className={`size-4 shrink-0 ${d.bad ? "text-error" : "text-on-surface-variant"}`} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-on-surface">{d.domain}</span>
                {d.where && <span className="hidden text-xs text-on-surface-variant sm:inline">{d.where}</span>}
                {d.bad && <SeverityChip severity="high">Malicious</SeverityChip>}
                {d.ofac && <SeverityChip severity="warning">OFAC</SeverityChip>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-6 text-sm text-on-surface-variant">No domains extracted.</p>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <StringList title="URLs" items={urls} />
        <StringList title="Emails" items={emails} />
      </div>
    </div>
  );
}

export function StringList({ title, items, mono = true }: { title: string; items: string[]; mono?: boolean }) {
  const [q, setQ] = useState("");
  const visible = items.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title={title} count={items.length} actions={items.length > 8 ? <FilterInput value={q} onChange={setQ} placeholder={`Filter ${title.toLowerCase()}`} /> : undefined}>
      {items.length ? (
        <ul className="terminal-scroll max-h-80 divide-y divide-outline-variant/30 overflow-auto">
          {visible.map((s) => (
            <li key={s} className={`break-all px-5 py-2 text-xs text-on-surface sm:px-6 ${mono ? "font-mono" : ""}`}>
              {plain(s)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-6 py-6 text-sm text-on-surface-variant">None found.</p>
      )}
    </Section>
  );
}

/* ---------- Components ---------- */

export function ComponentsSection({ report }: { report: MobileReport }) {
  const exported = asObj(report.exported_count);
  const groups: [string, string][] = [
    ["activities", "Activities"],
    ["services", "Services"],
    ["receivers", "Receivers"],
    ["providers", "Providers"],
    ["libraries", "Libraries"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {groups.slice(0, 4).map(([key, label]) => (
          <div key={key} className={`${card} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
            <p className="mt-1 text-2xl font-bold text-on-surface">{asArr(report[key]).length}</p>
            {exported[`exported_${key}`] !== undefined && (
              <p className="text-xs text-on-surface-variant">{str(exported[`exported_${key}`])} exported</p>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map(([key, label]) => (
          <StringList key={key} title={label} items={asArr(report[key]).map(str)} />
        ))}
      </div>
    </div>
  );
}
