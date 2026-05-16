import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "agentdispatch-sdk-test", version: "0.1.0" });

server.tool("spawn_cloud_agent", { instruction: z.string(), context: z.record(z.unknown()).optional() }, async (input) => ({
  content: [{
    type: "text",
    text: JSON.stringify({
      taskId: "task_stdio",
      status: "queued",
      provider: "aws",
      accountProfile: "dev-aws",
      capability: "agent-runtime",
      backend: "mock-agent-runtime",
      cloudAgent: {
        protocol: "a2a",
        sessionId: "session_stdio"
      },
      poll: {
        statusTool: "get_task_status",
        logsTool: "get_task_logs",
        resultTool: "get_task_result"
      },
      input
    })
  }]
}));

server.tool("get_task_status", { task_id: z.string() }, async ({ task_id }) => ({
  content: [{ type: "text", text: JSON.stringify({ id: task_id, status: "succeeded" }) }]
}));

await server.connect(new StdioServerTransport());
