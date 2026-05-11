import { describe, expect, it } from "vitest";
import type { DispatchRequest, TaskRecord } from "@agent-dispatch/core";
import { AgentDispatchClient, AgentDispatchMcpClient, type AgentDispatchRuntime, type McpToolTransport } from "../src/index.js";

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
      runtimeTools: { enabled: ["web-search"] }
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
      runtime_tools: { enabled: ["web-search"] }
    });
  });

  it("supports transports that return decoded JSON directly", async () => {
    const client = new AgentDispatchMcpClient({
      callTool: async () => ["aws", "gcp"]
    });

    await expect(client.listProviders()).resolves.toEqual(["aws", "gcp"]);
  });
});
