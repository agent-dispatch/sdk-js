import type { DispatchRequest, RuntimeService } from "@agentdispatch/core";

export class AgentDispatchClient {
  constructor(private readonly runtime: RuntimeService) {}

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
