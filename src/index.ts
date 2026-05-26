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

export interface CloudAgentInteraction {
  protocol: string;
  provider: string;
  backend: string;
  accountProfile: string;
  sessionId?: string;
  providerRefs?: Record<string, unknown>;
  invocation?: Record<string, unknown>;
  a2a?: Record<string, unknown>;
  framework?: string;
  model?: unknown;
  tools?: Record<string, unknown>;
}

export interface A2AMessagePart {
  kind: "text" | (string & {});
  text?: string;
  [key: string]: unknown;
}

export interface CloudAgentA2AMessage {
  id?: string;
  role?: "user" | "agent" | (string & {});
  text?: string;
  parts?: A2AMessagePart[];
  messageId?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudAgentA2AHttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  cloudAgent: CloudAgentInteraction;
}

export interface CloudAgentA2AResult {
  raw: unknown;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudAgentRuntimeCheckRequest {
  runtime?: string;
  provider?: string;
  accountProfile?: string;
  account_profile?: string;
  live?: boolean;
  runtimeArn?: string;
  runtime_arn?: string;
  target?: {
    mode?: string;
    protocol?: string;
    details?: Record<string, unknown>;
  };
}

export interface CloudAgentRuntimeCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface CloudAgentRuntimeCheckResult {
  ok: boolean;
  runtime?: string;
  provider?: string;
  accountProfile?: string;
  account_profile?: string;
  backend?: string;
  adapter?: string;
  targetMode?: string;
  target_mode?: string;
  checks: CloudAgentRuntimeCheck[];
}

export type CloudAgentA2ATransport =
  | ((request: CloudAgentA2AHttpRequest) => Promise<unknown>)
  | { send(request: CloudAgentA2AHttpRequest): Promise<unknown> };

export interface SpawnCloudAgentRequest {
  instruction: string;
  runtime?: string;
  context?: Record<string, unknown>;
  protocol?: string;
  framework?: string;
  model?: string | Record<string, unknown>;
  runtimeTools?: Record<string, unknown>;
  runtime_tools?: Record<string, unknown>;
  runtimeArn?: string;
  runtime_arn?: string;
  ecrImageUri?: string;
  ecr_image_uri?: string;
  executionRoleArn?: string;
  execution_role_arn?: string;
  environmentVariables?: Record<string, unknown>;
  environment_variables?: Record<string, unknown>;
  provider?: string;
  accountProfile?: string;
  account_profile?: string;
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
      runtime_tools: request.runtimeTools ?? request.runtime_tools,
      runtimeArn: request.runtimeArn,
      runtime_arn: request.runtime_arn,
      ecrImageUri: request.ecrImageUri,
      ecr_image_uri: request.ecr_image_uri,
      executionRoleArn: request.executionRoleArn,
      execution_role_arn: request.execution_role_arn,
      environmentVariables: request.environmentVariables,
      environment_variables: request.environment_variables,
      provider: request.provider,
      account_profile: request.accountProfile ?? request.account_profile,
      target: request.target,
      metadata: request.metadata
    });
  }

  async checkCloudAgentRuntime(request: CloudAgentRuntimeCheckRequest = {}): Promise<CloudAgentRuntimeCheckResult> {
    return this.call<CloudAgentRuntimeCheckResult>("check_cloud_agent_runtime", {
      runtime: request.runtime,
      provider: request.provider,
      account_profile: request.accountProfile ?? request.account_profile,
      live: request.live,
      runtimeArn: request.runtimeArn,
      runtime_arn: request.runtime_arn,
      target: request.target
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

export function createA2AMessageSendPayload(message: CloudAgentA2AMessage): Record<string, unknown> {
  const parts = message.parts ?? (message.text !== undefined ? [{ kind: "text", text: message.text }] : undefined);
  if (!parts?.length) {
    throw new Error("A2A follow-up requires message.text or message.parts.");
  }

  return {
    jsonrpc: "2.0",
    id: message.id ?? createClientId("a2a"),
    method: "message/send",
    params: {
      message: {
        role: message.role ?? "user",
        parts,
        messageId: message.messageId ?? createClientId("msg")
      },
      ...(message.metadata ? { metadata: message.metadata } : {})
    }
  };
}

export function createCloudAgentA2AHttpRequest(cloudAgent: CloudAgentInteraction, message: CloudAgentA2AMessage): CloudAgentA2AHttpRequest {
  if (cloudAgent.protocol !== "a2a") {
    throw new Error(`Cloud agent protocol is ${cloudAgent.protocol}, not a2a.`);
  }
  const url = stringValue(cloudAgent.a2a?.endpointUrl) ?? stringValue(cloudAgent.invocation?.runtimeUrl);
  if (!url) {
    throw new Error("Cloud agent A2A endpoint URL is missing.");
  }
  const sessionHeaderName = stringValue(cloudAgent.a2a?.sessionHeaderName) ?? stringValue(cloudAgent.invocation?.sessionHeaderName);
  const sessionHeaderValue = stringValue(cloudAgent.a2a?.sessionHeaderValue) ?? stringValue(cloudAgent.invocation?.sessionHeaderValue);
  const payload = createA2AMessageSendPayload(withCloudAgentA2AMetadata(cloudAgent, message));
  const method = stringValue(cloudAgent.a2a?.messageMethod) ?? "message/send";
  payload.method = method;

  const headers: Record<string, string> = {
    "content-type": stringValue(cloudAgent.invocation?.contentType) ?? "application/json",
    accept: stringValue(cloudAgent.invocation?.accept) ?? "application/json"
  };
  if (sessionHeaderName && sessionHeaderValue) {
    headers[sessionHeaderName] = sessionHeaderValue;
  }

  return {
    url,
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cloudAgent
  };
}

export async function sendCloudAgentA2AMessage(
  cloudAgent: CloudAgentInteraction,
  message: CloudAgentA2AMessage,
  transport: CloudAgentA2ATransport
): Promise<CloudAgentA2AResult> {
  const request = createCloudAgentA2AHttpRequest(cloudAgent, message);
  const raw = typeof transport === "function" ? await transport(request) : await transport.send(request);
  return decodeA2AResult(raw);
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

function decodeA2AResult(raw: unknown): CloudAgentA2AResult {
  const candidate = isRecord(raw) && isRecord(raw.result) ? raw.result : raw;
  const message = isRecord(candidate) && isRecord(candidate.message) ? candidate.message : candidate;
  const parts = isRecord(message) && Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n") || undefined;
  const metadata = isRecord(message) && isRecord(message.metadata)
    ? message.metadata
    : isRecord(candidate) && isRecord(candidate.metadata)
      ? candidate.metadata
      : undefined;
  return { raw, text, metadata };
}

function withCloudAgentA2AMetadata(cloudAgent: CloudAgentInteraction, message: CloudAgentA2AMessage): CloudAgentA2AMessage {
  const defaults: Record<string, unknown> = {};
  if (cloudAgent.framework) defaults.framework = cloudAgent.framework;
  if (cloudAgent.model !== undefined) defaults.model = cloudAgent.model;
  if (cloudAgent.tools) defaults.runtime_tools = cloudAgent.tools;
  const metadata = { ...defaults, ...message.metadata };
  return Object.keys(metadata).length > 0 ? { ...message, metadata } : message;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createClientId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
