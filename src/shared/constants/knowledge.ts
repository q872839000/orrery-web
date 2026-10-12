/**
 * 知识库域常量与枚举元数据（与 cy-knowledge-repository 后端枚举一一对应）。
 * 页面只引用这里的定义，禁止在组件内散落状态码/通道名等魔法值。
 */

// ───────────────────────── 文档处理状态（knowledge_docs.process_status 数字码） ─────────────────────────

export enum DocProcessStatus {
  PENDING = 0,
  PARSING = 1,
  CHUNKING = 2,
  VECTORIZING = 3,
  GRAPHING = 4,
  COMPLETED = 5,
  FAILED = 6,
  REINDEXING = 7,
}

export interface DocStatusMeta {
  label: string;
  /** Badge 色调（对应 ui/Badge 的 tone） */
  tone: 'neutral' | 'info' | 'success' | 'error' | 'warning';
  /** 终态（COMPLETED / FAILED） */
  terminal: boolean;
  /** 处理中（需要进度跟踪） */
  active: boolean;
}

export const DOC_STATUS_META: Record<DocProcessStatus, DocStatusMeta> = {
  [DocProcessStatus.PENDING]:    { label: '待处理',     tone: 'neutral', terminal: false, active: true },
  [DocProcessStatus.PARSING]:    { label: '解析中',     tone: 'info',    terminal: false, active: true },
  [DocProcessStatus.CHUNKING]:   { label: '分块中',     tone: 'info',    terminal: false, active: true },
  [DocProcessStatus.VECTORIZING]:{ label: '向量化中',   tone: 'info',    terminal: false, active: true },
  [DocProcessStatus.GRAPHING]:   { label: '图谱抽取中', tone: 'info',    terminal: false, active: true },
  [DocProcessStatus.COMPLETED]:  { label: '已完成',     tone: 'success', terminal: true,  active: false },
  [DocProcessStatus.FAILED]:     { label: '失败',       tone: 'error',   terminal: true,  active: false },
  [DocProcessStatus.REINDEXING]: { label: '重建索引中', tone: 'warning', terminal: false, active: true },
};

/** 枚举名 → 状态码（兼容旧版后端把 processStatus 序列化为枚举名的 wire 形态） */
const DOC_STATUS_CODE_BY_NAME: Record<string, DocProcessStatus> = {
  PENDING: DocProcessStatus.PENDING,
  PARSING: DocProcessStatus.PARSING,
  CHUNKING: DocProcessStatus.CHUNKING,
  VECTORIZING: DocProcessStatus.VECTORIZING,
  GRAPHING: DocProcessStatus.GRAPHING,
  COMPLETED: DocProcessStatus.COMPLETED,
  FAILED: DocProcessStatus.FAILED,
  REINDEXING: DocProcessStatus.REINDEXING,
};

/** 状态码规整：数字直用；数字字符串/枚举名（旧后端 wire）转为码；其余兜底待处理 */
export const docStatusCode = (raw?: number | string | null): DocProcessStatus => {
  if (typeof raw === 'number' && DOC_STATUS_META[raw as DocProcessStatus]) return raw as DocProcessStatus;
  if (typeof raw === 'string') {
    if (raw in DOC_STATUS_CODE_BY_NAME) return DOC_STATUS_CODE_BY_NAME[raw];
    const n = Number(raw);
    if (Number.isInteger(n) && DOC_STATUS_META[n as DocProcessStatus]) return n as DocProcessStatus;
  }
  return DocProcessStatus.PENDING;
};

export const docStatusMeta = (code?: number | string | null): DocStatusMeta =>
  DOC_STATUS_META[docStatusCode(code)];

/** 处理阶段（与状态码正交的阶段标注） */
export const PROCESS_PHASE_LABELS: Record<string, string> = {
  QUEUED: '排队中',
  PARSING: '解析',
  CHUNKING: '分块',
  VECTORIZING: '向量化',
  GRAPHING: '图谱抽取',
};

/** 图谱抽取状态 */
export const GRAPH_STATUS_LABELS: Record<string, string> = {
  NONE: '未抽取',
  PARTIAL: '部分成功',
  COMPLETED: '抽取完成',
  FAILED: '失败',
};

// ───────────────────────── 检索模式 ─────────────────────────

export type SearchModel = 'HYBRID' | 'SEMANTIC' | 'KEYWORD' | 'GRAPH';

export const SEARCH_MODELS: { value: SearchModel; label: string; desc: string }[] = [
  { value: 'HYBRID',   label: '混合检索', desc: 'wiki/语义/关键词/图谱多路融合 + 精排（默认）' },
  { value: 'SEMANTIC', label: '语义检索', desc: '纯向量语义相似' },
  { value: 'KEYWORD',  label: '关键词检索', desc: '纯 BM25 关键词匹配' },
  { value: 'GRAPH',    label: '图谱检索', desc: '纯图谱关系扩展（调试用）' },
];

// ───────────────────────── 召回通道 ─────────────────────────

export type RecallChannel = 'wiki' | 'dense' | 'sparse' | 'graph';

export interface ChannelMeta {
  label: string;
  desc: string;
  /** Badge 色调 */
  tone: 'purple' | 'blue' | 'amber' | 'teal';
  defaultWeight: number;
}

export const CHANNEL_META: Record<RecallChannel, ChannelMeta> = {
  wiki:   { label: 'Wiki',   desc: '已整合的百科条目（权重最高）', tone: 'purple', defaultWeight: 1.2 },
  dense:  { label: '语义',   desc: '向量语义相似召回',            tone: 'blue',   defaultWeight: 1.0 },
  sparse: { label: '关键词', desc: 'BM25 关键词召回',             tone: 'amber',  defaultWeight: 0.8 },
  graph:  { label: '图谱',   desc: '实体关系扩展召回',            tone: 'teal',   defaultWeight: 0.6 },
};

export const CHANNEL_ORDER: RecallChannel[] = ['wiki', 'dense', 'sparse', 'graph'];

export const channelLabel = (ch: string): string =>
  (CHANNEL_META as Record<string, ChannelMeta>)[ch]?.label ?? ch;

// ───────────────────────── 引用形态 ─────────────────────────

export const REF_TYPE_LABELS: Record<string, string> = {
  chunk: '原文块',
  wikiEntry: 'Wiki 条目',
  graphPath: '图谱路径',
};

// ───────────────────────── 知识库可见性 ─────────────────────────

export type KnowledgeMode = 'PRIVATE' | 'TEAM' | 'PUBLIC';

export const KB_MODES: { value: KnowledgeMode; label: string; desc: string }[] = [
  { value: 'PRIVATE', label: '私有', desc: '仅属主可见' },
  { value: 'TEAM',    label: '团队', desc: '库内成员按角色访问' },
  { value: 'PUBLIC',  label: '公开', desc: '全员可读，写操作按角色' },
];

export const KB_MODE_LABELS: Record<string, string> = { PRIVATE: '私有', TEAM: '团队', PUBLIC: '公开' };

// ───────────────────────── 库内角色 ─────────────────────────

export type KnowledgeRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export const ROLE_RANK: Record<KnowledgeRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export const ROLE_LABELS: Record<KnowledgeRole, string> = { VIEWER: '只读', EDITOR: '编辑', OWNER: '所有者' };

/** 当前角色是否满足最低角色要求（与后端 KnowledgeRoleEnum.atLeast 一致） */
export const roleAtLeast = (role: KnowledgeRole | null | undefined, min: KnowledgeRole): boolean =>
  !!role && ROLE_RANK[role] >= ROLE_RANK[min];

// ───────────────────────── 分块类型 ─────────────────────────

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  table: '表格',
  'image-caption': '图注',
  formula: '公式',
};

// ───────────────────────── Wiki 条目类型 ─────────────────────────

export const WIKI_PAGE_TYPE_LABELS: Record<string, string> = {
  ENTITY: '实体条目',
  TOPIC: '主题条目',
  DOC: '文档页',
  KB_HOME: '主页',
};

// ───────────────────────── 分页缺省 ─────────────────────────

export const KNOWLEDGE_PAGE_SIZE = 20;

/** 对话缺省召回条数（与后端 chat.recall-top-k 对齐） */
export const CHAT_DEFAULT_TOP_K = 6;
