/**
 * 知识文档管理接口（/cy-knowledge-repository/knowledge/docs）+ 进度 SSE 订阅。
 */
import { get, post, put, del } from '../request';
import { openSse, type SseCallbacks } from '../sse';
import type {
  BatchOpResult,
  DocProgress,
  DocumentChunk,
  KnowledgeDoc,
  KnowledgeDocsCondition,
  PageResult,
} from '../../types/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

/** axios 数组参数序列化为重复键（docIds=1&docIds=2），与 Spring @RequestParam List 绑定对齐 */
const repeatArrayParams = {
  paramsSerializer: {
    serialize: (params: Record<string, any>) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) value.forEach(v => search.append(key, String(v)));
        else if (value !== undefined && value !== null) search.append(key, String(value));
      });
      return search.toString();
    },
  },
};

export const knowledgeDocsService = {
  /** 文档分页列表（按库/状态/名称过滤） */
  page: (condition: KnowledgeDocsCondition) =>
    get('/cy-knowledge-repository/knowledge/docs', { params: condition }).then(res => unwrap<PageResult<KnowledgeDoc>>(res)),

  /** 文档详情（元数据 + 处理状态 + 错误信息） */
  detail: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/docs/${id}`).then(res => unwrap<KnowledgeDoc>(res)),

  /** 上传文档（multipart；异步摄入，返回待处理文档） */
  upload: (file: File, appId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return post('/cy-knowledge-repository/knowledge/docs', formData, { params: { appId } }).then(res => unwrap<KnowledgeDoc>(res));
  },

  /** 重命名（仅显示名） */
  rename: (id: string, name: string) =>
    put(`/cy-knowledge-repository/knowledge/docs/${id}:rename`, null, { params: { name } }).then(res => unwrap<boolean>(res)),

  /** 进度轮询 */
  progress: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/docs/${id}/progress`).then(res => unwrap<DocProgress>(res)),

  /** 失败重试 */
  retry: (id: string) =>
    post(`/cy-knowledge-repository/knowledge/docs/${id}:retry`).then(res => unwrap<boolean>(res)),

  /** 重灌（已完成 → 重建索引，引擎幂等） */
  reindex: (id: string) =>
    post(`/cy-knowledge-repository/knowledge/docs/${id}:reindex`).then(res => unwrap<boolean>(res)),

  /** 分块预览（父子块树/页码/实体提及） */
  chunks: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/docs/${id}/chunks`).then(res => unwrap<DocumentChunk[]>(res)),

  /** 删除文档（三段级联） */
  remove: (id: string) =>
    del(`/cy-knowledge-repository/knowledge/docs/${id}`).then(res => unwrap<boolean>(res)),

  /** 批量删除（逐文档明细返回） */
  removeBatch: (docIds: string[]) =>
    del('/cy-knowledge-repository/knowledge/docs:batch', { params: { docIds }, ...repeatArrayParams }).then(res => unwrap<BatchOpResult>(res)),

  /**
   * 订阅文档处理进度（SSE，终态服务端关流）。
   * 返回 AbortController 用于组件卸载时取消。
   */
  subscribeProgress: (id: string, callbacks: SseCallbacks<DocProgress>): AbortController => {
    const controller = new AbortController();
    openSse<DocProgress>(`/cy-knowledge-repository/knowledge/docs/${id}/progress:stream`, {
      signal: controller.signal,
      callbacks: {
        ...callbacks,
        // terminal=true 视为业务终态，立即收束
        onEvent: data => callbacks.onEvent(data) || data.terminal === true,
      },
    });
    return controller;
  },
};
