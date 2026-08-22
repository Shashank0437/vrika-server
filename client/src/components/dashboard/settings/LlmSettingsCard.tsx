"use client";

import { useEffect, useId, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type {
  FetchModelsOut,
  LlmProviderConfigOut,
  LlmProviderType,
  LlmSettingsOut,
  ModelOption,
  TestLlmConnectionOut,
} from "./types";

const PROVIDER_METADATA: Record<
  LlmProviderType,
  {
    name: string;
    description: string;
    icon: string;
    defaultUrl: string;
    defaultModel: string;
    urlLabel: string;
    urlPlaceholder: string;
    supportsCustomUrl: boolean;
    keyRequired: boolean;
    keyPlaceholder: string;
  }
> = {
  openrouter: {
    name: "OpenRouter",
    description: "Access Claude, GPT-4o, DeepSeek, and open models via a single API",
    icon: "hub",
    defaultUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://openrouter.ai/api/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-or-v1-...",
  },
  openai: {
    name: "OpenAI",
    description: "Direct OpenAI API integration (GPT-4o, o1, o3-mini)",
    icon: "smart_toy",
    defaultUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    urlLabel: "Base URL (Optional / Azure / Proxy)",
    urlPlaceholder: "https://api.openai.com/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-proj-...",
  },
  anthropic: {
    name: "Anthropic",
    description: "Direct Anthropic Claude integration (Claude 3.7 Sonnet, Claude 3.5 Haiku)",
    icon: "psychology",
    defaultUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-7-sonnet-20250219",
    urlLabel: "Base URL (Optional / Bedrock / Proxy)",
    urlPlaceholder: "https://api.anthropic.com",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-ant-api03-...",
  },
  gemini: {
    name: "Google Gemini",
    description: "Direct Google AI Studio integration (Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash)",
    icon: "auto_awesome",
    defaultUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-flash",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://generativelanguage.googleapis.com",
    supportsCustomUrl: false,
    keyRequired: true,
    keyPlaceholder: "AIzaSy...",
  },
  custom: {
    name: "Custom / Local",
    description: "Local or private OpenAI-compatible servers (vLLM, Ollama, LM Studio, LiteLLM)",
    icon: "dns",
    defaultUrl: "http://localhost:11434/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    urlLabel: "Base URL (Required)",
    urlPlaceholder: "http://10.239.37.110:8000/v1 or http://localhost:11434/v1",
    supportsCustomUrl: true,
    keyRequired: false,
    keyPlaceholder: "Optional authorization token...",
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
      maxTokens: 4096,
      contextLimit: "",
      showKey: false,
    },
    openai: {
      apiKey: "",
      baseUrl: "",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
      contextLimit: "",
      showKey: false,
    },
    anthropic: {
      apiKey: "",
      baseUrl: "",
      model: "claude-3-7-sonnet-20250219",
      temperature: 0.7,
      maxTokens: 4096,
      contextLimit: "",
      showKey: false,
    },
    gemini: {
      apiKey: "",
      baseUrl: "",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 4096,
      contextLimit: "",
      showKey: false,
    },
    custom: {
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "",
      temperature: 0.7,
      maxTokens: 4096,
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
      const payloadProviders: Record<string, any> = {};
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
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
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
                <MaterialSymbol
                  name={meta.icon}
                  className={`text-2xl ${
                    isSelected ? "text-primary" : "text-on-surface-variant"
                  }`}
                  filled
                />
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Active
                  </span>
                )}
              </div>
              <div className="mt-2">
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
            className={`flex size-8 items-center justify-center rounded-lg ${
              activeProvider === selectedProvider
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            <MaterialSymbol
              name={activeProvider === selectedProvider ? "check_circle" : "radio_button_unchecked"}
              className="text-lg"
            />
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
              max={selectedProvider === "anthropic" ? "1.0" : "2.0"}
              step="0.05"
              value={currentForm.temperature}
              onChange={(e) => updateCurrent({ temperature: parseFloat(e.target.value) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>0.0 (Precise / Deterministic)</span>
              <span>{selectedProvider === "anthropic" ? "1.0" : "2.0"} (Creative)</span>
            </div>
          </div>

          {/* Max Output Tokens */}
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">Max Output Tokens</span>
              <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {currentForm.maxTokens}
              </span>
            </div>
            <input
              type="range"
              min="512"
              max="16384"
              step="512"
              value={currentForm.maxTokens}
              onChange={(e) => updateCurrent({ maxTokens: parseInt(e.target.value, 10) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>512</span>
              <span>16,384</span>
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
