"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileBarChart2, Loader2, Play, RefreshCcw, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { engineAction } from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF, mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ActionForm, KeyValueGrid, Panel, useEngine } from "@/components/mobile-security/dynamic";
import { asArr, asObj, str, StringList } from "@/components/mobile-security/ReportSections";
import { card, EmptyState, EngineStatusBanner, ErrorBanner, PageHeader, PlatformAvatar, primaryButton, secondaryButton, Skeleton } from "@/components/mobile-security/ui";

type DeviceInfo = Record<string, unknown>;

export default function AndroidDynamicPage() {
  const router = useRouter();
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useEngine();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setInfo(await engineAction<DeviceInfo>("dynamic.get_apps"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not reach the dynamic analyzer");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const online = asArr(info?.online_devices).map(str);
  const devices = asArr(info?.devices).map((d) => (Array.isArray(d) ? d.map(str).join(" · ") : str(d)));
  const apps = asArr(info?.apps).map(asObj);
  const deviceReady = Boolean(info?.identifier);
  const packages = Object.keys(asObj(info?.device_packages));

  async function start(hash: string) {
    const r = await run("dynamic.start_analysis", { hash }, hash);
    if (r) router.push(mobileDynamicHref(hash));
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={`${MOBILE_SECURITY_HREF}/dynamic`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Dynamic Analysis
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / Android"
        title="Android Dynamic Analyzer"
        description="Prepare the device, then start a dynamic session for any APK your organization has analysed."
        actions={
          <button className={secondaryButton} onClick={() => void load()}>
            <RefreshCcw className="size-4" /> Refresh
          </button>
        }
      />
      <EngineStatusBanner />
      {loadError && <ErrorBanner message={loadError} onRetry={() => void load()} />}
      {error && <ErrorBanner message={error} />}

      <Panel
        title="Device"
        icon={<Smartphone className="size-4" />}
        description={deviceReady ? "Connected and ready for analysis." : "No Android device or emulator is connected to the analysis engine."}
      >
        {info ? (
          <>
            <KeyValueGrid
              items={[
                ["Identifier", str(info.identifier) || "Not connected"],
                ["Android version", str(info.android_version) || "–"],
                ["SDK", str(info.android_sdk) || "–"],
                ["Runtime", str(info.runtime) || "–"],
                ["Proxy", info.proxy_ip ? `${str(info.proxy_ip)}:${str(info.proxy_port)}` : `port ${str(info.proxy_port)}`],
                ["Max supported API", str(info.android_supported)],
                ["Online devices", online.length],
                ["Known devices", devices.length],
              ]}
            />
            {!deviceReady && (
              <p className="rounded-xl bg-amber-500/8 p-3 text-sm text-amber-800">
                Start an Android emulator (Genymotion / AVD, API ≤ {str(info.android_supported)}) or connect a rooted device, expose ADB to the engine host, then press Refresh.
              </p>
            )}
          </>
        ) : (
          <Skeleton className="h-16" />
        )}
      </Panel>

      {canExecute && (
        <div className="grid gap-5 lg:grid-cols-3">
          <ActionForm
            title="Prepare device (MobSFy)"
            description="Install Frida server, CA and agents on the selected device."
            icon={<Smartphone className="size-4" />}
            action="android.mobsfy"
            fields={[
              online.length
                ? { name: "identifier", label: "Device", type: "select", options: online.map((d) => ({ value: d, label: d })), required: true }
                : { name: "identifier", label: "Device identifier", placeholder: "emulator-5554 or 192.168.56.101:5555", required: true },
            ]}
            submitLabel="MobSFy device"
            onResult={() => void load()}
          />
          <ActionForm
            title="Root CA"
            description="Install or remove the interception CA certificate."
            icon={<ShieldCheck className="size-4" />}
            action="android.root_ca"
            fields={[{ name: "action", label: "Action", type: "select", options: [{ value: "install", label: "Install CA" }, { value: "remove", label: "Remove CA" }], defaultValue: "install", required: true }]}
            submitLabel="Apply"
          />
          <ActionForm
            title="Global proxy"
            description="Route device HTTP(S) traffic through the analysis proxy."
            icon={<Wifi className="size-4" />}
            action="android.global_proxy"
            fields={[{ name: "action", label: "Action", type: "select", options: [{ value: "set", label: "Set proxy" }, { value: "unset", label: "Unset proxy" }], defaultValue: "set", required: true }]}
            submitLabel="Apply"
          />
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold">Apps available for dynamic analysis</h2>
          <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{apps.length}</span>
        </div>
        {!info ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : apps.length ? (
          <ul className="divide-y divide-outline-variant/50">
            {apps.map((a) => {
              const hash = str(a.MD5);
              return (
                <li key={hash} className="flex flex-wrap items-center gap-4 px-5 py-3.5 sm:px-6">
                  <PlatformAvatar scan={{ scan_type: "apk", file_name: str(a.FILE_NAME) }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{str(a.APP_NAME) || str(a.FILE_NAME)}</p>
                    <p className="truncate font-mono text-xs text-on-surface-variant">
                      {str(a.PACKAGE_NAME)}
                      {a.VERSION_NAME ? ` · v${str(a.VERSION_NAME)}` : ""}
                    </p>
                  </div>
                  {Boolean(a.DYNAMIC_REPORT_EXISTS) && (
                    <Link href={`${mobileDynamicHref(hash)}/report`} className={secondaryButton}>
                      <FileBarChart2 className="size-4" /> Report
                    </Link>
                  )}
                  <Link href={mobileDynamicHref(hash)} className={secondaryButton}>
                    Open session
                  </Link>
                  {canExecute && (
                    <button className={primaryButton} disabled={!deviceReady || busy !== null} onClick={() => void start(hash)} title={deviceReady ? undefined : "Connect a device first"}>
                      {busy === hash ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      Start analysis
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Smartphone className="size-6" />}
            title="No APKs yet"
            description="Run a static analysis on an APK first; it will appear here for dynamic analysis."
            action={
              <Link href={`${MOBILE_SECURITY_HREF}/scans?upload=1`} className={primaryButton}>
                New static scan
              </Link>
            }
          />
        )}
      </div>

      {packages.length > 0 && <StringList title="Packages installed on device" items={packages} />}
    </section>
  );
}
