import type {
  AccountProfile,
  AdapterCapability,
  CancelResult,
  DispatchRequest,
  LogChunk,
  TaskHandle,
  TaskRecord,
  TaskResult
} from "@agent-dispatch/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface AgentDispatchRuntime {
  dispatchTask(request: DispatchRequest): Promise<TaskHandle>;
  getTaskStatus(taskId: string): Promise<TaskRecord>;
  getTaskLogs(taskId: string, cursor?: number, limit?: number): Promise<LogChunk>;
  getTaskResult(taskId: string): Promise<TaskResult>;
  cancelTask(taskId: string): Promise<CancelResult>;
  listProviders(): string[];
  listCapabilities(provider?: string): Array<AdapterCapability & { adapter: string }>;
  listAccountProfiles(): AccountProfile[];
}

export class AgentDispatchClient {
  constructor(private readonly runtime: AgentDispatchRuntime) {}

  dispatchTask(request: DispatchRequest) {
    return this.runtime.dispatchTask(request);
  }

  getTaskStatus(taskId: string) {
    return this.runtime.getTaskStatus(taskId);
  }

  getTaskLogs(taskId: string, cursor?: number, limit?: number) {
    return this.runtime.getTaskLogs(taskId, cursor, limit);
  }

  getTaskResult(taskId: string) {
    return this.runtime.getTaskResult(taskId);
  }

  cancelTask(taskId: string) {
    return this.runtime.cancelTask(taskId);
  }

  listProviders() {
    return this.runtime.listProviders();
  }

  listCapabilities(provider?: string) {
    return this.runtime.listCapabilities(provider);
  }

  listAccountProfiles() {
    return this.runtime.listAccountProfiles();
  }
}

export interface McpToolTransport {
  callTool(toolName: string, input: Record<string, unknown>): Promise<unknown>;
}

interface McpSdkClient {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export class McpSdkToolTransport implements McpToolTransport {
  constructor(private readonly client: McpSdkClient) {}

  callTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    return this.client.callTool({ name: toolName, arguments: input });
  }
}

export interface AgentDispatchStdioClientOptions extends StdioServerParameters {
  clientName?: string;
  clientVersion?: string;
}

export interface SpawnCloudAgentRequest {
  instruction: string;
  runtime?: string;
  context?: Record<string, unknown>;
  protocol?: string;
  framework?: string;
  model?: string | Record<string, unknown>;
  runtimeTools?: Record<string, unknown>;
  provider?: string;
  accountProfile?: string;
  target?: {
    mode?: string;
    protocol?: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export class AgentDispatchMcpClient {
  constructor(private readonly transport: McpToolTransport) {}

  async dispatchTask(request: DispatchRequest): Promise<TaskHandle> {
    return this.call<TaskHandle>("dispatch_task", {
      provider: request.provider,
      account_profile: request.accountProfile,
      capability: request.capability,
      backend: request.backend,
      task_type: request.taskType,
      target: request.target,
      input: request.input,
      metadata: request.metadata
    });
  }

  async spawnCloudAgent(request: SpawnCloudAgentRequest): Promise<TaskHandle> {
    return this.call<TaskHandle>("spawn_cloud_agent", {
      instruction: request.instruction,
      runtime: request.runtime,
      context: request.context,
      protocol: request.protocol,
      framework: request.framework,
      model: request.model,
      runtime_tools: request.runtimeTools,
      provider: request.provider,
      account_profile: request.accountProfile,
      target: request.target,
      metadata: request.metadata
    });
  }

  async getTaskStatus(taskId: string): Promise<TaskRecord> {
    return this.call<TaskRecord>("get_task_status", { task_id: taskId });
  }

  async getTaskLogs(taskId: string, cursor?: number, limit?: number): Promise<LogChunk> {
    return this.call<LogChunk>("get_task_logs", { task_id: taskId, cursor, limit });
  }

  async getTaskResult(taskId: string): Promise<TaskResult> {
    return this.call<TaskResult>("get_task_result", { task_id: taskId });
  }

  async cancelTask(taskId: string): Promise<CancelResult> {
    return this.call<CancelResult>("cancel_task", { task_id: taskId });
  }

  async listProviders(): Promise<string[]> {
    return this.call<string[]>("list_providers", {});
  }

  async listCapabilities(provider?: string): Promise<Array<AdapterCapability & { adapter: string }>> {
    return this.call<Array<AdapterCapability & { adapter: string }>>("list_capabilities", { provider });
  }

  async listAccountProfiles(): Promise<AccountProfile[]> {
    return this.call<AccountProfile[]>("list_account_profiles", {});
  }

  private async call<Result>(toolName: string, input: Record<string, unknown>): Promise<Result> {
    const result = await this.transport.callTool(toolName, removeUndefinedValues(input));
    return decodeToolResult<Result>(result);
  }
}

export class AgentDispatchStdioClient extends AgentDispatchMcpClient {
  private constructor(private readonly mcpClient: Client, transport: McpSdkToolTransport) {
    super(transport);
  }

  static async connect(options: AgentDispatchStdioClientOptions): Promise<AgentDispatchStdioClient> {
    const transport = new StdioClientTransport({
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
      stderr: options.stderr
    });
    const mcpClient = new Client({
      name: options.clientName ?? "agentdispatch-sdk",
      version: options.clientVersion ?? "0.1.0"
    });
    await mcpClient.connect(transport);
    return new AgentDispatchStdioClient(mcpClient, new McpSdkToolTransport(mcpClient));
  }

  close(): Promise<void> {
    return this.mcpClient.close();
  }
}

export function connectAgentDispatchStdioClient(options: AgentDispatchStdioClientOptions): Promise<AgentDispatchStdioClient> {
  return AgentDispatchStdioClient.connect(options);
}

function removeUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function decodeToolResult<Result>(result: unknown): Result {
  if (isTextContentResult(result)) {
    const text = result.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if ((result as { isError?: unknown }).isError === true) {
      throw new Error(text || "MCP tool call failed.");
    }
    if (!text) {
      throw new Error("MCP tool response did not include text content.");
    }
    try {
      return JSON.parse(text) as Result;
    } catch (error) {
      throw new Error(`MCP tool response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result as Result;
}

function isTextContentResult(result: unknown): result is { content: Array<{ type: string; text?: string }> } {
  return Boolean(
    result &&
      typeof result === "object" &&
      "content" in result &&
      Array.isArray((result as { content?: unknown }).content)
  );
}
