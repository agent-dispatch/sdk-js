import { describe, expect, it } from "vitest";
import type { DispatchRequest, TaskRecord } from "@agent-dispatch/core";
import {
  AgentDispatchClient,
  AgentDispatchMcpClient,
  AgentDispatchStdioClient,
  connectAgentDispatchStdioClient,
  createA2AMessageSendPayload,
  createCloudAgentA2AHttpRequest,
  sendCloudAgentA2AMessage,
  type AgentDispatchRuntime,
  type McpToolTransport
} from "../src/index.js";

const request: DispatchRequest = {
  provider: "aws",
  accountProfile: "dev-aws",
  capability: "agent-runtime",
  taskType: "agent.run",
  target: { mode: "session" },
  input: { instruction: "run a long task" }
};

describe("AgentDispatchClient", () => {
  it("delegates task lifecycle calls to the configured runtime service", async () => {
    const calls: string[] = [];
    const runtime = {
      dispatchTask: async (dispatchRequest: DispatchRequest) => {
        calls.push(`dispatch:${dispatchRequest.provider}`);
        return {
          taskId: "task_sdk",
          status: "provisioning",
          provider: dispatchRequest.provider,
          accountProfile: dispatchRequest.accountProfile,
          capability: dispatchRequest.capability,
          backend: "aws-agentcore",
          poll: {
            statusTool: "get_task_status",
            logsTool: "get_task_logs",
            resultTool: "get_task_result"
          }
        };
      },
      getTaskStatus: async (taskId: string) => {
        calls.push(`status:${taskId}`);
        return {
          id: taskId,
          provider: "aws",
          accountProfile: "dev-aws",
          capability: "agent-runtime",
          taskType: "agent.run",
          target: { mode: "session" },
          input: { instruction: "run a long task" },
          backend: "aws-agentcore",
          status: "running",
          providerRefs: {},
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        };
      },
      getTaskLogs: async (taskId: string, cursor?: number, limit?: number) => {
        calls.push(`logs:${taskId}:${cursor}:${limit}`);
        return { taskId, cursor, nextCursor: 5, data: "hello" };
      },
      getTaskResult: async (taskId: string) => {
        calls.push(`result:${taskId}`);
        return { taskId, status: "succeeded", artifacts: [] };
      },
      cancelTask: async (taskId: string) => {
        calls.push(`cancel:${taskId}`);
        return { status: "cancelled" };
      },
      listProviders: () => {
        calls.push("providers");
        return ["aws"];
      },
      listCapabilities: (provider?: string) => {
        calls.push(`capabilities:${provider}`);
        return [{ adapter: "aws-agentcore", provider: "aws", capability: "agent-runtime", taskTypes: ["agent.run"], targetModes: ["session"] }];
      },
      listAccountProfiles: () => {
        calls.push("accounts");
        return [{ name: "dev-aws", provider: "aws", credentialSource: "aws-sdk-default" }];
      }
    } as AgentDispatchRuntime;

    const client = new AgentDispatchClient(runtime);

    await expect(client.dispatchTask(request)).resolves.toMatchObject({ taskId: "task_sdk", backend: "aws-agentcore" });
    await expect(client.getTaskStatus("task_sdk")).resolves.toMatchObject({ status: "running" });
    await expect(client.getTaskLogs("task_sdk", 0, 128)).resolves.toMatchObject({ data: "hello" });
    await expect(client.getTaskResult("task_sdk")).resolves.toMatchObject({ status: "succeeded" });
    await expect(client.cancelTask("task_sdk")).resolves.toMatchObject({ status: "cancelled" });
    expect(client.listProviders()).toEqual(["aws"]);
    expect(client.listCapabilities("aws")).toHaveLength(1);
    expect(client.listAccountProfiles()).toHaveLength(1);
    expect(calls).toEqual([
      "dispatch:aws",
      "status:task_sdk",
      "logs:task_sdk:0:128",
      "result:task_sdk",
      "cancel:task_sdk",
      "providers",
      "capabilities:aws",
      "accounts"
    ]);
  });
});

describe("AgentDispatchMcpClient", () => {
  it("calls the provider-neutral MCP tools with stable snake_case inputs", async () => {
    const calls: Array<{ toolName: string; input: Record<string, unknown> }> = [];
    const task: Partial<TaskRecord> = { id: "task_mcp", status: "running" };
    const transport: McpToolTransport = {
      callTool: async (toolName, input) => {
        calls.push({ toolName, input });
        const responses: Record<string, unknown> = {
          dispatch_task: { taskId: "task_mcp", status: "provisioning", provider: "aws", accountProfile: "dev-aws" },
          spawn_cloud_agent: { taskId: "task_spawn", status: "provisioning", provider: "aws", accountProfile: "dev-aws" },
          get_task_status: task,
          get_task_logs: { taskId: "task_mcp", cursor: 0, nextCursor: 5, data: "hello" },
          get_task_result: { taskId: "task_mcp", status: "succeeded", artifacts: [] },
          cancel_task: { status: "cancelled" },
          list_providers: ["aws"],
          list_capabilities: [{ adapter: "aws-agentcore", provider: "aws", capability: "agent-runtime", taskTypes: ["agent.run"], targetModes: ["session"] }],
          list_account_profiles: [{ name: "dev-aws", provider: "aws", credentialSource: "aws-sdk-default" }]
        };
        return { content: [{ type: "text", text: JSON.stringify(responses[toolName]) }] };
      }
    };

    const client = new AgentDispatchMcpClient(transport);

    await expect(client.dispatchTask(request)).resolves.toMatchObject({ taskId: "task_mcp" });
    await expect(client.spawnCloudAgent({
      instruction: "research this",
      runtime: "research-agent",
      context: { repo: "agent-dispatch" },
      protocol: "a2a",
      model: { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet" },
      runtimeTools: { enabled: ["web-search"] },
      runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/research-agent",
      ecrImageUri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/research-agent:latest",
      executionRoleArn: "arn:aws:iam::123456789012:role/agentcore-runtime",
      environmentVariables: { AGENT_FRAMEWORK: "openclaw" }
    })).resolves.toMatchObject({ taskId: "task_spawn" });
    await expect(client.getTaskStatus("task_mcp")).resolves.toMatchObject({ status: "running" });
    await expect(client.getTaskLogs("task_mcp", 0, 128)).resolves.toMatchObject({ data: "hello" });
    await expect(client.getTaskResult("task_mcp")).resolves.toMatchObject({ status: "succeeded" });
    await expect(client.cancelTask("task_mcp")).resolves.toMatchObject({ status: "cancelled" });
    await expect(client.listProviders()).resolves.toEqual(["aws"]);
    await expect(client.listCapabilities("aws")).resolves.toHaveLength(1);
    await expect(client.listAccountProfiles()).resolves.toHaveLength(1);
    expect(calls.map((call) => call.toolName)).toEqual([
      "dispatch_task",
      "spawn_cloud_agent",
      "get_task_status",
      "get_task_logs",
      "get_task_result",
      "cancel_task",
      "list_providers",
      "list_capabilities",
      "list_account_profiles"
    ]);
    expect(calls[0].input).toMatchObject({
      provider: "aws",
      account_profile: "dev-aws",
      capability: "agent-runtime",
      task_type: "agent.run"
    });
    expect(calls[1].input).toMatchObject({
      instruction: "research this",
      runtime: "research-agent",
      context: { repo: "agent-dispatch" },
      protocol: "a2a",
      model: { provider: "bedrock", modelId: "anthropic.claude-3-5-sonnet" },
      runtime_tools: { enabled: ["web-search"] },
      runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/research-agent",
      ecrImageUri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/research-agent:latest",
      executionRoleArn: "arn:aws:iam::123456789012:role/agentcore-runtime",
      environmentVariables: { AGENT_FRAMEWORK: "openclaw" }
    });
  });

  it("supports transports that return decoded JSON directly", async () => {
    const client = new AgentDispatchMcpClient({
      callTool: async () => ["aws", "gcp"]
    });

    await expect(client.listProviders()).resolves.toEqual(["aws", "gcp"]);
  });

  it("accepts MCP-native spawn aliases for clarification retries", async () => {
    let forwarded: Record<string, unknown> | undefined;
    const client = new AgentDispatchMcpClient({
      callTool: async (toolName, input) => {
        forwarded = input;
        return { taskId: `task_${toolName}`, status: "provisioning" };
      }
    });

    await client.spawnCloudAgent({
      instruction: "continue after clarification",
      account_profile: "dev-aws",
      runtime_tools: { enabled: ["repo-search"] },
      runtime_arn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/clarified",
      ecr_image_uri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/agent:latest",
      execution_role_arn: "arn:aws:iam::123456789012:role/agentcore-runtime",
      environment_variables: { AGENT_FRAMEWORK: "hermes" }
    });

    expect(forwarded).toMatchObject({
      account_profile: "dev-aws",
      runtime_tools: { enabled: ["repo-search"] },
      runtime_arn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/clarified",
      ecr_image_uri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/agent:latest",
      execution_role_arn: "arn:aws:iam::123456789012:role/agentcore-runtime",
      environment_variables: { AGENT_FRAMEWORK: "hermes" }
    });
  });

  it("throws clear errors for MCP error and malformed text responses", async () => {
    const errorClient = new AgentDispatchMcpClient({
      callTool: async () => ({ content: [{ type: "text", text: "bad request" }], isError: true })
    });
    await expect(errorClient.listProviders()).rejects.toThrow("bad request");

    const malformedClient = new AgentDispatchMcpClient({
      callTool: async () => ({ content: [{ type: "text", text: "not json" }] })
    });
    await expect(malformedClient.listProviders()).rejects.toThrow("not valid JSON");

    const emptyClient = new AgentDispatchMcpClient({
      callTool: async () => ({ content: [{ type: "image", data: "..." }] })
    });
    await expect(emptyClient.listProviders()).rejects.toThrow("did not include text content");
  });

  it("can launch and call an MCP server over stdio", async () => {
    const client = await AgentDispatchStdioClient.connect({
      command: process.execPath,
      args: [new URL("fixtures/stdio-server.mjs", import.meta.url).pathname],
      stderr: "pipe"
    });

    try {
      await expect(client.spawnCloudAgent({
        instruction: "run through stdio",
        context: { repo: "agent-dispatch" }
      })).resolves.toMatchObject({
        taskId: "task_stdio",
        cloudAgent: { protocol: "a2a", sessionId: "session_stdio" }
      });
      await expect(client.getTaskStatus("task_stdio")).resolves.toMatchObject({ status: "succeeded" });
    } finally {
      await client.close();
    }
  });

  it("exposes a helper for connecting stdio MCP servers", async () => {
    expect(typeof connectAgentDispatchStdioClient).toBe("function");
  });
});

describe("cloud agent A2A helpers", () => {
  const cloudAgent = {
    protocol: "a2a",
    provider: "aws",
    backend: "aws-agentcore",
    accountProfile: "dev-aws",
    sessionId: "session_123",
    framework: "openclaw",
    model: "claude-sonnet",
    tools: { enabled: ["repo-search"] },
    invocation: {
      type: "aws.agentcore.invoke_agent_runtime",
      provider: "aws",
      accountProfile: "dev-aws",
      runtimeUrl: "https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/runtime/invocations/",
      sessionHeaderName: "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id",
      sessionHeaderValue: "session_123",
      contentType: "application/json",
      accept: "application/json"
    },
    a2a: {
      transport: "json-rpc-2.0-http",
      messageMethod: "message/send",
      endpointUrl: "https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/runtime/invocations/",
      sessionHeaderName: "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id",
      sessionHeaderValue: "session_123"
    }
  } as const;

  it("builds A2A message/send payloads", () => {
    expect(createA2AMessageSendPayload({ id: "req-1", messageId: "msg-1", text: "continue" })).toEqual({
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        message: {
          role: "user",
          parts: [{ kind: "text", text: "continue" }],
          messageId: "msg-1"
        }
      }
    });
  });

  it("builds cloud-agent A2A HTTP requests with AgentCore session headers", () => {
    const request = createCloudAgentA2AHttpRequest(cloudAgent, {
      id: "req-1",
      messageId: "msg-1",
      text: "continue",
      metadata: { priority: "background" }
    });

    expect(request).toMatchObject({
      url: "https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/runtime/invocations/",
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": "session_123"
      }
    });
    expect(JSON.parse(request.body)).toMatchObject({
      jsonrpc: "2.0",
      method: "message/send",
      params: {
        metadata: {
          framework: "openclaw",
          model: "claude-sonnet",
          runtime_tools: { enabled: ["repo-search"] },
          priority: "background"
        },
        message: { parts: [{ kind: "text", text: "continue" }] }
      }
    });
  });

  it("sends A2A follow-up messages through an injected transport", async () => {
    const calls: unknown[] = [];
    const result = await sendCloudAgentA2AMessage(cloudAgent, { text: "next step" }, async (request) => {
      calls.push(request);
      return {
        jsonrpc: "2.0",
        id: "req-1",
        result: {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: "done" }],
          metadata: { ok: true }
        }
      };
    });

    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ text: "done", metadata: { ok: true } });
  });

  it("rejects non-A2A cloud-agent metadata", () => {
    expect(() => createCloudAgentA2AHttpRequest({ ...cloudAgent, protocol: "http" }, { text: "continue" }))
      .toThrow("not a2a");
  });
});
