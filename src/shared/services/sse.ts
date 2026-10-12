/**
 * 通用 fetch-SSE 消费器（POST/GET 均支持，带鉴权头与 AbortSignal）。
 * 知识库对话流与文档处理进度流共用此读取/分块/解析循环。
 * 路径须带服务 ID 前缀（经网关路由），与 request.ts 约定一致。
 */
import config from '../config';
import { GATEWAY_BASE } from './request';

export interface SseCallbacks<T> {
  /** 每解析出一条 data JSON 触发；返回 true 表示业务终态，立即收束 */
  onEvent: (data: T) => boolean | void;
  /** 流正常结束（含终态收束） */
  onClose?: () => void;
  /** 流异常（网络/HTTP 错误；主动 abort 不触发） */
  onError?: (error: Error) => void;
}

interface OpenSseOptions<T> {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  callbacks: SseCallbacks<T>;
}

/**
 * 打开一条 SSE 流并消费至结束。
 * 主动 abort 视为正常取消（不回调 onError）。
 */
export const openSse = async <T>(path: string, options: OpenSseOptions<T>): Promise<void> => {
  const { method = 'GET', body, signal, callbacks } = options;
  const token = localStorage.getItem(config.TOKEN_KEY);
  const url = path.startsWith('http') ? path : `${GATEWAY_BASE}${path.replace(/^\//, '')}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Accept': 'text/event-stream',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'Authorization': token || '',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    return;
  }

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      msg = err?.message || msg;
    } catch { /* 保留 HTTP 状态文案 */ }
    callbacks.onError?.(new Error(msg));
    return;
  }
  if (!response.body) {
    callbacks.onError?.(new Error('ReadableStream not supported'));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  /** 解析单个 SSE 事件块；返回是否业务终态 */
  const parseBlock = (block: string): boolean => {
    let dataStr = '';
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('data:')) dataStr += (dataStr ? '\n' : '') + line.slice(5).trim();
    }
    if (!dataStr) return false;
    try {
      const data = JSON.parse(dataStr) as T;
      return callbacks.onEvent(data) === true;
    } catch (e) {
      console.warn('SSE parse error:', e, dataStr);
      return false;
    }
  };

  try {
    while (true) {
      if (signal?.aborted) break;
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
      if (terminalSeen) break;
    }
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  callbacks.onClose?.();
};
