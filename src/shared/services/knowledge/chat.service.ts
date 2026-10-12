/**
 * 知识库对话接口（SSE）+ 会话管理（conversation 组件托管端点）。
 * SSE 事件序列：citations（引用先行）→ content（答案片段，含 reasoningContent）→ done | error。
 */
import { get, post, put } from '../request';
import { openSse, type SseCallbacks } from '../sse';
import type {
  ChatHistoryMessage,
  ChatSession,
  ChatStreamEvent,
  KnowledgeChatRequest,
  PageResult,
} from '../../types/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

export const knowledgeChatService = {
  /**
   * 发起对话（POST SSE）。
   * done / error 事件视为业务终态自动收束；返回 AbortController 供停止生成。
   */
  chat: (req: KnowledgeChatRequest, callbacks: SseCallbacks<ChatStreamEvent>): AbortController => {
    const controller = new AbortController();
    openSse<ChatStreamEvent>('/cy-knowledge-repository/knowledge/chat/stream', {
      method: 'POST',
      body: req,
      signal: controller.signal,
      callbacks: {
        ...callbacks,
        onEvent: data => callbacks.onEvent(data) || data.type === 'done' || data.type === 'error',
      },
    });
    return controller;
  },

  /**
   * 断线重连（活跃流 replay 接续；无活跃流返回空，调用方按历史渲染）。
   */
  resume: (sessionId: string, callbacks: SseCallbacks<ChatStreamEvent>): AbortController => {
    const controller = new AbortController();
    openSse<ChatStreamEvent>(`/cy-knowledge-repository/knowledge/chat/stream/resume/${sessionId}`, {
      signal: controller.signal,
      callbacks: {
        ...callbacks,
        onEvent: data => callbacks.onEvent(data) || data.type === 'done' || data.type === 'error',
      },
    });
    return controller;
  },

  /** 历史消息（assistant 消息合并 citations 存档） */
  messages: (sessionId: string) =>
    get(`/cy-knowledge-repository/knowledge/chat/sessions/${sessionId}/messages`).then(res => unwrap<ChatHistoryMessage[]>(res)),

  /** 检索范围绑定（会话级默认知识库范围） */
  bindScope: (sessionId: string, knowledgeAppIds: string[]) =>
    put(`/cy-knowledge-repository/knowledge/chat/sessions/${sessionId}/scope`, { knowledgeAppIds }).then(res => unwrap<boolean>(res)),

  /** 检索范围读取 */
  getScope: (sessionId: string) =>
    get(`/cy-knowledge-repository/knowledge/chat/sessions/${sessionId}/scope`).then(res => unwrap<string[]>(res)),

  // ── 会话管理（conversation 组件端点，同属 8999 服务） ──

  /** 会话分页列表（当前用户） */
  pageSessions: (params: { page?: number; size?: number; title?: string }) =>
    get('/cy-knowledge-repository/conversation/session/page', { params }).then(res => unwrap<PageResult<ChatSession>>(res)),

  /** 会话重命名 */
  renameSession: (id: string, title: string) =>
    post('/cy-knowledge-repository/conversation/session/update', { id, title }).then(res => unwrap<boolean>(res)),

  /** 会话删除 */
  removeSession: (id: string) =>
    post('/cy-knowledge-repository/conversation/session/delete', null, { params: { id } }).then(res => unwrap<boolean>(res)),
};
