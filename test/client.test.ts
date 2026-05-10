import { describe, expect, it } from "vitest";
import type { DispatchRequest, RuntimeService } from "@agentdispatch/core";
import { AgentDispatchClient } from "../src/index.js";

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
        return { id: taskId, status: "running" };
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
    } as unknown as RuntimeService;

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
