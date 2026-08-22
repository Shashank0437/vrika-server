"use client";

import { useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type {
  FetchModelsOut,
  LlmProviderType,
  LlmSettingsOut,
  ModelOption,
  TestLlmConnectionOut,
} from "./types";

/**
 * Authentic Brand SVG Logos for AI Providers
 */
export function OpenRouterLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="OpenRouter Logo">
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OpenAILogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="OpenAI Logo">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.607 1.5-2.602-1.5z" />
    </svg>
  );
}

export function AnthropicLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Anthropic Claude Logo">
      <path d="M17.472 3.864h-3.825L8.14 19.136h3.693l1.307-3.328h5.385l1.307 3.328h3.694L17.472 3.864zm-1.89 8.683h-2.918l1.459-3.716 1.459 3.716zM4.5 19.136h3.693L13.699 3.864H10.005L4.5 19.136z" />
    </svg>
  );
}

export function GeminiLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Google Gemini Logo">
      <path
        d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4771 12 22C12 16.4771 16.4771 12 22 12C16.4771 12 12 7.52285 12 2Z"
        fill="url(#gemini-gradient)"
      />
      <defs>
        <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1B72E8" />
          <stop offset="0.5" stopColor="#8E44AD" />
          <stop offset="1" stopColor="#E91E63" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CustomServerLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Custom Local Server Logo"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ProviderBrandIcon({
  provider,
  className = "size-6",
}: {
  provider: LlmProviderType;
  className?: string;
}) {
  switch (provider) {
    case "openrouter":
      return <OpenRouterLogo className={className} />;
    case "openai":
      return <OpenAILogo className={className} />;
    case "anthropic":
      return <AnthropicLogo className={className} />;
    case "gemini":
      return <GeminiLogo className={className} />;
    case "custom":
      return <CustomServerLogo className={className} />;
    default:
      return <MaterialSymbol name="smart_toy" className={className} />;
  }
}

const PROVIDER_METADATA: Record<LlmProviderType, {
  name: string;
  description: string;
  defaultUrl: string;
  defaultModel: string;
  urlLabel: string;
  urlPlaceholder: string;
  supportsCustomUrl: boolean;
  keyRequired: boolean;
  keyPlaceholder: string;
  maxOutputTokens: number;
  maxTemperature: number;
}> = {
  openrouter: {
    name: "OpenRouter",
    description: "Access 300+ models (GPT-4, Claude, Gemini, Llama, Mistral) via a single API",
    defaultUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://openrouter.ai/api/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-or-v1-...",
    maxOutputTokens: 131072,
    maxTemperature: 2.0,
  },
  openai: {
    name: "OpenAI",
    description: "Direct OpenAI integration (GPT-4o, GPT-4.1, o3/o4-mini reasoning)",
    defaultUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    urlLabel: "Base URL (Optional / Azure)",
    urlPlaceholder: "https://api.openai.com/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-proj-...",
    maxOutputTokens: 65536,
    maxTemperature: 2.0,
  },
  anthropic: {
    name: "Anthropic Claude",
    description: "Direct Anthropic integration (Claude 3.7 Sonnet, Claude 3.5 Haiku, Claude 4)",
    defaultUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-7-sonnet-20250219",
    urlLabel: "Base URL (Optional / Bedrock / Proxy)",
    urlPlaceholder: "https://api.anthropic.com",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-ant-api03-...",
    maxOutputTokens: 128000,
    maxTemperature: 1.0,
  },
  gemini: {
    name: "Google Gemini",
    description: "Direct Google AI Studio integration (Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash)",
    defaultUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-flash",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://generativelanguage.googleapis.com",
    supportsCustomUrl: false,
    keyRequired: true,
    keyPlaceholder: "AIzaSy...",
    maxOutputTokens: 65536,
    maxTemperature: 2.0,
  },
  custom: {
    name: "Custom / Local",
    description: "Local or private OpenAI-compatible servers (vLLM, Ollama, LM Studio, LiteLLM)",
    defaultUrl: "http://localhost:11434/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    urlLabel: "Base URL (Required)",
    urlPlaceholder: "http://10.239.37.110:8000/v1 or http://localhost:11434/v1",
    supportsCustomUrl: true,
    keyRequired: false,
    keyPlaceholder: "Optional authorization token...",
    maxOutputTokens: 131072,
    maxTemperature: 2.0,
  },
};

type ProviderFormState = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: string;
  showKey: boolean;
};

export function LlmSettingsCard({
  settings,
  onChange,
}: {
  settings: LlmSettingsOut | null;
  onChange: (next: LlmSettingsOut) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<LlmProviderType>(
    settings?.active_provider || "openrouter",
  );
  const [activeProvider, setActiveProvider] = useState<LlmProviderType>(
    settings?.active_provider || "openrouter",
  );

  // Form states per provider
  const [formState, setFormState] = useState<Record<LlmProviderType, ProviderFormState>>({
    openrouter: {
      apiKey: "",
      baseUrl: "",
      model: "openai/gpt-4.1-mini",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "",
      showKey: false,
    },
    openai: {
      apiKey: "",
      baseUrl: "",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 16384,
      contextLimit: "",
      showKey: false,
    },
    anthropic: {
      apiKey: "",
      baseUrl: "",
      model: "claude-3-7-sonnet-20250219",
      temperature: 1.0,
      maxTokens: 16384,
      contextLimit: "",
      showKey: false,
    },
    gemini: {
      apiKey: "",
      baseUrl: "",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "",
      showKey: false,
    },
    custom: {
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "32768",
      showKey: false,
    },
  });

  // Model discovery cache
  const [discoveredModels, setDiscoveredModels] = useState<
    Partial<Record<LlmProviderType, ModelOption[]>>
  >({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  // Test connection state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestLlmConnectionOut | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ message?: string; error?: string } | null>(null);

  // Sync incoming props into state
  useEffect(() => {
    if (!settings) return;
    setActiveProvider(settings.active_provider || "openrouter");
    setFormState((prev) => {
      const next = { ...prev };
      for (const [pKey, pConfig] of Object.entries(settings.providers || {})) {
        const key = pKey as LlmProviderType;
        if (pConfig && next[key]) {
          next[key] = {
            ...next[key],
            baseUrl: pConfig.base_url || "",
            model: pConfig.model || PROVIDER_METADATA[key].defaultModel,
            temperature: pConfig.temperature ?? 0.7,
            maxTokens: pConfig.max_tokens ?? 4096,
            contextLimit: pConfig.context_limit ? String(pConfig.context_limit) : "",
          };
        }
      }
      return next;
    });
  }, [settings]);

  const currentMeta = PROVIDER_METADATA[selectedProvider];
  const currentForm = formState[selectedProvider];
  const currentSavedConfig = settings?.providers?.[selectedProvider];

  const updateCurrent = (patch: Partial<ProviderFormState>) => {
    setFormState((prev) => ({
      ...prev,
      [selectedProvider]: {
        ...prev[selectedProvider],
        ...patch,
      },
    }));
    setSaveStatus(null);
    setTestResult(null);
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const res = await api<FetchModelsOut>("/org/settings/llm/fetch-models", {
        method: "POST",
        body: JSON.stringify({
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
        }),
      });
      setDiscoveredModels((prev) => ({
        ...prev,
        [selectedProvider]: res.models,
      }));
      if (res.models.length > 0 && !currentForm.model) {
        updateCurrent({ model: res.models[0].id });
      }
    } catch (err) {
      setFetchModelsError(
        err instanceof ApiError ? err.message : "Failed to fetch models from provider",
      );
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api<TestLlmConnectionOut>("/org/settings/llm/test-connection", {
        method: "POST",
        body: JSON.stringify({
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
          model: currentForm.model,
          temperature: currentForm.temperature,
        }),
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof ApiError ? err.message : "Connection request failed",
        latency_ms: 0,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const payloadProviders: Record<string, unknown> = {};
      for (const [pKey, pState] of Object.entries(formState)) {
        payloadProviders[pKey] = {
          api_key: pState.apiKey,
          base_url: pState.baseUrl,
          model: pState.model,
          temperature: pState.temperature,
          max_tokens: pState.maxTokens,
          context_limit: pState.contextLimit ? parseInt(pState.contextLimit, 10) : null,
        };
      }

      const updated = await api<LlmSettingsOut>("/org/settings/llm", {
        method: "PATCH",
        body: JSON.stringify({
          active_provider: activeProvider,
          providers: payloadProviders,
        }),
      });

      onChange(updated);
      setSaveStatus({ message: "LLM configuration saved successfully" });
      // Reset sensitive input fields
      setFormState((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as LlmProviderType[]) {
          next[k] = { ...next[k], apiKey: "" };
        }
        return next;
      });
    } catch (err) {
      setSaveStatus({
        error: err instanceof ApiError ? err.message : "Failed to save configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  const modelsList = discoveredModels[selectedProvider] || [];

  return (
    <SettingsCard
      icon="neurology"
      title="LLM Provider Configuration"
      description="Configure model endpoints, API credentials, and default AI engines powering Vrika."
      badge={
        <SettingsBadge tone="active">
          Active: {PROVIDER_METADATA[activeProvider]?.name || activeProvider}
        </SettingsBadge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SettingsStatus
              message={saveStatus?.message}
              error={saveStatus?.error}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <span className="size-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="save" className="text-base" />
            )}
            Save Configuration
          </button>
        </div>
      }
    >
      {/* Provider Selector Tabs */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {(Object.keys(PROVIDER_METADATA) as LlmProviderType[]).map((pKey) => {
          const meta = PROVIDER_METADATA[pKey];
          const isSelected = selectedProvider === pKey;
          const isActive = activeProvider === pKey;
          const hasKey = settings?.providers?.[pKey]?.has_api_key;

          return (
            <button
              key={pKey}
              type="button"
              onClick={() => {
                setSelectedProvider(pKey);
                setTestResult(null);
                setFetchModelsError(null);
              }}
              className={`relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary-container/20 ring-2 ring-primary/30"
                  : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={`flex size-8 items-center justify-center rounded-lg ${
                    isSelected
                      ? "bg-primary-container text-primary"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  <ProviderBrandIcon provider={pKey} className="size-5" />
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Active
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-sm font-bold text-on-surface">{meta.name}</div>
                <div className="mt-0.5 text-[11px] text-on-surface-variant line-clamp-1">
                  {hasKey || pKey === "custom" ? "Configured" : "Not set"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Provider Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 items-center justify-center rounded-lg ${
              activeProvider === selectedProvider
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            <ProviderBrandIcon provider={selectedProvider} className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-on-surface">
              {currentMeta.name}
            </div>
            <div className="text-xs text-on-surface-variant">
              {activeProvider === selectedProvider
                ? "Currently set as default AI engine for scans & agent chat"
                : "Configure settings below or set as active provider"}
            </div>
          </div>
        </div>

        {activeProvider !== selectedProvider && (
          <button
            type="button"
            onClick={() => setActiveProvider(selectedProvider)}
            className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-on-primary"
          >
            <MaterialSymbol name="star" className="text-sm" />
            Set as Active Provider
          </button>
        )}
      </div>

      {/* Form Fields for Selected Provider */}
      <div className="space-y-5">
        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            API Key {currentMeta.keyRequired && <span className="text-error">*</span>}
          </label>
          <div className="relative mt-1.5 flex items-center">
            <input
              type={currentForm.showKey ? "text" : "password"}
              value={currentForm.apiKey}
              onChange={(e) => updateCurrent({ apiKey: e.target.value })}
              placeholder={
                currentSavedConfig?.has_api_key
                  ? "•••••••••••••••• (Leave blank to keep stored key)"
                  : currentMeta.keyPlaceholder
              }
              className="w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 pr-20 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="absolute right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateCurrent({ showKey: !currentForm.showKey })}
                className="rounded p-1 text-on-surface-variant hover:text-on-surface"
                title={currentForm.showKey ? "Hide key" : "Show key"}
              >
                <MaterialSymbol
                  name={currentForm.showKey ? "visibility_off" : "visibility"}
                  className="text-base"
                />
              </button>
              {currentSavedConfig?.has_api_key && !currentForm.apiKey && (
                <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <MaterialSymbol name="lock" className="text-xs" />
                  Saved
                </span>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Secrets are encrypted at rest with Fernet and never transmitted to client browsers.
          </p>
        </div>

        {/* Base URL */}
        {currentMeta.supportsCustomUrl && (
          <div>
            <label className="block text-xs font-semibold text-on-surface">
              {currentMeta.urlLabel}
            </label>
            <input
              type="text"
              value={currentForm.baseUrl}
              onChange={(e) => updateCurrent({ baseUrl: e.target.value })}
              placeholder={currentMeta.urlPlaceholder}
              className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Model Selection & Discovery */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-on-surface">
              Model Name / Identifier <span className="text-error">*</span>
            </label>
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline disabled:opacity-50"
            >
              {fetchingModels ? (
                <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <MaterialSymbol name="refresh" className="text-sm" />
              )}
              Fetch Available Models
            </button>
          </div>

          <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={currentForm.model}
              onChange={(e) => updateCurrent({ model: e.target.value })}
              placeholder={currentMeta.defaultModel}
              className="w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />

            {modelsList.length > 0 && (
              <select
                value={currentForm.model}
                onChange={(e) => updateCurrent({ model: e.target.value })}
                className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 text-xs text-on-surface outline-none focus:border-primary"
              >
                <option value="">-- Discovered Models ({modelsList.length}) --</option>
                {modelsList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id} {m.context_length ? `(${Math.round(m.context_length / 1000)}k ctx)` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {fetchModelsError && (
            <p className="mt-1 text-xs text-error">{fetchModelsError}</p>
          )}
        </div>

        {/* Sliders Grid: Temperature & Max Tokens */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Temperature */}
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">Temperature</span>
              <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {currentForm.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max={String(currentMeta.maxTemperature)}
              step="0.05"
              value={currentForm.temperature}
              onChange={(e) => updateCurrent({ temperature: parseFloat(e.target.value) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>0.0 (Precise / Deterministic)</span>
              <span>{currentMeta.maxTemperature.toFixed(1)} (Creative)</span>
            </div>
          </div>

          {/* Max Output Tokens */}
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">Max Output Tokens</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={256}
                  max={currentMeta.maxOutputTokens}
                  step={256}
                  value={currentForm.maxTokens}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) updateCurrent({ maxTokens: Math.min(v, currentMeta.maxOutputTokens) });
                  }}
                  className="w-24 rounded border border-outline-variant bg-surface-container-high px-2 py-0.5 text-right font-mono text-xs font-bold text-primary outline-none focus:border-primary"
                />
              </div>
            </div>
            <input
              type="range"
              min="256"
              max={String(currentMeta.maxOutputTokens)}
              step="256"
              value={Math.min(currentForm.maxTokens, currentMeta.maxOutputTokens)}
              onChange={(e) => updateCurrent({ maxTokens: parseInt(e.target.value, 10) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>256</span>
              <span>{(currentMeta.maxOutputTokens / 1000).toFixed(0)}k</span>
            </div>
          </div>
        </div>

        {/* Custom Context Limit (Optional / Custom) */}
        {selectedProvider === "custom" && (
          <div>
            <label className="block text-xs font-semibold text-on-surface">
              Server Context Window (Optional Hint)
            </label>
            <input
              type="number"
              value={currentForm.contextLimit}
              onChange={(e) => updateCurrent({ contextLimit: e.target.value })}
              placeholder="e.g. 32768, 65536, 128000"
              className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Test Connection Button & Result */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:opacity-50"
          >
            {testingConnection ? (
              <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="network_check" className="text-base text-primary" />
            )}
            Test {currentMeta.name} Connection
          </button>

          {testResult && (
            <div
              className={`mt-3 rounded-lg p-3 text-xs ${
                testResult.success
                  ? "border border-primary/30 bg-primary/10 text-on-surface"
                  : "border border-error/30 bg-error-container/30 text-on-error-container"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <MaterialSymbol
                  name={testResult.success ? "check_circle" : "error"}
                  className={`text-base ${testResult.success ? "text-primary" : "text-error"}`}
                />
                {testResult.message}
              </div>
              {testResult.response_preview && (
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  Model response: &quot;{testResult.response_preview}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
