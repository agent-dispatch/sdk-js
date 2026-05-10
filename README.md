# @agentdispatch/sdk

TypeScript SDK for submitting provider-neutral AgentDispatch tasks and retrieving durable status, logs, and results.

For MCP clients, use `spawnCloudAgent` when the user has configured a named runtime profile:

```ts
await client.spawnCloudAgent({
  runtime: "research-agent",
  instruction: "Run a long-running investigation and return a concise result."
});
```
