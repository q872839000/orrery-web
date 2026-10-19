/**
 * 大模型目录与共享注册管理接口
 * <p>
 * - aiCatalogService：各服务自有的 GET /ai/catalog（前端模型选择器数据源，按服务前缀取）；
 * - llmProviderAdminService：admin-service 的共享注册 CRUD（Nacos 远程层，全平台热生效）；
 * - conversationModelApi：会话级模型偏好（cy-common-starter-conversation，按承载服务前缀取）。
 */
import { get, post, put, del } from './request';
import config from '../config';

const unwrap = <T>(res: any): T => res.data.data as T;

// ─── 模型目录（GET {service}/ai/catalog） ─────────────────────

/** 单个 provider 的目录项（能力以对应模型字段非空表达）。 */
export interface AiProviderItem {
  name: string;
  defaultProvider: boolean;
  chatModel?: string | null;
  /** chat 模型是否具备视觉（图片输入）能力（前端据此开放 / 隐藏图片输入入口） */
  chatVision?: boolean;
  /** chat 模型是否支持思考控制（provider 已声明思考控制协议；前端据此显示思考开关） */
  chatThinking?: boolean;
  /** 思考控制是否支持强度档位（true = 低/中/高档位；false = 仅开/关二元控制） */
  chatThinkingEffort?: boolean;
  /** 强制思考模型子集（如 GLM-5.3 系列；选中这些模型时「关闭思考」档禁用） */
  chatForcedModels?: string[];
  /** 可用对话模型清单（选择器按 provider 分组用；空 = 仅默认模型） */
  chatModels?: string[];
  embeddingModel?: string | null;
  rerankModel?: string | null;
}

/** 模型目录（当前服务可用 provider 及能力清单）。 */
export interface AiCatalogVO {
  defaultProvider?: string | null;
  providers: AiProviderItem[];
}

/** 目录按服务前缀缓存（30s TTL——管理页新增后各页很快可见；热更新无推送通道，短 TTL 折中）。 */
const CATALOG_TTL_MS = 30_000;
const catalogCache = new Map<string, { at: number; promise: Promise<AiCatalogVO> }>();

export const aiCatalogService = {
  /** 查询指定服务的模型目录（Promise 级缓存去重 + 30s TTL）。 */
  catalog: (servicePrefix: string): Promise<AiCatalogVO> => {
    const cached = catalogCache.get(servicePrefix);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) {
      return cached.promise;
    }
    const promise = get(`/${servicePrefix}/ai/catalog`).then(res => unwrap<AiCatalogVO>(res));
    catalogCache.set(servicePrefix, { at: Date.now(), promise });
    // 失败不缓存，下次调用重试
    promise.catch(() => catalogCache.delete(servicePrefix));
    return promise;
  },

  /** 主动失效指定服务的目录缓存（管理页变更后调用）。 */
  invalidate: (servicePrefix?: string) => {
    if (servicePrefix) catalogCache.delete(servicePrefix);
    else catalogCache.clear();
  },
};

// ─── 会话级模型偏好（按承载服务前缀路由） ─────────────────────

/** 会话模型偏好（ConversationSession 的 llmProvider/llmModel/thinkingPref 字段）。 */
export interface SessionModelPreference {
  llmProvider?: string | null;
  llmModel?: string | null;
  /** 思考偏好（off/on/low/medium/high；null = 跟随 provider 全局配置） */
  thinkingPref?: string | null;
}

export const conversationModelApi = {
  /** 读取会话模型偏好（无偏好返回 null 字段）。 */
  getPreference: async (servicePrefix: string, sessionId: string): Promise<SessionModelPreference> => {
    const res = await get(`/${servicePrefix}/conversation/session/get`, { params: { id: sessionId } });
    const session = unwrap<any>(res) ?? {};
    return {
      llmProvider: session.llmProvider ?? null,
      llmModel: session.llmModel ?? null,
      thinkingPref: session.thinkingPref ?? null,
    };
  },

  /** 更新会话模型偏好（null = 清除覆盖、跟随平台默认）。 */
  updatePreference: (servicePrefix: string, sessionId: string, provider: string | null,
                     model: string | null, thinkingPref?: string | null) =>
    // 会话 ID 必须按字符串提交：雪花 ID 超出 JS Number 安全整数范围，
    // Number() 转换会丢精度导致后端查无此会话（ Jackson 会把数字字符串精确反序列化为 Long）
    post(`/${servicePrefix}/conversation/session/model`, {
      id: sessionId, llmProvider: provider, llmModel: model, thinkingPref: thinkingPref ?? null,
    }).then(res => unwrap<boolean>(res)),
};

// ─── 共享注册管理（admin-service /admin/llm-providers） ───────

const A = config.SERVICE_ADMIN;

/** 提供商视图（api-key 恒掩码）。 */
export interface LlmProviderVO {
  name: string;
  baseUrl?: string | null;
  apiKeyMasked?: string | null;
  apiVersion?: string | null;
  chatEnabled?: boolean;
  chatModel?: string | null;
  visionEnabled?: boolean;
  /** 思考控制模式（STANDARD_REASONING_EFFORT / GLM_THINKING_TYPE / QWEN_ENABLE_THINKING；null = 未配置） */
  thinkingControlMode?: string | null;
  chatModels?: string[];
  embeddingEnabled?: boolean;
  embeddingModel?: string | null;
  rerankEnabled?: boolean;
  rerankModel?: string | null;
  defaultProvider?: boolean;
}

/** 注册表全貌（默认提供商 + 角色路由 + 提供商列表）。 */
export interface LlmRegistryView {
  defaultProvider?: string | null;
  roles?: Record<string, string>;
  providers: LlmProviderVO[];
}

/** 提供商保存请求（编辑时 apiKey 留空 = 保持原值）。 */
export interface LlmProviderSaveRequest {
  name: string;
  baseUrl: string;
  apiKey?: string | null;
  apiVersion?: string | null;
  chatEnabled?: boolean;
  chatModel?: string | null;
  visionEnabled?: boolean;
  /** 思考控制模式（null/省略 = 不变更；'' = 清除；值为 ThinkingControlMode 枚举名） */
  thinkingControlMode?: string | null;
  chatModels?: string[];
  embeddingEnabled?: boolean;
  embeddingModel?: string | null;
  rerankEnabled?: boolean;
  rerankModel?: string | null;
}

/** 注册设置保存请求（null 字段不变更）。 */
export interface LlmRegistrySettingsRequest {
  defaultProvider?: string | null;
  roles?: Record<string, string> | null;
}

/** 测试连接结果。 */
export interface LlmTestConnectionVO {
  success: boolean;
  message?: string | null;
  latencyMs?: number | null;
}

export const llmProviderAdminService = {
  /** 注册表全貌。 */
  registry: () => get(`/${A}/admin/llm-providers`).then(res => unwrap<LlmRegistryView>(res)),

  /** 新增提供商。 */
  create: (req: LlmProviderSaveRequest) =>
    post(`/${A}/admin/llm-providers`, req).then(res => unwrap<boolean>(res)),

  /** 更新提供商（apiKey 留空保持原值；未管理字段服务端保留）。 */
  update: (name: string, req: LlmProviderSaveRequest) =>
    put(`/${A}/admin/llm-providers/${encodeURIComponent(name)}`, req).then(res => unwrap<boolean>(res)),

  /** 删除提供商（默认提供商不可删；角色引用自动清理）。 */
  remove: (name: string) =>
    del(`/${A}/admin/llm-providers/${encodeURIComponent(name)}`).then(res => unwrap<boolean>(res)),

  /** 更新注册设置（默认提供商 / 角色路由）。 */
  updateSettings: (req: LlmRegistrySettingsRequest) =>
    put(`/${A}/admin/llm-providers/settings`, req).then(res => unwrap<boolean>(res)),

  /** 测试连接（不落配置；embedding=true 时改测 /embeddings 端点）。 */
  testConnection: (req: {
    name?: string; baseUrl: string; apiKey?: string | null;
    apiVersion?: string | null; chatModel: string; embedding?: boolean;
  }) => post(`/${A}/admin/llm-providers/test`, req).then(res => unwrap<LlmTestConnectionVO>(res)),

  /** 拉取模型列表（OpenAI 兼容 GET /models，不落配置；apiKey 留空回退已存密钥）。 */
  listModels: (req: { name?: string; baseUrl: string; apiKey?: string | null; apiVersion?: string | null }) =>
    post(`/${A}/admin/llm-providers/models`, req).then(res => unwrap<string[]>(res)),
};
