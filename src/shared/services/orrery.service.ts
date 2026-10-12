
import { get, post, put, del, GATEWAY_BASE } from './request';
import config from '../config';

const B  = config.SERVICE_BUTLER;   // orrery-butler-service
const A  = config.SERVICE_ADMIN;    // orrery-admin-service
const SC = config.SERVICE_SCENARIO; // scenario-agent

// ─── 类型定义 ────────────────────────────────────────────────
export interface CapabilitySummary {
  capabilityId: string;
  name?: string;
  summary?: string;
  intentHints?: string[];
}

export interface AgentEntry {
  agentId: string;
  name?: string;
  version?: string;
  description?: string;
  serviceName?: string;
  enabled?: boolean;
  supportsStreaming?: boolean;
  capabilityIds?: string[];
  capabilitySummaries?: CapabilitySummary[];
  tags?: string[];
}

export interface WorkspaceLayerInfo {
  layer: string;
  filename: string;
  description?: string;
  frontmatter?: Record<string, any>;
  body?: string;
  bodyLength?: number;
}

export interface ButlerStatus {
  snapshotVersion: number;
  totalAgents: number;
  routableAgents: number;
}

export interface LogRecord {
  id?: number;
  traceId?: string;
  requestId?: string;
  parentSpanId?: string;
  source?: string;
  logType?: string;
  serviceName?: string;
  serverIp?: string;
  requestMethod?: string;
  requestUri?: string;
  requestParams?: string;
  clientIp?: string;
  responseStatus?: number;
  duration?: number;
  userId?: number;
  username?: string;
  nickname?: string;
  module?: string;
  operation?: string;
  targetType?: string;
  targetId?: string;
  beforeData?: string;
  afterData?: string;
  description?: string;
  changeSummary?: string;
  success?: boolean;
  errorMessage?: string;
  createTime?: number;
}

export interface PageResult<T> {
  records: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ─── TraceDetail 结构化链路 ──────────────────────────────────
export interface TraceDetailVO {
  traceId: string;
  startTime: number;
  totalDuration: number;
  success: boolean;
  serviceName?: string;
  requestUri?: string;
  requestMethod?: string;
  clientIp?: string;
  user?: TraceUserInfo;
  summary: TraceSummary;
  spanTree: SpanNode[];
}

export interface TraceUserInfo {
  userId?: number;
  username?: string;
  nickname?: string;
}

export interface TraceSummary {
  totalSpans: number;
  totalServices: number;
  failedSpans: number;
  maxDepth: number;
  bottleneckMethod?: string;
  bottleneckDuration: number;
}

export interface SpanNode {
  id?: number;
  serviceName?: string;
  className?: string;
  methodName?: string;
  depth: number;
  startTime: number;
  offsetFromTraceStart: number;
  duration: number;
  actualDuration: number;
  inputArgs?: string;
  returnValue?: string;
  success: boolean;
  errorMessage?: string;
  module?: string;
  description?: string;
  children: SpanNode[];
}

/** @deprecated 保留兼容，请使用 LogRecord */
export interface AuditEvent extends LogRecord {}

export interface TaskPlan {
  taskId: string;
  status: string;
  userMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  steps?: PlanStep[];
  /** 文件产物（file_write/file_edit 节点产出，终态合并入任务热态） */
  artifacts?: TaskArtifact[];
  // 计划宪法（L2/L3 计划路径挂载）
  constraints?: string[];
  acceptanceCriteria?: string[];
  complexityLevel?: string;
  classifyRationale?: string;
  planConfirmed?: boolean;
  errorMessage?: string;
}

/** 计划步骤（对齐后端 PlanStep） */
export interface PlanStep {
  stepId: string;
  stepIndex?: number;
  stepKind?: 'TOOL' | 'EXTERNAL_AGENT' | 'HUMAN_GATE' | 'SUB_AGENT';
  description?: string;
  /** 执行目标显示名（工具中文名 / Agent 名；无绑定步骤为空） */
  targetName?: string;
  status?: string;
  dependsOn?: string[];
  toolId?: string;
  targetAgentId?: string;
  targetCapabilityId?: string;
  toolSubset?: string[];
  input?: Record<string, any>;
  output?: Record<string, any>;
  errorMessage?: string;
  confirmRequired?: boolean;
  confirmMessage?: string;
  acceptanceCheck?: string;
  onFailure?: 'abort' | 'continue';
  maxRetries?: number;
  retryCount?: number;
  completedAt?: string;
}

/** 执行轨迹（对齐后端 ButlerExecutionTrace） */
export interface ExecutionTrace {
  id?: number;
  taskId: string;
  runId: string;
  parentRunId?: string;
  engine: string;
  stopStatus?: string;
  executedCount?: number;
  droppedCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  errorCode?: string;
  userId?: string;
  promptVersion?: string;
  createTime?: string | number;
}

/**
 * 装备库参数定义，对应后端 com.cy.scenario.model.EquipmentParam
 * 注意：scenario-agent 新版接口使用 name/code/category/classifies/description/ports[...]
 * 结构，已与旧版 (equipId/equipName/classify) 不兼容。
 */
export interface EquipmentParam {
  paramKey: string;
  paramType?: string;
  defaultValue?: any;
  description?: string;
  required?: boolean;
  geo?: boolean;
  enums?: Array<Record<string, any>> | null;
  params?: EquipmentParam[] | null;
  [key: string]: any;
}

export interface EquipmentPort {
  portName: string;
  params?: EquipmentParam[];
}

export interface EquipmentInfo {
  name: string;
  code?: string;
  category?: string;
  classifies?: string[];
  description?: string;
  ports?: EquipmentPort[];
  [key: string]: any;
}

/** @deprecated 旧字段，保留兼容引用。新代码请使用 {@link EquipmentInfo}。 */
export type Equipment = EquipmentInfo;

// ─── Butler Management ───────────────────────────────────────
export const butlerService = {
  /** 查询所有可路由 Agent */
  listAgents: async (): Promise<AgentEntry[]> => {
    const res = await get(`${B}/butler/management/agents`);
    return res.data?.data ?? [];
  },

  /** 查询指定 Agent 详情 */
  getAgent: async (agentId: string): Promise<AgentEntry> => {
    const res = await get(`${B}/butler/management/agents/${agentId}`);
    return res.data?.data;
  },

  /** 按能力查询 Agent */
  findByCapability: async (capabilityId: string): Promise<AgentEntry[]> => {
    const res = await get(`${B}/butler/management/agents/by-capability/${capabilityId}`);
    return res.data?.data ?? [];
  },

  /** Butler 状态摘要 */
  getStatus: async (): Promise<ButlerStatus> => {
    const res = await get(`${B}/butler/management/status`);
    return res.data?.data;
  },
};

// ─── Workspace ───────────────────────────────────────────────
export const workspaceService = {
  listLayers: async (): Promise<WorkspaceLayerInfo[]> => {
    const res = await get(`${B}/butler/workspace/layers`);
    return res.data?.data ?? [];
  },

  getLayer: async (layerName: string): Promise<WorkspaceLayerInfo> => {
    const res = await get(`${B}/butler/workspace/layers/${layerName}`);
    return res.data?.data;
  },

  updateLayer: async (layerName: string, content: string): Promise<boolean> => {
    const res = await put(`${B}/butler/workspace/layers/${layerName}`, content, {
      headers: { 'Content-Type': 'text/plain' },
    });
    return res.data?.data ?? false;
  },

  reload: async (): Promise<boolean> => {
    const res = await post(`${B}/butler/workspace/reload`);
    return res.data?.data ?? false;
  },

  getSystemPrompt: async (): Promise<string> => {
    const res = await get(`${B}/butler/workspace/system-prompt`);
    return res.data?.data ?? '';
  },
};

// ─── Tasks ───────────────────────────────────────────────────
export const taskService = {
  listRecent: async (limit = 50): Promise<TaskPlan[]> => {
    const res = await get(`${B}/butler/tasks?limit=${limit}`);
    return res.data?.data ?? [];
  },
  getTask: async (taskId: string): Promise<TaskPlan> => {
    const res = await get(`${B}/butler/tasks/${taskId}`);
    return res.data?.data;
  },

  getTaskEvents: async (taskId: string): Promise<any[]> => {
    const res = await get(`${B}/butler/tasks/${taskId}/events`);
    return res.data?.data ?? [];
  },

  confirmTask: async (taskId: string): Promise<TaskPlan> => {
    const res = await post(`${B}/butler/tasks/${taskId}/confirm`);
    return res.data?.data;
  },

  cancelTask: async (taskId: string): Promise<TaskPlan> => {
    const res = await post(`${B}/butler/tasks/${taskId}/cancel`);
    return res.data?.data;
  },

  listBySession: async (sessionId: string): Promise<TaskPlan[]> => {
    const res = await get(`${B}/butler/tasks`, { params: { sessionId } });
    return res.data?.data ?? [];
  },

  getTaskTraces: async (taskId: string): Promise<ExecutionTrace[]> => {
    const res = await get(`${B}/butler/traces/${taskId}`);
    return res.data?.data ?? [];
  },

  getReplay: async (taskId: string): Promise<{
    task: TaskPlan;
    traces: ExecutionTrace[];
    constitution: {
      goal?: string; constraints?: string[]; acceptanceCriteria?: string[];
      complexityLevel?: string; classifyRationale?: string;
    };
  } | null> => {
    const res = await get(`${B}/butler/tasks/${taskId}/replay`);
    return res.data?.data ?? null;
  },
};

// ─── Logs (统一日志查询，路由到 admin-service) ──────────────────
export const logService = {
  query: async (params: {
    startTime?: number; endTime?: number; logType?: string;
    module?: string; success?: boolean; keyword?: string;
    page?: number; size?: number;
  } = {}): Promise<PageResult<LogRecord>> => {
    const res = await get(`${A}/admin/logs`, {
      params: { page: 1, size: 20, ...params },
    });
    return res.data?.data ?? { records: [], total: 0, page: 1, size: 20, pages: 0 };
  },

  queryByTraceId: async (traceId: string): Promise<LogRecord[]> => {
    const res = await get(`${A}/admin/logs/trace/${traceId}`);
    return res.data?.data ?? [];
  },

  queryTraceDetail: async (traceId: string): Promise<TraceDetailVO | null> => {
    const res = await get(`${A}/admin/logs/trace/${traceId}/detail`);
    return res.data?.data ?? null;
  },
};

/** @deprecated 兼容别名，请直接使用 logService */
export const auditService = logService;

// ─── Agent 事件协议 v1（对齐 com.cy.orrery.protocol.event） ──

/** 任务产物分片（对齐 com.cy.orrery.protocol.dto.TaskInfo.Artifact.Part）。 */
export interface ArtifactPart {
  text?: string | null;
  data?: any;
  url?: string | null;
  mediaType?: string | null;
  filename?: string | null;
}

/** 任务产物（经 DomainData(kind=butler.artifact) 下发）。 */
export interface TaskArtifact {
  artifactId: string;
  name: string;
  description?: string;
  parts: ArtifactPart[];
}

/** 协议 v1 事件信封（Butler / 下游 Agent 统一线协议）。 */
export interface AgentEventEnvelope {
  type: string;
  channel: 'user' | 'debug' | string;
  runId: string;
  agentId?: string;
  traceId?: string;
  spanId?: string;
  seq: number;
  ts: number;
  terminal: boolean;
  data: any;
}

/** 协议 v1 通用运行结果（Final / RunFailed 携带）。 */
export interface RunResultData {
  stop: string;
  rounds: number;
  toolCalls: number;
  resumeToken?: string | null;
  ext?: any;
}

/**
 * Butler SSE 流式回调（Agent 事件协议 v1）。
 * 所有回调可选，未注册的事件被静默忽略；终态三件套（Final/RunFailed/Cancelled）必达一次。
 */
export interface ButlerStreamCallbacks {
  /** 任务创建领域事件（首帧）：taskId / contextId / sessionId 绑定。 */
  onTaskCreated?: (ext: { taskId: string; contextId: string; sessionId: string | null }) => void;
  /** 编排阶段推进（意图分析 / 路由决策 / 调用 Agent）。 */
  onStage?: (payload: { stage: string; title: string; detail?: string | null }) => void;
  /** 阶段进度。 */
  onProgress?: (payload: { phase: string; current: number; total: number; message?: string }) => void;
  /** 里程碑 / 软检查提示。 */
  onMilestone?: (payload: { kind: string; title: string; payload?: any }) => void;
  /** 澄清请求 / 等待补充输入。 */
  onClarification?: (payload: { question: string; suggestions?: string[]; kind?: string }) => void;
  /** 待人工审批（确认走 /butler/tasks/{taskId}/confirm）。 */
  onApprovalRequired?: (payload: { approvalId: string; summary: string; diff?: any }) => void;
  /** 业务错误（非终态）。 */
  onBusinessError?: (payload: { code: string; message: string; retryable: boolean }) => void;
  /** 步骤开始（一轮 LLM 调用）。 */
  onStepStarted?: (payload: { stepIndex: number }) => void;
  /** 步骤结束（正文相位结算点）。 */
  onStepFinished?: (payload: { stepIndex: number; hadToolCalls: boolean; terminalPhase: string }) => void;
  /** 流式块开始。 */
  onBlockStart?: (payload: { stepIndex: number; blockId: string; blockType: string; label?: string | null }) => void;
  /** 流式块增量（TEXT 块拼接即完整答复；REASONING 块为思考过程）。 */
  onBlockDelta?: (payload: { stepIndex: number; blockId: string; blockType: string; delta: string }) => void;
  /** 流式块结束。 */
  onBlockEnd?: (payload: { stepIndex: number; blockId: string; blockType: string }) => void;
  /** 心跳保活（无业务语义）。 */
  onHeartbeat?: (payload: { uptimeMs: number }) => void;
  /** 领域流式数据（butler.artifact 为任务产物）。 */
  onDomainData?: (payload: { kind: string; ext: any }) => void;
  /** 工具调用开始（调试频道）。 */
  onToolCallStart?: (payload: { callId: string; tool: string; arguments?: any; narration?: string }) => void;
  /** 工具调用结束（调试频道）。 */
  onToolCallEnd?: (payload: { callId: string; tool: string; success: boolean; result?: any; durationMs: number; error?: string }) => void;
  /** LLM 调用汇总（调试频道）。 */
  onLlmCall?: (payload: { callId: string; model: string; promptTokens: number; completionTokens: number; latencyMs: number; finishReason?: string }) => void;
  /** 系统追踪（调试频道）。 */
  onSystemTrace?: (payload: { category: string; message: string; meta?: any }) => void;
  /** 正常终态（stop=COMPLETED / INPUT_REQUIRED；ext 携带 sessionId/model/totalTokens/durationMs）。 */
  onFinal?: (result: RunResultData) => void;
  /** 失败终态。 */
  onRunFailed?: (payload: { code: string; message: string; retryable: boolean; result?: RunResultData }) => void;
  /** 取消终态。 */
  onCancelled?: (payload: { reason: string; phase?: string; resumeToken?: string | null }) => void;
  /** 未知事件类型兜底。 */
  onUnknown?: (envelope: AgentEventEnvelope) => void;
  /** 消费结束：终态事件到达（协议权威结束信号）或 SSE 流关闭，二者先到先触发。 */
  onClose?: () => void;
}

/** 按协议 v1 wire 名分发事件信封到回调。 */
function dispatchAgentEvent(env: AgentEventEnvelope, cb: ButlerStreamCallbacks) {
  const d = env.data ?? {};
  switch (env.type) {
    case 'DomainData':        cb.onDomainData?.(d); break;
    case 'StageChanged':      cb.onStage?.(d); break;
    case 'Progress':          cb.onProgress?.(d); break;
    case 'Milestone':         cb.onMilestone?.(d); break;
    case 'Clarification':     cb.onClarification?.(d); break;
    case 'ApprovalRequired':  cb.onApprovalRequired?.(d); break;
    case 'BusinessError':     cb.onBusinessError?.(d); break;
    case 'StepStarted':       cb.onStepStarted?.(d); break;
    case 'StepFinished':      cb.onStepFinished?.(d); break;
    case 'BlockStart':        cb.onBlockStart?.(d); break;
    case 'BlockDelta':        cb.onBlockDelta?.(d); break;
    case 'BlockEnd':          cb.onBlockEnd?.(d); break;
    case 'Heartbeat':         cb.onHeartbeat?.(d); break;
    case 'ToolCallStart':     cb.onToolCallStart?.(d); break;
    case 'ToolCallEnd':       cb.onToolCallEnd?.(d); break;
    case 'LlmCall':           cb.onLlmCall?.(d); break;
    case 'SystemTrace':       cb.onSystemTrace?.(d); break;
    case 'Final':             cb.onFinal?.(d.result ?? {}); break;
    case 'RunFailed':         cb.onRunFailed?.(d); break;
    case 'Cancelled':         cb.onCancelled?.(d); break;
    default:                  cb.onUnknown?.(env); break;
  }
}

/**
 * 向 Butler 发起协议 v1 SSE 流式调用（POST /butler/invoke 或 /butler/invoke/{agentId}）。
 * 事件为 Agent 事件协议 v1 信封（type/channel/runId/seq/ts/terminal/data），
 * 终态三件套（Final / RunFailed / Cancelled）必达一次。
 *
 * 协议规定终态一等化：信封 terminal=true 即为运行的权威结束信号，消费者据此干净收束，
 * 不依赖「SSE 流被动关闭」这一传输层信号——收到任一终态事件后本函数立即取消底层流并返回，
 * 不再等待服务端关连接（服务端保证终态后不再下发事件）。
 */
export const invokeButlerStream = async (
  message: string,
  sessionId: string | null,
  agentId: string | null,
  callbacks: ButlerStreamCallbacks,
  signal?: AbortSignal,
  approvalMode?: string | null,
  images?: string[]
) => {
  const token = localStorage.getItem('token');
  const url = `${GATEWAY_BASE}${B}/butler/invoke${agentId ? '/' + encodeURIComponent(agentId) : ''}`;

  const body: any = { message, streaming: true };
  if (sessionId) body.sessionId = sessionId;
  if (approvalMode) body.approvalMode = approvalMode;
  if (images && images.length > 0) body.images = images;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': token || '',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error: any) {
    if (error?.name !== 'AbortError') throw error;
    return;
  }

  if (!response.body) throw new Error('ReadableStream not supported');
  await consumeAgentEventStream(response, callbacks, signal);
};

/**
 * 订阅任务事件流（GET /butler/tasks/{taskId}/stream）。
 * 确认 / 审批后的后台续跑没有原调用流，前端经此通道接收
 * 节点进度 / 文件产物 / 人工门挂起 / 终态事件（协议 v1 信封，与调用流同构）。
 * 终态事件到达即收束；流异常关闭时 onClose 触发，调用方可回退轮询。
 */
export const subscribeTaskEvents = async (
  taskId: string,
  callbacks: ButlerStreamCallbacks,
  signal?: AbortSignal
) => {
  const token = localStorage.getItem('token');
  const url = `${GATEWAY_BASE}${B}/butler/tasks/${encodeURIComponent(taskId)}/stream`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Accept': 'text/event-stream', 'Authorization': token || '' },
      signal,
    });
  } catch (error: any) {
    if (error?.name !== 'AbortError') throw error;
    return;
  }
  await consumeAgentEventStream(response, callbacks, signal);
};

/** 消费协议 v1 SSE 事件流（调用流与任务事件订阅流共用的读取 / 分发循环）。 */
const consumeAgentEventStream = async (
  response: Response,
  callbacks: ButlerStreamCallbacks,
  signal?: AbortSignal
) => {
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      msg = err?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (!response.body) throw new Error('ReadableStream not supported');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  /** 解析单个 SSE 事件块；返回是否为终态事件（terminal=true，收到即收束）。 */
  const parseBlock = (block: string): boolean => {
    let dataStr = '';
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('data:')) dataStr += (dataStr ? '\n' : '') + line.slice(5).trim();
    }
    if (!dataStr) return false;
    try {
      const env = JSON.parse(dataStr) as AgentEventEnvelope;
      if (!env || typeof env.type !== 'string') return false;
      if (env.type === 'DomainData' && env.data?.kind === 'butler.task.created') {
        callbacks.onTaskCreated?.(env.data.ext ?? {});
      }
      dispatchAgentEvent(env, callbacks);
      // 防御：个别中继可能丢失 terminal 标志，终态三件套的 type 一律视为结束信号
      return env.terminal === true
        || env.type === 'Final' || env.type === 'RunFailed' || env.type === 'Cancelled';
    } catch (e) {
      console.warn('Butler v1 SSE parse error:', e, dataStr);
      return false;
    }
  };

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) parseBlock(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      let terminalSeen = false;
      for (const block of blocks) {
        if (block.trim() && parseBlock(block)) {
          terminalSeen = true;
          break;
        }
      }
      if (terminalSeen) {
        // 终态已达：立即释放底层连接，不等待服务端关闭（协议 terminal=true 为权威结束信号）
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    callbacks.onClose?.();
  }
};

// ─── Butler 会话管理（cy-common-starter-conversation，由 butler 服务承载） ──

/** 会话（对齐 com.cy.conversation.session.entity.ConversationSession）。 */
export interface ButlerSession {
  id: string;
  title: string;
  status: number;
  namingStatus: number;
  messageCount?: number;
  createTime?: number;
  updateTime?: number;
}

/** 会话消息（对齐 com.cy.conversation.message.entity.ChatMessage）。 */
export interface ButlerChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  /** 附件列表（JSON 数组字符串，元素为图片 data URI / URL；仅用户消息可携带） */
  attachments?: string | null;
  reasoningContent?: string;
  tokens?: number;
  model?: string;
  durationMs?: number;
  createTime?: number;
}

export const conversationService = {
  /** 查询当前用户全部会话 */
  listSessions: async (): Promise<ButlerSession[]> => {
    const res = await get(`${B}/conversation/session/list`);
    return res.data?.data ?? [];
  },

  /** 重命名会话（2-50 字符） */
  updateSession: async (id: string, title: string): Promise<boolean> => {
    const res = await post(`${B}/conversation/session/update`, { id, title });
    return res.data?.data ?? false;
  },

  /** 删除会话 */
  deleteSession: async (id: string): Promise<boolean> => {
    const res = await post(`${B}/conversation/session/delete`, null, { params: { id } });
    return res.data?.data ?? false;
  },

  /** 查询会话历史消息（时间正序） */
  listMessages: async (sessionId: string): Promise<ButlerChatMessage[]> => {
    const res = await get(`${B}/conversation/message/list`, { params: { sessionId } });
    return res.data?.data ?? [];
  },
};

// ─── Scenario Agent (new /agent/* endpoints) ────────────────
// 对接后端 com.cy.scenario.agent.controller.AgentController，事件协议详见
// scenario-agent/docs/simulation-platform-streaming-integration.md。

/** Agent SSE 事件公共字段。 */
export interface AgentEventBase {
  runId?: string;
  seq?: number;
  timestampMs?: number;
  channel?: 'user' | 'debug' | string;
}

/** SSE 事件分发回调；所有字段均可选，未注册的事件会被静默忽略。 */
export interface AgentStreamCallbacks {
  /** 收到首批事件后回填 runId，便于断线续传。 */
  onRunId?: (runId: string) => void;
  /** 监听 seq 更新，前端用于断线续传时的 Last-Event-ID。 */
  onSeq?: (seq: number) => void;
  // 用户频道
  onThinking?: (text: string, ev: AgentEventBase) => void;
  onProgress?: (
    payload: { phase?: string; current?: number; total?: number; message?: string } & AgentEventBase
  ) => void;
  onMilestone?: (
    payload: { kind?: string; title?: string; payload?: any } & AgentEventBase
  ) => void;
  onClarification?: (
    payload: { question?: string; suggestions?: string[] } & AgentEventBase
  ) => void;
  onApprovalRequired?: (
    payload: { approvalId: string; summary?: string; diff?: any } & AgentEventBase
  ) => void;
  onBusinessError?: (
    payload: { code?: string; message?: string; retryable?: boolean } & AgentEventBase
  ) => void;
  onStateChanged?: (
    payload: { version?: number; diff?: any } & AgentEventBase
  ) => void;
  onFinal?: (
    payload: { summary?: string; result?: any } & AgentEventBase
  ) => void;
  // 调试频道
  onToolCallStart?: (
    payload: { callId?: string; tool?: string; arguments?: any; narration?: string } & AgentEventBase
  ) => void;
  onToolCallEnd?: (
    payload: {
      callId?: string; tool?: string; success?: boolean; result?: any;
      durationMs?: number; error?: string;
    } & AgentEventBase
  ) => void;
  onLlmCall?: (
    payload: {
      callId?: string; model?: string; promptTokens?: number;
      completionTokens?: number; latencyMs?: number;
    } & AgentEventBase
  ) => void;
  onSystemTrace?: (
    payload: { category?: string; message?: string; meta?: any } & AgentEventBase
  ) => void;
  /** 兜底事件钩子，便于自定义事件类型扩展或调试输出。 */
  onUnknown?: (eventType: string, data: any) => void;
  /** SSE 流自然结束（reader.done）。 */
  onClose?: () => void;
}

/** ChatHistoryMessage：对应后端 com.cy.scenario.agent.dto.ChatHistoryMessage */
export interface ChatHistoryMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type?: string;
    name?: string;
    arguments?: string;
  }>;
}

export interface AgentChatRequest {
  taskId: string;
  scenarioId?: string;
  userId?: string;
  libraryId?: string;
  message?: string;
  messages?: ChatHistoryMessage[];
  useLocalMemory?: boolean | null;
  model?: string;
  debug?: 'off' | 'minimal' | 'verbose' | 'trace' | string;
}

export interface AgentInitRequest {
  taskId?: string;
  libraryId?: string;
  equipmentList: EquipmentInfo[];
}

/** 内部工具：把 SSE 文本流按事件块解析后分发到回调。 */
async function consumeAgentSse(
  response: Response,
  callbacks: AgentStreamCallbacks,
  signal?: AbortSignal
) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('ReadableStream not supported');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatch = (eventType: string, dataStr: string, eventId: string | null) => {
    if (eventId) {
      const idNum = parseInt(eventId, 10);
      if (!isNaN(idNum)) callbacks.onSeq?.(idNum);
    }
    if (!dataStr) return;
    let data: any;
    try {
      data = JSON.parse(dataStr);
    } catch (e) {
      console.warn('Agent SSE parse error:', e, dataStr);
      return;
    }
    if (data?.runId) callbacks.onRunId?.(data.runId);
    if (typeof data?.seq === 'number') callbacks.onSeq?.(data.seq);

    switch (eventType) {
      case 'Thinking':            callbacks.onThinking?.(data.text ?? '', data); break;
      case 'Progress':            callbacks.onProgress?.(data); break;
      case 'Milestone':           callbacks.onMilestone?.(data); break;
      case 'Clarification':       callbacks.onClarification?.(data); break;
      case 'ApprovalRequired':    callbacks.onApprovalRequired?.(data); break;
      case 'BusinessError':       callbacks.onBusinessError?.(data); break;
      case 'StateChanged':        callbacks.onStateChanged?.(data); break;
      case 'Final':               callbacks.onFinal?.(data); break;
      case 'ToolCallStart':       callbacks.onToolCallStart?.(data); break;
      case 'ToolCallEnd':         callbacks.onToolCallEnd?.(data); break;
      case 'LlmCall':             callbacks.onLlmCall?.(data); break;
      case 'SystemTrace':         callbacks.onSystemTrace?.(data); break;
      case 'TokenDelta':
      case 'RawLlmChunk':
        // verbose / trace 调试事件，默认不渲染，留给上层按需消费
        callbacks.onUnknown?.(eventType, data);
        break;
      default:
        callbacks.onUnknown?.(eventType, data);
        break;
    }
  };

  const parseBlock = (block: string) => {
    let eventType = 'message';
    let dataLines: string[] = [];
    let eventId: string | null = null;
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      else if (line.startsWith('id:'))  eventId   = line.slice(3).trim();
    }
    dispatch(eventType, dataLines.join('\n'), eventId);
  };

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) parseBlock(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (block.trim()) parseBlock(block);
      }
    }
  } finally {
    callbacks.onClose?.();
  }
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: token } : {};
}

export const agentService = {
  /**
   * 拉取后端 scenario-agent 内置的示例装备库（static/equipment.json）。
   * 仿真平台对接时应替换为平台自己的装备库来源。
   */
  fetchSampleEquipment: async (): Promise<EquipmentInfo[]> => {
    const res = await fetch(`${GATEWAY_BASE}${SC}/equipment.json`, {
      method: 'GET',
      headers: { ...authHeader() },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (Array.isArray(json)) return json as EquipmentInfo[];
    if (Array.isArray(json?.data)) return json.data as EquipmentInfo[];
    throw new Error('equipment.json 格式异常：顶层既不是数组也不是 {data: [...]}');
  },

  /**
   * 初始化装备库上下文（POST /agent/init）。
   * taskId 与 libraryId 至少传一个；两者同时传则两份缓存都写入。
   */
  initEquipment: async (req: AgentInitRequest): Promise<{ equipmentCount: number; taskId?: string; libraryId?: string }> => {
    const res = await post(`${SC}/agent/init`, req);
    return res.data?.data ?? { equipmentCount: req.equipmentList?.length ?? 0 };
  },

  /** 导出当前任务的 scenario.json（GET /agent/export/{taskId}）。 */
  exportScenario: async (taskId: string): Promise<any[]> => {
    const res = await get(`${SC}/agent/export/${encodeURIComponent(taskId)}`);
    const raw = res.data?.data;
    if (raw == null || raw === '') return [];
    let parsed: any = raw;
    // 后端 R<String> 把数组序列化成 JSON 字符串，可能存在二次序列化，最多反序列化两层。
    for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
      try { parsed = JSON.parse(parsed); } catch { return []; }
    }
    return Array.isArray(parsed) ? parsed : [];
  },

  /** 重置任务（DELETE /agent/reset/{taskId}）。 */
  resetTask: async (taskId: string): Promise<void> => {
    await del(`${SC}/agent/reset/${encodeURIComponent(taskId)}`);
  },

  /** 审批决策（POST /agent/approve/{approvalId}）。 */
  approveDecision: async (
    approvalId: string,
    decision: 'approve' | 'reject',
    userId?: string
  ): Promise<Record<string, any>> => {
    const res = await post(
      `${SC}/agent/approve/${encodeURIComponent(approvalId)}`,
      { decision, userId }
    );
    return res.data?.data ?? {};
  },

  /**
   * 发起 SSE 流式对话（POST /agent/chat/stream）。
   * 事件类型详见 AgentStreamCallbacks。
   */
  streamChat: async (
    request: AgentChatRequest,
    callbacks: AgentStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> => {
    const response = await fetch(`${GATEWAY_BASE}${SC}/agent/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...authHeader(),
      },
      body: JSON.stringify(request),
      signal,
    });
    await consumeAgentSse(response, callbacks, signal);
  },

  /**
   * SSE 断点续传（GET /agent/chat/stream/{runId}/resume）。
   * 当 chat/stream 中途断开时，使用上次收到的最大 seq 续订。
   */
  resumeStream: async (
    runId: string,
    sinceSeq: number,
    debug: string | undefined,
    callbacks: AgentStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> => {
    const params = new URLSearchParams();
    if (sinceSeq > 0) params.set('sinceSeq', String(sinceSeq));
    if (debug)       params.set('debug', debug);
    const qs = params.toString();
    const url = `${GATEWAY_BASE}${SC}/agent/chat/stream/${encodeURIComponent(runId)}/resume`
      + (qs ? `?${qs}` : '');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        // Last-Event-ID 是 SSE 续传标准头，后端优先级高于 sinceSeq
        ...(sinceSeq > 0 ? { 'Last-Event-ID': String(sinceSeq) } : {}),
        ...authHeader(),
      },
      signal,
    });
    await consumeAgentSse(response, callbacks, signal);
  },
};

