import {
  formatAiLanguagesForPrompt,
  resolveAnthropicMessagesUrl,
  resolveDashScopeMultimodalGenerationUrl,
  resolveGeminiGenerateContentUrl,
  resolveOpenAiChatCompletionsUrl,
  resolveOpenAiResponsesUrl,
  type AiApiFormat,
} from '../shared/ai-endpoints';
import { z } from 'zod';

import { aiSearchPlanSchema, type AiSearchPlan, type FilterClause } from '../shared/asset-types';
import type { PublicErrorReason } from '../shared/protocol/errors';

/** @deprecated Prefer AiApiFormat. Kept for older unit tests that still pass brand ids. */
export type AiSearchProvider = 'openai' | 'gemini' | 'anthropic';

export class AiSearchPlannerError extends Error {
  constructor(
    readonly reason: Extract<PublicErrorReason,
      | 'AI_AUTH'
      | 'AI_PERMISSION'
      | 'AI_QUOTA'
      | 'AI_RATE_LIMIT'
      | 'AI_NETWORK'
      | 'AI_TIMEOUT'
      | 'AI_INVALID_RESPONSE'
      | 'AI_REFUSED'>,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiSearchPlannerError';
  }
}

const boundedTerm = z.string().min(1).max(512).transform((value) => value.trim())
  .refine((value) => value.length > 0, 'Search terms cannot be blank.')
  .refine((value) => !/^(?:[A-Za-z]:[\\/]|[/\\]{1,2})/u.test(value), 'Absolute paths are not search-plan terms.');
const rawRangeSchema = z.strictObject({
  min: z.number().finite().nonnegative().nullable(),
  max: z.number().finite().nonnegative().nullable(),
}).refine((range) => range.min !== null || range.max !== null, 'A numeric range requires a bound.')
  .refine((range) => range.min === null || range.max === null || range.min <= range.max, 'Range bounds are reversed.');
const rawFilterSchema = z.strictObject({
  kind: z.enum(['categorical', 'numeric']),
  field: z.enum([
    'format', 'tag', 'rating', 'favorite', 'source_url', 'availability',
    'width', 'height', 'aspect_ratio', 'duration_ms',
  ]),
  values: z.array(boundedTerm).max(32),
  ranges: z.array(rawRangeSchema).max(32),
  exclude: z.boolean(),
}).superRefine((filter, context) => {
  const numeric = ['width', 'height', 'aspect_ratio', 'duration_ms'].includes(filter.field);
  if ((filter.kind === 'numeric') !== numeric) {
    context.addIssue({ code: 'custom', message: 'Filter kind does not match its field.' });
  }
  if (numeric && (filter.ranges.length === 0 || filter.values.length > 0)) {
    context.addIssue({ code: 'custom', message: 'Numeric filters require ranges and no values.' });
  }
  if (!numeric && filter.ranges.length > 0) {
    context.addIssue({ code: 'custom', message: 'Categorical filters cannot contain ranges.' });
  }
  if (!numeric && !['favorite', 'source_url'].includes(filter.field) && filter.values.length === 0) {
    context.addIssue({ code: 'custom', message: 'Categorical filters require values.' });
  }
});

const rawPlanSchema = z.strictObject({
  keywords: z.array(boundedTerm).max(16),
  synonyms: z.array(boundedTerm).max(16),
  exclusions: z.array(boundedTerm).max(16),
  filters: z.array(rawFilterSchema).max(16),
  sort: z.strictObject({
    field: z.enum(['name', 'modified_at', 'created_at', 'byte_size', 'duration', 'rating', 'color']),
    order: z.enum(['asc', 'desc']),
  }).nullable(),
});

const RANGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    min: { type: ['number', 'null'], minimum: 0 },
    max: { type: ['number', 'null'], minimum: 0 },
  },
  required: ['min', 'max'],
} as const;

const FILTER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['categorical', 'numeric'] },
    field: {
      type: 'string',
      enum: [
        'format', 'tag', 'rating', 'favorite', 'source_url', 'availability',
        'width', 'height', 'aspect_ratio', 'duration_ms',
      ],
    },
    values: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 512 } },
    ranges: { type: 'array', maxItems: 32, items: RANGE_JSON_SCHEMA },
    exclude: { type: 'boolean' },
  },
  required: ['kind', 'field', 'values', 'ranges', 'exclude'],
} as const;

export const AI_SEARCH_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keywords: { type: 'array', maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 512 } },
    synonyms: { type: 'array', maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 512 } },
    exclusions: { type: 'array', maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 512 } },
    filters: { type: 'array', maxItems: 16, items: FILTER_JSON_SCHEMA },
    sort: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', enum: ['name', 'modified_at', 'created_at', 'byte_size', 'duration', 'rating', 'color'] },
            order: { type: 'string', enum: ['asc', 'desc'] },
          },
          required: ['field', 'order'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['keywords', 'synonyms', 'exclusions', 'filters', 'sort'],
} as const;

// Gemini's `responseSchema` accepts the OpenAPI schema subset, where nullable
// values are expressed with `nullable: true` instead of JSON Schema type arrays.
const GEMINI_AI_SEARCH_PLAN_SCHEMA = {
  ...AI_SEARCH_PLAN_JSON_SCHEMA,
  properties: {
    ...AI_SEARCH_PLAN_JSON_SCHEMA.properties,
    filters: {
      type: 'array', maxItems: 16,
      items: {
        ...FILTER_JSON_SCHEMA,
        properties: {
          ...FILTER_JSON_SCHEMA.properties,
          ranges: {
            type: 'array', maxItems: 32,
            items: {
              type: 'object',
              properties: {
                min: { type: 'number', minimum: 0, nullable: true },
                max: { type: 'number', minimum: 0, nullable: true },
              },
              required: ['min', 'max'],
            },
          },
        },
      },
    },
    sort: {
      type: 'object',
      nullable: true,
      properties: {
        field: { type: 'string', enum: ['name', 'modified_at', 'created_at', 'byte_size', 'duration', 'rating', 'color'] },
        order: { type: 'string', enum: ['asc', 'desc'] },
      },
      required: ['field', 'order'],
    },
  },
} as const;

const SYSTEM_PROMPT = `You translate a user's natural-language request into a Super digital-asset search plan.
Return only one valid JSON object, with no Markdown fences or surrounding text. Always include keywords, synonyms, exclusions, filters, and sort; use [] or null when a section is unused. Never output SQL, code, filesystem paths, IDs, or new operators.
Use concise literal keywords. Put related alternative terms in synonyms and unwanted concepts in exclusions.
Allowed categorical filters: format, tag, rating (0-5 strings), favorite/source_url (empty values means presence), availability (available or missing). Never invent a filter: use a filter only when the user explicitly requests that constraint. Otherwise search with keywords, synonyms, and exclusions only.
Allowed numeric filters: width/height in pixels, aspect_ratio as a positive ratio, duration_ms in milliseconds. Numeric filters use ranges; categorical filters use values. Unused arrays must be empty.
Only add a sort when the user explicitly asks for ordering. The ordinary parameterized Super search engine will execute the plan.`;

type Fetch = typeof globalThis.fetch;

function resolveSearchApiFormat(
  input: { apiFormat?: AiApiFormat; provider?: AiSearchProvider },
): AiApiFormat {
  if (input.apiFormat) return input.apiFormat;
  switch (input.provider) {
    case 'gemini':
      return 'gemini_native';
    case 'anthropic':
      return 'anthropic';
    case 'openai':
    default:
      return 'openai_chat';
  }
}

function searchSystemPrompt(languages?: readonly string[]): string {
  const langLine = formatAiLanguagesForPrompt(languages ?? ['zh-CN', 'en']);
  return `${SYSTEM_PROMPT}

Prefer keywords, synonyms, and exclusions that work for search in these languages: ${langLine}.
When multiple languages are configured, include useful terms in each language where appropriate.`;
}

export async function planAiSearch(input: {
  apiFormat?: AiApiFormat;
  /** @deprecated Prefer apiFormat. */
  provider?: AiSearchProvider;
  model: string;
  apiKey: string;
  naturalQuery: string;
  baseUrl?: string;
  languages?: readonly string[];
  fetchFn?: Fetch;
  timeoutMs?: number;
}): Promise<AiSearchPlan> {
  const apiFormat = resolveSearchApiFormat(input);
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000);
  try {
    try {
      return await requestSearchPlan({
        input: { ...input, apiFormat },
        signal: controller.signal,
        fetchFn,
        openAiOutputMode: 'json_schema',
      });
    } catch (error) {
      // Some OpenAI-compatible model gateways advertise json_schema but do
      // not enforce it. Retry once using the older json_object contract,
      // which is materially better supported by those gateways. Both paths
      // still go through the same strict local schema validation.
      if (!(apiFormat === 'openai_chat' && error instanceof AiSearchPlannerError && error.reason === 'AI_INVALID_RESPONSE')) {
        throw error;
      }
      return await requestSearchPlan({
        input: { ...input, apiFormat },
        signal: controller.signal,
        fetchFn,
        openAiOutputMode: 'json_object',
      });
    }
  } catch (error) {
    if (error instanceof AiSearchPlannerError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new AiSearchPlannerError('AI_TIMEOUT', 'AI search planning timed out.', { cause: error });
    }
    throw new AiSearchPlannerError('AI_NETWORK', 'Could not reach the AI provider.', { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSearchPlan(input: {
  input: {
    apiFormat: AiApiFormat;
    model: string;
    apiKey: string;
    naturalQuery: string;
    baseUrl?: string;
    languages?: readonly string[];
  };
  signal: AbortSignal;
  fetchFn: Fetch;
  openAiOutputMode: 'json_schema' | 'json_object';
}): Promise<AiSearchPlan> {
  const response = await input.fetchFn(
    ...providerRequest(input.input, input.signal, input.openAiOutputMode),
  );
  if (!response.ok) throw await httpFailure(response);
  const body = await readJson(response);
  return constrainPlanToRequestedFilters(
    normalizePlan(extractProviderOutput(input.input.apiFormat, body)),
    input.input.naturalQuery,
  );
}

function providerRequest(
  input: {
    apiFormat: AiApiFormat;
    model: string;
    apiKey: string;
    naturalQuery: string;
    baseUrl?: string;
    languages?: readonly string[];
  },
  signal: AbortSignal,
  openAiOutputMode: 'json_schema' | 'json_object' = 'json_schema',
): Parameters<Fetch> {
  const system = searchSystemPrompt(input.languages);
  if (input.apiFormat === 'openai_chat') {
    return [resolveOpenAiChatCompletionsUrl(input.baseUrl), {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        messages: [{ role: 'system', content: system }, { role: 'user', content: input.naturalQuery }],
        response_format: openAiOutputMode === 'json_schema'
          ? {
            type: 'json_schema',
            json_schema: { name: 'super_search_plan', strict: true, schema: AI_SEARCH_PLAN_JSON_SCHEMA },
          }
          : { type: 'json_object' },
      }),
    }];
  }
  if (input.apiFormat === 'openai_responses') {
    return [resolveOpenAiResponsesUrl(input.baseUrl), {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        instructions: system,
        input: [{ role: 'user', content: [{ type: 'input_text', text: input.naturalQuery }] }],
        text: {
          format: {
            type: 'json_schema',
            name: 'super_search_plan',
            strict: true,
            schema: AI_SEARCH_PLAN_JSON_SCHEMA,
          },
        },
      }),
    }];
  }
  if (input.apiFormat === 'dashscope_native') {
    // A DashScope profile has one selected model. The default qwen3-vl-plus
    // is a multimodal model, so use its multimodal generation endpoint even
    // for text-only search planning instead of the text-only model endpoint.
    return [resolveDashScopeMultimodalGenerationUrl(input.baseUrl), {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        input: {
          messages: [
            { role: 'system', content: `${system}\nReturn only one JSON object with no Markdown fences.` },
            { role: 'user', content: input.naturalQuery },
          ],
        },
        parameters: {
          result_format: 'message',
          response_format: { type: 'json_object' },
          temperature: 0,
        },
      }),
    }];
  }
  if (input.apiFormat === 'gemini_native') {
    return [resolveGeminiGenerateContentUrl(input.model, input.baseUrl), {
      method: 'POST', signal,
      headers: { 'x-goog-api-key': input.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input.naturalQuery }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_AI_SEARCH_PLAN_SCHEMA,
        },
      }),
    }];
  }
  return [resolveAnthropicMessagesUrl(input.baseUrl), {
    method: 'POST', signal,
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1_024,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: input.naturalQuery }],
      tools: [{
        name: 'super_prepare_search',
        description: 'Prepare a constrained Super search plan.',
        input_schema: AI_SEARCH_PLAN_JSON_SCHEMA,
      }],
      tool_choice: { type: 'tool', name: 'super_prepare_search' },
    }),
  }];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new AiSearchPlannerError('AI_INVALID_RESPONSE', 'The provider returned unreadable JSON.', { cause: error });
  }
}

function extractProviderOutput(apiFormat: AiApiFormat, body: unknown): unknown {
  const record = asRecord(body);
  if (apiFormat === 'openai_responses') {
    if (typeof record.output_text === 'string' && record.output_text.trim()) {
      return parseEmbeddedJson(record.output_text);
    }
    if (Array.isArray(record.output)) {
      let content = '';
      for (const item of record.output) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (row.type !== 'message' || !Array.isArray(row.content)) continue;
        for (const part of row.content) {
          if (!part || typeof part !== 'object') continue;
          const block = part as Record<string, unknown>;
          if (
            (block.type === 'output_text' || block.type === 'text') &&
            typeof block.text === 'string'
          ) {
            content += block.text;
          }
        }
      }
      if (content.trim()) return parseEmbeddedJson(content);
    }
    throw new AiSearchPlannerError(
      'AI_INVALID_RESPONSE',
      'OpenAI Responses output was empty.',
    );
  }
  if (apiFormat === 'openai_chat') {
    const message = asRecord(asRecord(asArray(record.choices)[0]).message);
    if (typeof message.refusal === 'string' && message.refusal.trim()) {
      throw new AiSearchPlannerError('AI_REFUSED', 'The provider refused to prepare this search.');
    }
    return parseEmbeddedJson(message.content);
  }
  if (apiFormat === 'dashscope_native') {
    const output = asRecord(record.output);
    const choice = asRecord(asArray(output.choices)[0]);
    const content = asRecord(choice.message).content;
    const text = typeof content === 'string'
      ? content
      : asArray(content)
        .map((part) => asRecord(part).text)
        .find((value): value is string => typeof value === 'string');
    return parseEmbeddedJson(text);
  }
  if (apiFormat === 'gemini_native') {
    const feedback = asRecord(record.promptFeedback);
    if (typeof feedback.blockReason === 'string' && feedback.blockReason) {
      throw new AiSearchPlannerError('AI_REFUSED', 'The provider blocked this search request.');
    }
    const candidate = asRecord(asArray(record.candidates)[0]);
    if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(String(candidate.finishReason))) {
      throw new AiSearchPlannerError('AI_REFUSED', 'The provider refused to prepare this search.');
    }
    const parts = asArray(asRecord(candidate.content).parts);
    const text = parts.map((part) => asRecord(part).text).find((value): value is string => typeof value === 'string');
    return parseEmbeddedJson(text);
  }
  const content = asArray(record.content);
  const toolUse = content.map(asRecord).find((item) => item.type === 'tool_use' && item.name === 'super_prepare_search');
  if (!toolUse) {
    const refused = content.map(asRecord).some((item) => item.type === 'text');
    throw new AiSearchPlannerError(refused ? 'AI_REFUSED' : 'AI_INVALID_RESPONSE',
      refused ? 'The provider refused to prepare this search.' : 'The provider did not return the search tool result.');
  }
  return toolUse.input;
}

function parseEmbeddedJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 65_536) {
    throw new AiSearchPlannerError('AI_INVALID_RESPONSE', 'The provider did not return a bounded structured result.');
  }
  const source = extractJsonObject(value);
  try {
    return JSON.parse(source);
  } catch (error) {
    // A few OpenAI-compatible gateways claim json_schema support but still
    // occasionally omit a comma between adjacent fields.  Repair only that
    // narrow, unambiguous pattern; arbitrary JSON recovery would risk turning
    // an invalid model answer into a different search query.
    try {
      return JSON.parse(repairCommonJsonPunctuation(source));
    } catch (repairError) {
      throw new AiSearchPlannerError('AI_INVALID_RESPONSE', 'The provider returned invalid search-plan JSON.', {
        cause: repairError instanceof Error ? repairError : error,
      });
    }
  }
}

function extractJsonObject(value: string): string {
  const unfenced = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  return first >= 0 && last > first ? unfenced.slice(first, last + 1) : unfenced;
}

function repairCommonJsonPunctuation(value: string): string {
  return value
    // `"one" "two"` is a common omission between two array values.
    .replace(/("(?:[^"\\]|\\.)*")\s*(?="(?:[^"\\]|\\.)*")/g, '$1,')
    // `] "nextField":` and `} "nextField":` are the common model error.
    .replace(/([}\]])\s*(?="(?:[^"\\]|\\.)+"\s*:)/g, '$1,')
    // The same omission can follow a primitive field value.
    .replace(/((?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null))\s*(?="(?:[^"\\]|\\.)+"\s*:)/g, '$1,')
    .replace(/,(\s*[}\]])/g, '$1');
}

function normalizePlan(input: unknown): AiSearchPlan {
  let parsed: z.infer<typeof rawPlanSchema>;
  try {
    // OpenAI-compatible providers occasionally emit only the useful terms
    // and omit empty optional sections.  These omissions are safe to fill
    // locally; unknown fields and malformed filters still remain rejected by
    // the strict schema below.
    parsed = rawPlanSchema.parse(coercePlanShape(input));
  } catch (error) {
    throw new AiSearchPlannerError('AI_INVALID_RESPONSE', 'The provider returned an unsupported search plan.', { cause: error });
  }
  const filters: FilterClause[] = parsed.filters.map((filter) => {
    if (filter.kind === 'numeric') {
      return {
        field: filter.field as 'width' | 'height' | 'aspect_ratio' | 'duration_ms',
        ranges: filter.ranges.map((range) => ({
          ...(range.min === null ? {} : { min: range.min }),
          ...(range.max === null ? {} : { max: range.max }),
        })),
        exclude: filter.exclude,
      };
    }
    return {
      field: filter.field as 'format' | 'tag' | 'rating' | 'favorite' | 'source_url' | 'availability',
      values: unique(filter.values),
      exclude: filter.exclude,
    };
  });
  try {
    return aiSearchPlanSchema.parse({
      keywords: unique(parsed.keywords),
      synonyms: unique(parsed.synonyms),
      exclusions: unique(parsed.exclusions),
      filters,
      ...(parsed.sort === null ? {} : { sort: parsed.sort }),
    });
  } catch (error) {
    throw new AiSearchPlannerError('AI_INVALID_RESPONSE', 'The provider returned an invalid search plan.', { cause: error });
  }
}

function coercePlanShape(input: unknown): unknown {
  const source = asRecord(input);
  const terms = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const rawFilters = coerceCompatibleFilters(source.filters, terms);
  const filters = rawFilters.map((value) => {
    const filter = asRecord(value);
    return {
      ...filter,
      kind: filter.kind,
      field: filter.field,
      values: terms(filter.values),
      ranges: Array.isArray(filter.ranges) ? filter.ranges : [],
      exclude: filter.exclude === true,
    };
  }).filter((filter) => !isEmptyCompatibleFilter(filter));
  const sort = source.sort && typeof source.sort === 'object' && !Array.isArray(source.sort)
    ? source.sort
    : null;
  return {
    ...source,
    keywords: terms(source.keywords),
    synonyms: terms(source.synonyms),
    exclusions: terms(source.exclusions),
    filters,
    sort,
  };
}

/** Empty known filter clauses have no query meaning. Compatible models emit
 * them frequently for unused dimensions; discard them before strict parsing
 * instead of rejecting an otherwise useful keyword-only search plan. */
function isEmptyCompatibleFilter(filter: Record<string, unknown>): boolean {
  if (filter.kind === 'categorical'
    && typeof filter.field === 'string'
    && !['favorite', 'source_url'].includes(filter.field)
    && Array.isArray(filter.values)
    && filter.values.length === 0
    && ['format', 'tag', 'rating', 'availability'].includes(filter.field)) {
    return true;
  }
  return filter.kind === 'numeric'
    && typeof filter.field === 'string'
    && ['width', 'height', 'aspect_ratio', 'duration_ms'].includes(filter.field)
    && Array.isArray(filter.ranges)
    && filter.ranges.length === 0;
}

/**
 * A few OpenAI-compatible models return a compact filters object such as
 * `{ "format": ["png"], "availability": "available" }` despite being
 * asked for an array of typed clauses. Translate only recognised fields; an
 * unknown key remains untouched so strict validation rejects it as before.
 */
function coerceCompatibleFilters(
  value: unknown,
  terms: (value: unknown) => unknown[],
): unknown[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value]
      : [];
  const categoricalFields = new Set([
    'format', 'tag', 'rating', 'favorite', 'source_url', 'availability',
  ]);
  const numericFields = new Set(['width', 'height', 'aspect_ratio', 'duration_ms']);

  return entries.flatMap((value) => {
    const filter = asRecord(value);
    // This is already the documented clause shape (possibly missing harmless
    // empty fields, which the caller fills below).
    if ('kind' in filter || 'field' in filter) return [filter];
    const keys = Object.keys(filter);
    if (keys.length === 0) return [filter];
    // Preserve an unrecognised loose object to make the strict schema fail;
    // never silently turn a model-invented operation into a search filter.
    if (keys.some((key) => !categoricalFields.has(key) && !numericFields.has(key))) return [filter];
    return keys.map((field) => {
      const fieldValue = filter[field];
      if (categoricalFields.has(field)) {
        return {
          kind: 'categorical', field, values: terms(fieldValue), ranges: [], exclude: false,
        };
      }
      const rawRanges = Array.isArray(fieldValue)
        ? fieldValue
        : fieldValue && typeof fieldValue === 'object'
          ? [fieldValue]
          : [];
      return {
        kind: 'numeric', field, values: [],
        ranges: rawRanges.map((range) => {
          const record = asRecord(range);
          return {
            min: typeof record.min === 'number' ? record.min : null,
            max: typeof record.max === 'number' ? record.max : null,
          };
        }),
        exclude: false,
      };
    });
  });
}

/**
 * Compatible models sometimes add presentation defaults such as "image",
 * "available", or rating 4–5 even when the user did not ask for them. These
 * look harmless but can silently remove every indexed asset. Keep structured
 * filters only when the request explicitly asks for that filter dimension.
 */
function constrainPlanToRequestedFilters(plan: AiSearchPlan, naturalQuery: string): AiSearchPlan {
  const query = naturalQuery.trim().toLowerCase();
  const asks = (pattern: RegExp) => pattern.test(query);
  const asksForImage = asks(/\bimage(?:s)?\b|\bpicture(?:s)?\b|\bphoto(?:s)?\b|图片|图像|照片/u);
  const asksForVideo = asks(/\bvideo(?:s)?\b|\bmovie(?:s)?\b|视频|影片/u);
  const asksForDocument = asks(/\bdocument(?:s)?\b|\bpdf\b|文档|文件/u);
  const asksForFormat = asksForImage || asksForVideo || asksForDocument
    || asks(/\bformat\b|格式|扩展名|\b(?:png|jpe?g|webp|gif|mp4|mov|webm|pdf)\b/u);
  const asksForRating = asks(/\brating\b|评分|星级|几星|分数/u);
  const asksForTags = asks(/\btag(?:s)?\b|标签/u);
  const asksForFavorite = asks(/\bfavou?rite(?:s)?\b|收藏|喜欢/u);
  const asksForSourceUrl = asks(/\bsource\b|来源|网址|链接/u);
  const asksForAvailability = asks(/\bavailable\b|\bmissing\b|可用|缺失|找不到|丢失/u);
  const asksForNumeric = asks(/\b(?:width|height|duration|seconds?|minutes?)\b|宽度|高度|时长|分钟|秒/u);

  const filters = plan.filters.flatMap((filter) => {
    if (filter.field === 'format') {
      if (!asksForFormat) return [];
      const values = filter.values.filter((value) => formatValueMatchesRequest(
        value, { asksForImage, asksForVideo, asksForDocument, query },
      ));
      return values.length > 0 ? [{ ...filter, values }] : [];
    }
    if (filter.field === 'tag') return asksForTags ? [filter] : [];
    if (filter.field === 'rating') return asksForRating ? [filter] : [];
    if (filter.field === 'favorite') return asksForFavorite ? [filter] : [];
    if (filter.field === 'source_url') return asksForSourceUrl ? [filter] : [];
    if (filter.field === 'availability') return asksForAvailability ? [filter] : [];
    return asksForNumeric ? [filter] : [];
  });
  return { ...plan, filters };
}

function formatValueMatchesRequest(
  value: string,
  request: { asksForImage: boolean; asksForVideo: boolean; asksForDocument: boolean; query: string },
): boolean {
  const token = value.trim().replace(/^\./, '').toLowerCase();
  // An explicitly named extension always wins over its broader media class.
  if (request.query.includes(token)) return true;
  const isImage = ['image', 'images', 'picture', 'pictures', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(token);
  const isVideo = ['video', 'videos', 'movie', 'movies', 'mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'm4v'].includes(token);
  const isDocument = ['document', 'documents', 'pdf', 'doc', 'docx'].includes(token);
  if (isImage) return request.asksForImage;
  if (isVideo) return request.asksForVideo;
  if (isDocument) return request.asksForDocument;
  return false;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function httpFailure(response: Response): Promise<AiSearchPlannerError> {
  const status = response.status;
  const body = await response.text().catch(() => '');
  let reason: AiSearchPlannerError['reason'];
  if (status === 401) reason = 'AI_AUTH';
  else if (status === 403) reason = 'AI_PERMISSION';
  else if (status === 429 && /quota|billing|exhausted/i.test(body)) reason = 'AI_QUOTA';
  else if (status === 429) reason = 'AI_RATE_LIMIT';
  else if (status >= 500) reason = 'AI_NETWORK';
  else reason = 'AI_INVALID_RESPONSE';
  return new AiSearchPlannerError(reason, `AI search provider failed with HTTP ${status}.`);
}

export function aiSearchFailureReason(error: unknown): PublicErrorReason {
  return error instanceof AiSearchPlannerError ? error.reason : 'AI_INVALID_RESPONSE';
}
