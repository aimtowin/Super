import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AutomationCommandGateway, AutomationExecutionContext } from '../automation/command-gateway';
import { AUTOMATION_API_VERSION } from '../automation/command-registry';
import { callSuperMcpTool, type SuperMcpPluginToolBridge } from './call-tool';
import { shouldEmitCommandCompleted } from './command-completed-filter';
import type { PluginMcpToolDefinition } from './plugin-tool-catalog';
import { listSuperMcpTools, mcpExposureAllowsWrite, type SuperMcpToolExposure } from './tool-catalog';

export type SuperMcpSessionEvent =
  | { type: 'context-changed' }
  | { type: 'tools-changed' }
  | { type: 'library-changed'; libraryId: string; changeSequence: number };

export interface SuperMcpSessionBackend {
  getExecutionContext(): AutomationExecutionContext | undefined;
  getToolExposure(): SuperMcpToolExposure;
  getPluginTools(): SuperMcpPluginToolBridge | undefined;
  /** Last known library change sequence for the response echo (ADR-0031 §2). */
  getLibraryChangeSequence?(libraryId: string): number | undefined;
  subscribe?(listener: (event: SuperMcpSessionEvent) => void): () => void;
}

export type SuperMcpServerOptions = {
  backend: SuperMcpSessionBackend;
  gateway: AutomationCommandGateway;
  serverName?: string;
  serverVersion?: string;
  /**
   * Desktop feedback for MCP tool results (Super-fmbr): fired only when a
   * non-read command actually executed (two-phase challenge reports excluded),
   * with the structured result so the renderer can show the same toast as the
   * manual operation. Read-only and failed calls deliberately emit nothing.
   */
  onCommandCompleted?: (input: {
    commandId: string;
    result: unknown;
  }) => void;
};

/**
 * MCP clients receive this during initialize, so an Agent does not have to
 * infer Super's targeting and confirmation rules from tool names alone.
 */
export const SUPER_MCP_INSTRUCTIONS = [
  'After initialize, call tools/list to discover the available Super tools.',
  'Call super_library_list_open or super_library_list_recent to obtain a libraryId.',
  'Every library-scoped tool call must include that explicit libraryId; desktop focus is never an implicit target.',
  'Critical operations first return an exact challenge and require a second confirmation call.',
].join(' ');

function toolResultText(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
} {
  const serialized = JSON.stringify(payload, null, 2);
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      content: [{ type: 'text', text: serialized }],
      structuredContent: payload as Record<string, unknown>,
    };
  }
  return { content: [{ type: 'text', text: serialized }] };
}

/** Creates the only MCP protocol implementation used by Super. */
export function createSuperMcpServer(options: SuperMcpServerOptions): Server {
  const { backend, gateway } = options;
  const server = new Server(
    {
      name: options.serverName ?? 'super',
      version: options.serverVersion ?? String(AUTOMATION_API_VERSION),
    },
    {
      capabilities: { tools: { listChanged: true }, logging: {} },
      instructions: SUPER_MCP_INSTRUCTIONS,
    },
  );

  const currentExposure = (): SuperMcpToolExposure => backend.getToolExposure();
  const pluginTools = (): readonly PluginMcpToolDefinition[] => {
    const exposure = currentExposure();
    const writeEnabled = mcpExposureAllowsWrite(exposure);
    if (!writeEnabled) return [];
    // Plugin tools are part of the static credential catalogue. A library
    // target, when required, is supplied in the individual call.
    const listed = backend.getPluginTools()?.list(undefined) ?? [];
    return listed;
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const listed = listSuperMcpTools(currentExposure());
    const pluginDefinitions = pluginTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const tool of pluginDefinitions) {
      if (names.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
      names.add(tool.name);
    }
    return {
      tools: [
        ...listed.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        })),
        ...pluginDefinitions.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        })),
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const progressToken = request.params._meta?.progressToken;
    const reportProgress = progressToken === undefined
      ? undefined
      : async (progress: number, total = 1, message?: string): Promise<void> => {
        try {
          await extra.sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress,
              total,
              ...(message === undefined ? {} : { message }),
            },
          });
        } catch {
          // Progress is advisory. A disconnected notification stream must not
          // turn the underlying Gateway result into a second failure.
        }
      };
    await reportProgress?.(0, 1, 'Super is running the tool.');
    const result = await callSuperMcpTool({
      toolName: request.params.name,
      arguments: request.params.arguments ?? {},
      context: backend.getExecutionContext(),
      exposure: currentExposure(),
      gateway,
      pluginTools: backend.getPluginTools(),
      signal: extra.signal,
      ...(backend.getLibraryChangeSequence === undefined
        ? {}
        : { getLibraryChangeSequence: backend.getLibraryChangeSequence }),
    });
    await reportProgress?.(1, 1, result.ok ? 'Super completed the tool.' : 'Super rejected the tool call.');
    if (result.ok && result.commandId !== undefined && result.plugin === undefined) {
      // Super-fmbr: only executed non-read commands surface on the desktop;
      // read calls and phase-1 challenge reports (nothing executed yet) stay quiet.
      if (shouldEmitCommandCompleted(result.commandId, result.result)) {
        const completedResult = result.result !== null
          && typeof result.result === 'object'
          && !Array.isArray(result.result)
          && result.historyEntryId !== undefined
          ? { ...(result.result as Record<string, unknown>), historyEntryId: result.historyEntryId }
          : result.result;
        options.onCommandCompleted?.({ commandId: result.commandId, result: completedResult });
      }
    }
    if (!result.ok) {
      return {
        ...toolResultText({ ok: false, code: result.code, message: result.message, gateway: result.gateway }),
        isError: true,
      };
    }
    return toolResultText({
      ok: true,
      toolName: result.toolName,
      commandId: result.commandId,
      ...(result.plugin === undefined ? {} : { plugin: result.plugin }),
      ...(result.libraryId === undefined ? {} : { libraryId: result.libraryId }),
      ...(result.libraryChangeSequence === undefined
        ? {}
        : { libraryChangeSequence: result.libraryChangeSequence }),
      result: result.result,
      ...(result.historyEntryId === undefined ? {} : { historyEntryId: result.historyEntryId }),
      ...(result.undoGroupId === undefined ? {} : { undoGroupId: result.undoGroupId }),
    });
  });

  const unsubscribe = backend.subscribe?.((event) => {
    if (event.type === 'tools-changed') {
      void server.sendToolListChanged().catch(() => undefined);
    }
    if (event.type === 'library-changed') {
      void server.sendLoggingMessage({
        level: 'info',
        logger: 'superApi.library',
        data: { type: 'library.changed', libraryId: event.libraryId, changeSequence: event.changeSequence },
      }).catch(() => undefined);
    }
  });
  const close = server.close.bind(server);
  server.close = async () => {
    unsubscribe?.();
    await close();
  };
  return server;
}
