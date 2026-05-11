# @agent-dispatch/sdk

[![npm](https://img.shields.io/npm/v/@agent-dispatch/sdk.svg)](https://www.npmjs.com/package/@agent-dispatch/sdk)
[![license](https://img.shields.io/npm/l/@agent-dispatch/sdk.svg)](https://www.npmjs.com/package/@agent-dispatch/sdk)

JavaScript and TypeScript SDK for AgentDispatch. Use it to call the MCP server from applications, scripts, CLIs, or agent frameworks that want to spawn cloud subagents programmatically.

## What it does

- Wraps the provider-neutral AgentDispatch MCP tools.
- Provides typed requests for `spawn_cloud_agent`, `dispatch_task`, polling, logs, results, and cancellation.
- Preserves provider-neutral inputs so future adapters do not require SDK API churn.
- Returns cloud-agent metadata for A2A, MCP, AG-UI, or HTTP interaction after spawn.

## Install

```bash
npm install @agent-dispatch/sdk
```

## Spawn a cloud agent

```ts
import { AgentDispatchClient } from "@agent-dispatch/sdk";

const client = new AgentDispatchClient({
  command: "npx",
  args: ["@agent-dispatch/mcp-server", "--config", "/absolute/path/agentdispatch.config.json"]
});

const task = await client.spawnCloudAgent({
  provider: "aws",
  accountProfile: "dev-aws",
  capability: "agent-runtime",
  taskType: "agent.run",
  protocol: "a2a",
  target: { mode: "session" },
  input: {
    instruction: "Run a long-running repo analysis task.",
    context: {
      repo: "agent-dispatch",
      priority: "background"
    }
  }
});

console.log(task.taskId);
console.log(task.cloudAgent);
```

`context` is caller-defined metadata. AgentDispatch stores and forwards it; your runtime decides what to do with it. It is the right place for repo names, issue IDs, branch names, priority, user preferences, or other task-specific hints.

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
