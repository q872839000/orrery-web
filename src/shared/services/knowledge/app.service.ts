/**
 * 知识库管理 / 成员管理接口（/cy-knowledge-repository/knowledge/apps）。
 * request 响应拦截器已拒业务错误，此处统一解包 R.data。
 */
import { get, post, put, del } from '../request';
import type {
  KnowledgeApp,
  KnowledgeAppCondition,
  KnowledgeMember,
  ModelConfigRequest,
  PageResult,
  RetrievalConfigRequest,
} from '../../types/knowledge';
import type { KnowledgeRole } from '../../constants/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

export const knowledgeAppService = {
  /** 可见知识库分页列表 */
  page: (condition: KnowledgeAppCondition) =>
    get('/cy-knowledge-repository/knowledge/apps', { params: condition }).then(res => unwrap<PageResult<KnowledgeApp>>(res)),

  /** 知识库详情（含当前用户库内角色 myRole） */
  detail: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/apps/${id}`).then(res => unwrap<KnowledgeApp>(res)),

  /** 新建知识库（建库者即 OWNER） */
  create: (app: { name: string; remark?: string; mode: string }) =>
    post('/cy-knowledge-repository/knowledge/apps', app).then(res => unwrap<KnowledgeApp>(res)),

  /** 编辑知识库（名称/描述/可见性） */
  update: (id: string, app: { name: string; remark?: string; mode: string }) =>
    put(`/cy-knowledge-repository/knowledge/apps/${id}`, app).then(res => unwrap<boolean>(res)),

  /** 召回策略配置（通道权重 + rerank 开关） */
  updateRetrieval: (id: string, req: RetrievalConfigRequest) =>
    put(`/cy-knowledge-repository/knowledge/apps/${id}:retrieval`, req).then(res => unwrap<boolean>(res)),

  /** 模型配置（对话/向量化模型选择；全量提交，null = 跟随全局；向量化维度库内有数据后锁定 21024） */
  updateModelConfig: (id: string, req: ModelConfigRequest) =>
    put(`/cy-knowledge-repository/knowledge/apps/${id}:model-config`, req).then(res => unwrap<boolean>(res)),

  /** 启停知识库 */
  toggle: (id: string) =>
    put(`/cy-knowledge-repository/knowledge/apps/${id}:toggle`).then(res => unwrap<boolean>(res)),

  /** 图谱开关（无本体开启=自由抽取，前端需提示质量风险） */
  toggleGraph: (id: string, enabled: boolean) =>
    put(`/cy-knowledge-repository/knowledge/apps/${id}:graph`, null, { params: { enabled } }).then(res => unwrap<boolean>(res)),

  /** 删除知识库（级联全部文档/本体/wiki/成员） */
  remove: (id: string) =>
    del(`/cy-knowledge-repository/knowledge/apps/${id}`).then(res => unwrap<boolean>(res)),

  // ── 成员管理 ──

  listMembers: (appId: string) =>
    get(`/cy-knowledge-repository/knowledge/apps/${appId}/members`).then(res => unwrap<KnowledgeMember[]>(res)),

  addMember: (appId: string, userId: string, role: KnowledgeRole) =>
    post(`/cy-knowledge-repository/knowledge/apps/${appId}/members`, { userId, role }).then(res => unwrap<boolean>(res)),

  changeMemberRole: (appId: string, userId: string, role: KnowledgeRole) =>
    put(`/cy-knowledge-repository/knowledge/apps/${appId}/members/${userId}`, { role }).then(res => unwrap<boolean>(res)),

  removeMember: (appId: string, userId: string) =>
    del(`/cy-knowledge-repository/knowledge/apps/${appId}/members/${userId}`).then(res => unwrap<boolean>(res)),
};
