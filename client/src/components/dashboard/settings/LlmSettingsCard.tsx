"use client";

import { useEffect, useRef, useState } from "react";
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
 * Authentic Full-Color Brand SVG Logos for AI Providers
 */
export function OpenRouterLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="OpenRouter Logo">
      <defs>
        <linearGradient id="or-vivid-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path
        d="M3.5 7.5L12 2.5L20.5 7.5L12 12.5L3.5 7.5Z"
        fill="url(#or-vivid-grad)"
      />
      <path
        d="M3.5 12L12 17L20.5 12"
        stroke="url(#or-vivid-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 16.5L12 21.5L20.5 16.5"
        stroke="url(#or-vivid-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OpenAILogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#10A37F" className={className} aria-label="OpenAI Logo">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.607 1.5-2.602-1.5z" />
    </svg>
  );
}

export function AnthropicLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Anthropic Claude Logo">
      {/* Terracotta Orange Claude Stylized Star / Icon */}
      <path
        d="M14.2 3.2h-4.4L3.8 20.8h4.2l1.5-4.2h6.2l1.5 4.2h4.2L14.2 3.2zm-3.8 10.2l2-5.6 2 5.6h-4z"
        fill="#D96B27"
      />
      <circle cx="12" cy="3.5" r="1.5" fill="#CC785C" />
      <circle cx="3.8" cy="20.8" r="1.5" fill="#CC785C" />
      <circle cx="20.2" cy="20.8" r="1.5" fill="#CC785C" />
    </svg>
  );
}

export function GeminiLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Google Gemini Logo">
      <defs>
        <linearGradient id="gemini-4color-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="35%" stopColor="#9B72CB" />
          <stop offset="70%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#FBBC05" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5C12 7.29899 7.29899 12 1.5 12C7.29899 12 12 16.701 12 22.5C12 16.701 16.701 12 22.5 12C16.701 12 12 7.29899 12 1.5Z"
        fill="url(#gemini-4color-grad)"
      />
    </svg>
  );
}

export function OllamaVllmLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Ollama & vLLM Local Logo">
      <defs>
        <linearGradient id="vllm-neon-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00E5FF" />
          <stop offset="100%" stopColor="#0072FF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#0F172A" />
      {/* Llama ears */}
      <path d="M7 6c0-1 .6-1.5 1.5-1.5S10 5 10 6v3H7V6zM14 6c0-1 .6-1.5 1.5-1.5S17 5 17 6v3h-3V6z" fill="#FFFFFF" />
      {/* Llama face */}
      <rect x="7" y="8" width="10" height="8" rx="2.5" fill="#FFFFFF" />
      <circle cx="9.5" cy="11" r="1" fill="#0F172A" />
      <circle cx="14.5" cy="11" r="1" fill="#0F172A" />
      <path d="M11 13.5h2" stroke="#0F172A" strokeWidth="1" strokeLinecap="round" />
      {/* vLLM speed ring */}
      <path d="M4 19h16" stroke="url(#vllm-neon-grad)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Returns a colorful brand logo for any individual model option based on its model ID
 */
export function ModelFamilyIcon({ modelId, className = "size-4" }: { modelId: string; className?: string }) {
  const lower = modelId.toLowerCase();
  if (lower.includes("openai") || lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) {
    return <OpenAILogo className={className} />;
  }
  if (lower.includes("anthropic") || lower.includes("claude")) {
    return <AnthropicLogo className={className} />;
  }
  if (lower.includes("google") || lower.includes("gemini") || lower.includes("gemma")) {
    return <GeminiLogo className={className} />;
  }
  if (lower.includes("meta") || lower.includes("llama")) {
    return (
      <svg viewBox="0 0 24 24" fill="#0081FB" className={className} aria-label="Meta Llama Logo">
        <path d="M12 4.5C7.3 4.5 3.5 7.9 3.5 12s3.8 7.5 8.5 7.5 8.5-3.4 8.5-7.5-3.8-7.5-8.5-7.5zm-2.8 10.2c-1.8 0-3.2-1.3-3.2-3s1.4-3 3.2-3c1.2 0 2.2.6 2.7 1.5-.5 1-1.4 2.2-2.7 4.5zm5.6 0c-1.3-2.3-2.2-3.5-2.7-4.5.5-.9 1.5-1.5 2.7-1.5 1.8 0 3.2 1.3 3.2 3s-1.4 3-3.2 3z" />
      </svg>
    );
  }
  if (lower.includes("mistral") || lower.includes("mixtral") || lower.includes("codestral")) {
    return (
      <svg viewBox="0 0 24 24" fill="#FF7000" className={className} aria-label="Mistral Logo">
        <path d="M3 5h4v14H3V5zm7 0h4v14h-4V5zm7 0h4v14h-4V5z" />
      </svg>
    );
  }
  if (lower.includes("deepseek")) {
    return (
      <svg viewBox="0 0 24 24" fill="#4D6BFE" className={className} aria-label="DeepSeek Logo">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5v-2.1c1.8-.3 3.1-1.9 3.1-3.9 0-2.2-1.8-4-4-4s-4 1.8-4 4c0 2 1.3 3.6 3.1 3.9v2.1c-3-.4-5.3-2.9-5.3-6 0-3.3 2.7-6 6-6s6 2.7 6 6c0 3.1-2.3 5.6-5.3 6z" />
      </svg>
    );
  }
  if (lower.includes("qwen")) {
    return (
      <svg viewBox="0 0 24 24" fill="#615CED" className={className} aria-label="Qwen Logo">
        <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v10l10 5 10-5V6l-10 5z" />
      </svg>
    );
  }
  return <MaterialSymbol name="smart_toy" className={`text-primary ${className}`} />;
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
      return <OllamaVllmLogo className={className} />;
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

function ModelSelectorDropdown({
  models,
  selectedModel,
  onSelect,
}: {
  models: ModelOption[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = models.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q));
  });

  const selectedItem = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-w-[220px] max-w-full items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 text-xs text-on-surface outline-none transition hover:bg-surface-container-high focus:border-primary"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedItem ? (
            <>
              <ModelFamilyIcon modelId={selectedItem.id} className="size-4 shrink-0" />
              <span className="truncate font-medium">{selectedItem.name || selectedItem.id}</span>
              {selectedItem.context_length && (
                <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                  {Math.round(selectedItem.context_length / 1000)}k
                </span>
              )}
            </>
          ) : (
            <span className="text-on-surface-variant">Browse models ({models.length})</span>
          )}
        </div>
        <MaterialSymbol name={open ? "expand_less" : "expand_more"} className="text-base text-on-surface-variant shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-80 w-84 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high shadow-2xl backdrop-blur-xl">
          <div className="border-b border-outline-variant/60 p-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2.5 py-1.5">
              <MaterialSymbol name="search" className="text-sm text-on-surface-variant" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${models.length} models...`}
                className="w-full bg-transparent text-xs text-on-surface outline-none placeholder:text-on-surface-variant/50"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-on-surface-variant hover:text-on-surface">
                  <MaterialSymbol name="close" className="text-xs" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-on-surface-variant">
                No matching models found
              </div>
            ) : (
              filtered.map((m) => {
                const isSelected = m.id === selectedModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      isSelected
                        ? "bg-primary text-on-primary font-semibold"
                        : "text-on-surface hover:bg-surface-container-highest"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <ModelFamilyIcon modelId={m.id} className="size-4 shrink-0" />
                      <div className="truncate">
                        <div className="truncate text-xs leading-tight">{m.name || m.id}</div>
                        <div className={`truncate font-mono text-[10px] ${isSelected ? "text-on-primary/75" : "text-on-surface-variant"}`}>
                          {m.id}
                        </div>
                      </div>
                    </div>
                    {m.context_length && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                          isSelected ? "bg-on-primary/20 text-on-primary" : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {Math.round(m.context_length / 1000)}k ctx
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

  // Auto-fetch models on provider selection if not yet cached
  useEffect(() => {
    if (!discoveredModels[selectedProvider]) {
      api<FetchModelsOut>("/org/settings/llm/fetch-models", {
        method: "POST",
        json: {
          provider: selectedProvider,
          api_key: formState[selectedProvider].apiKey,
          base_url: formState[selectedProvider].baseUrl,
        },
      })
        .then((res) => {
          if (res.models?.length > 0) {
            setDiscoveredModels((prev) => ({
              ...prev,
              [selectedProvider]: res.models,
            }));
          }
        })
        .catch(() => {
          // Ignore auto-fetch background errors
        });
    }
  }, [selectedProvider]);

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
        json: {
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
        },
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
        json: {
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
          model: currentForm.model,
          temperature: currentForm.temperature,
        },
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
        json: {
          active_provider: activeProvider,
          providers: payloadProviders,
        },
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
              <ModelSelectorDropdown
                models={modelsList}
                selectedModel={currentForm.model}
                onSelect={(modelId) => updateCurrent({ model: modelId })}
              />
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
