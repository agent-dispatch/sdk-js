# @agent-dispatch/sdk

[![npm](https://img.shields.io/npm/v/@agent-dispatch/sdk.svg)](https://www.npmjs.com/package/@agent-dispatch/sdk)
[![CI](https://github.com/agent-dispatch/sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-dispatch/sdk-js/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@agent-dispatch/sdk.svg)](https://www.npmjs.com/package/@agent-dispatch/sdk)

JavaScript and TypeScript SDK for AgentDispatch. Use it to call the MCP server from applications, scripts, CLIs, or agent frameworks that want to spawn cloud subagents programmatically.

## What it does

- Wraps the provider-neutral AgentDispatch MCP tools.
- Provides typed requests for `check_cloud_agent_runtime`, `spawn_cloud_agent`, `dispatch_task`, polling, logs, results, and cancellation.
- Preserves provider-neutral inputs so future adapters do not require SDK API churn.
- Returns cloud-agent metadata for A2A, MCP, AG-UI, or HTTP interaction after spawn.

## Install

```bash
npm install @agent-dispatch/sdk
```

## Spawn a cloud agent

```ts
import { AgentDispatchStdioClient } from "@agent-dispatch/sdk";

const client = await AgentDispatchStdioClient.connect({
  command: "npx",
  args: ["-y", "@agent-dispatch/mcp-server", "--config", "/absolute/path/agentdispatch.config.json"]
});

const readiness = await client.checkCloudAgentRuntime({
  runtime: "research-agent",
  live: true
});
if (!readiness.ok) {
  throw new Error(`Cloud agent runtime is not ready: ${JSON.stringify(readiness.checks)}`);
}

const task = await client.spawnCloudAgent({
  instruction: "Run a long-running repo analysis task.",
  protocol: "a2a",
  context: {
    repo: "agent-dispatch",
    priority: "background"
  }
});

console.log(task.taskId);
console.log(task.cloudAgent);
await client.close();
```

`context` is caller-defined metadata. AgentDispatch stores and forwards it; your runtime decides what to do with it. It is the right place for repo names, issue IDs, branch names, priority, user preferences, or other task-specific hints.

If the MCP server asks for missing runtime information, retry with the requested fields directly on `spawnCloudAgent`:

```ts
await client.spawnCloudAgent({
  instruction: "Run the repo analysis in the cloud.",
  runtimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/research-agent"
});
```

Runtime-provisioning mode can also pass `ecrImageUri`, `executionRoleArn`, and `environmentVariables`. These are provider-specific setup fields, but they stay optional and do not change the stable MCP tool contract.

## Continue with A2A

When the runtime returns `cloudAgent.protocol === "a2a"`, the SDK can turn that handoff metadata into a JSON-RPC `message/send` follow-up request. For AWS AgentCore, pass the generated request through a SigV4/AWS SDK transport in your app or agent framework:

```ts
import { sendCloudAgentA2AMessage } from "@agent-dispatch/sdk";

const response = await sendCloudAgentA2AMessage(
  task.cloudAgent!,
  { text: "Continue the investigation and focus on IAM findings." },
  async (request) => {
    // Sign and send `request.url`, `request.headers`, and `request.body`
    // with your provider-specific client.
    return signedAgentCoreFetch(request);
  }
);

console.log(response.text);
```

If you already have an MCP transport in your agent framework, use `AgentDispatchMcpClient` directly:

```ts
import { AgentDispatchMcpClient } from "@agent-dispatch/sdk";

const client = new AgentDispatchMcpClient(existingTransport);
```

## Poll for completion

```ts
const status = await client.getTaskStatus(task.taskId);
const logs = await client.getTaskLogs(task.taskId);
const result = await client.getTaskResult(task.taskId);
```

## Framework use

OpenClaw, Hermes Agent, Claude Code, Codex, or any custom orchestrator can use this SDK when it can launch an MCP server process. The lead agent remains the planner; AgentDispatch handles cloud runtime dispatch and durable state.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

See the [release workflow](https://github.com/agent-dispatch/sdk-js/blob/main/docs/release.md) for npm Trusted Publisher setup, provenance publishing, and upstream package order.
