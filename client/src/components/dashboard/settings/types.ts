export type BrandingOut = {
  has_custom_logo: boolean;
  logo_filename: string;
  logo_content_type: string;
  logo: string | null;
  updated_at: string | null;
};

export type LlmProviderType = "openrouter" | "openai" | "anthropic" | "gemini" | "custom";

export type LlmProviderConfigOut = {
  has_api_key: boolean;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  context_limit?: number | null;
};

export type LlmSettingsOut = {
  active_provider: LlmProviderType;
  providers: Partial<Record<LlmProviderType, LlmProviderConfigOut>>;
  updated_at: string | null;
};

export type ModelOption = {
  id: string;
  name: string;
  context_length?: number | null;
};

export type FetchModelsOut = {
  models: ModelOption[];
};

export type TestLlmConnectionOut = {
  success: boolean;
  message: string;
  latency_ms: number;
  response_preview?: string;
};

/**
 * Payload of `GET /org/settings`.
 */
export type OrgSettingsOut = {
  branding: BrandingOut;
  llm: LlmSettingsOut;
};
