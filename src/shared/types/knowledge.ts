/**
 * 知识库域类型（与 cy-knowledge-repository 后端 VO 一一对应）。
 * 后端主键经 @JsonSerialize(ToStringSerializer) 输出，前端 ID 一律 string。
 */
import type { DocProcessStatus, KnowledgeMode, KnowledgeRole, RecallChannel, SearchModel } from '../constants/knowledge';

// ───────────────────────── 通用 ─────────────────────────

/** MyBatis-Flex 分页结构（与 Page<T> 对齐） */
export interface PageResult<T> {
  records: T[];
  pageNumber: number;
  pageSize: number;
  totalRow: number;
  totalPage: number;
}

// ───────────────────────── 知识库 ─────────────────────────

/** 召回通道权重（RRF 融合权重） */
export interface ChannelWeights {
  wiki?: number;
  dense?: number;
  sparse?: number;
  graph?: number;
}

/** 知识库视图对象（KnowledgeAppVO） */
export interface KnowledgeApp {
  id: string;
  name: string;
  remark?: string;
  mode: KnowledgeMode;
  disabled?: boolean;
  channelWeights?: ChannelWeights;
  rerankEnabled?: boolean;
  graphEnabled?: boolean;
  chatProvider?: string | null;
  chatModel?: string | null;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  /** 向量化模型是否锁定（库内已有文档数据时 true，前端据此置灰） */
  embeddingLocked?: boolean;
  docCount?: number;
  myRole?: KnowledgeRole | null;
  createName?: string;
  createUser?: string;
  createTime?: number;
}

/** 知识库分页查询条件 */
export interface KnowledgeAppCondition {
  page?: number;
  size?: number;
  name?: string;
  mode?: KnowledgeMode;
}

/** 召回策略配置请求 */
export interface RetrievalConfigRequest {
  channelWeights: ChannelWeights;
  rerankEnabled: boolean;
}

/** 知识库模型配置请求（全量提交语义：null = 清除库级覆盖、跟随全局） */
export interface ModelConfigRequest {
  chatProvider?: string | null;
  chatModel?: string | null;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
}

// ───────────────────────── 成员 ─────────────────────────

/** 知识库成员（KnowledgeTeam 实体，userName 由服务端按用户缓存填充） */
export interface KnowledgeMember {
  id: string;
  knowledgeAppId: string;
  userId: string;
  role: KnowledgeRole;
  /** 成员用户名（服务端填充；缓存未命中时前端回退显示 userId） */
  userName?: string;
}

// ───────────────────────── 文档 ─────────────────────────

/** 知识文档（KnowledgeDocs 实体） */
export interface KnowledgeDoc {
  id: string;
  name: string;
  knowledgeId: string;
  fileKey?: string;
  sort?: number;
  /** 数字状态码，见 DocProcessStatus */
  processStatus: DocProcessStatus;
  processPhase?: string | null;
  totalChunks?: number;
  processedChunks?: number;
  errorMsg?: string | null;
  graphStatus?: 'NONE' | 'PARTIAL' | 'COMPLETED' | 'FAILED';
  processStartTime?: number | null;
  processEndTime?: number | null;
  createTime?: number;
}

/** 文档分页查询条件 */
export interface KnowledgeDocsCondition {
  page?: number;
  size?: number;
  knowledgeId?: string;
  processStatus?: DocProcessStatus;
  name?: string;
}

/** 文档处理进度（DocProgressVO，轮询与 SSE 同构） */
export interface DocProgress {
  docId: string;
  processStatus: DocProcessStatus;
  processStatusDesc?: string;
  phase?: string | null;
  processed?: number;
  total?: number;
  errorMsg?: string | null;
  graphStatus?: string;
  terminal?: boolean;
}

/** 文档分块（DocumentChunk 实体） */
export interface DocumentChunk {
  id: string;
  knowledgeAppId: string;
  docId: string;
  docName?: string;
  chapter?: string;
  chapterPath?: string;
  chunkText: string;
  chunkIndex: number;
  parentId?: string | null;
  isParent: boolean;
  startPos?: number;
  endPos?: number;
  overlapPrev?: number;
  overlapNext?: number;
  pageNo?: number;
  blockType?: string;
  /** 实体提及标注 JSON 字符串：[{name, type}] */
  entities?: string | null;
}

/** 分块实体提及（解析 entities JSON 后） */
export interface ChunkEntityMention {
  name: string;
  type?: string;
}

/** 批量操作结果（BatchOpResultVO） */
export interface BatchOpResult {
  successCount: number;
  failureCount: number;
  items: { docId: string; success: boolean; error?: string }[];
}

// ───────────────────────── 检索 ─────────────────────────

/** 检索请求（KnowledgeSearchRequest） */
export interface KnowledgeSearchRequest {
  query: string;
  knowledgeAppIds?: string[];
  model?: SearchModel;
  topK?: number;
  recallTopK?: number;
  rerank?: boolean;
  entityTypes?: string[];
  returnParent?: boolean;
}

/** 检索结果条目（KnowledgeSearchVO） */
export interface KnowledgeSearchItem {
  chunkId: string;
  docId: string;
  docName: string;
  knowledgeId: string;
  knowledgeName: string;
  score: number;
  content: string;
  parentContent?: string;
  chapterPath?: string;
  pageNo?: number;
  blockType?: string;
  entities?: string[];
  channels?: RecallChannel[];
  refType?: 'chunk' | 'wikiEntry' | 'graphPath';
}

/** 检索结果总包装（KnowledgeSearchResultVO） */
export interface KnowledgeSearchResult {
  results: KnowledgeSearchItem[];
  queryUsed?: string;
  effectiveKnowledgeIds?: string[];
  degradedChannels?: string[];
  suggestRelax?: boolean;
  took?: number;
}

// ───────────────────────── 对话 ─────────────────────────

/** 对话请求（KnowledgeChatRequest） */
export interface KnowledgeChatRequest {
  sessionId?: string;
  message: string;
  knowledgeAppIds?: string[];
  searchModel?: SearchModel;
  topK?: number;
}

/** 答案引用条目（CitationVO） */
export interface Citation {
  index: number;
  docId: string;
  docName: string;
  chunkId: string;
  knowledgeId: string;
  knowledgeName: string;
  pageNo?: number;
  chapterPath?: string;
  score?: number;
  refType?: 'chunk' | 'wikiEntry' | 'graphPath';
}

/** 对话 SSE 事件（KnowledgeChatStreamResponse） */
export interface ChatStreamEvent {
  type: 'citations' | 'content' | 'done' | 'error';
  content?: string;
  reasoningContent?: string;
  citations?: Citation[];
  sessionId?: string;
  messageId?: string;
  tokens?: number;
  firstTokenMs?: number;
  durationMs?: number;
  error?: string;
  status?: number;
}

/** 会话（conversation 组件 ConversationSession） */
export interface ChatSession {
  id: string;
  title: string;
  status?: number;
  messageCount?: number;
  createTime?: number;
  updateTime?: number;
}

/** 历史消息（/knowledge/chat/sessions/{id}/messages 返回的 Map 结构） */
export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string;
  tokens?: number;
  createTime?: number | null;
  citations?: Citation[];
}

// ───────────────────────── 本体 ─────────────────────────

export interface EntityTypeDef {
  name: string;
  parent?: string | null;
  description?: string;
  attributes?: string[];
}

export interface RelationTypeDef {
  name: string;
  sourceTypes?: string[];
  targetTypes?: string[];
  description?: string;
}

export interface SynonymRule {
  canonical: string;
  aliases: string[];
}

/** 本体定义（OntologyVO） */
export interface Ontology {
  id?: string;
  version?: number;
  status?: 'ACTIVE' | 'DRAFT';
  entityTypes: EntityTypeDef[];
  relationTypes: RelationTypeDef[];
  synonymRules?: SynonymRule[];
  autoMergeAliases?: boolean;
  updateTime?: number;
}

/** 本体读取响应（OntologyOverviewVO） */
export interface OntologyOverview {
  active?: Ontology | null;
  draft?: Ontology | null;
  configured: boolean;
  guidance?: string;
}

/** 本体版本历史条目 */
export interface OntologyVersion {
  version: number;
  changeNote?: string;
  affectedTypes?: string[];
  createTime?: number;
}

// ───────────────────────── Wiki ─────────────────────────

/** Wiki 条目摘要（导航树节点） */
export interface WikiPageBrief {
  id: string;
  title: string;
  pageType: string;
  refId: string;
  version: number;
  dirty: boolean;
  updateTime?: number;
}

/** Wiki 导航树（WikiTreeVO） */
export interface WikiTree {
  appId: string;
  hasOntology: boolean;
  groups: { label: string; pages: WikiPageBrief[] }[];
  guidance?: string;
}

/** Wiki 条目详情（WikiEntryVO） */
export interface WikiEntry {
  id: string;
  appId: string;
  pageType: string;
  refId: string;
  title: string;
  contentMd: string;
  version: number;
  dirty: boolean;
  links?: string[];
  sourceRefs?: { chunkId: string; docId: string; docName?: string; pageNo?: number }[];
  updateTime?: number;
}

/** Wiki 条目版本条目 */
export interface WikiVersion {
  version: number;
  createTime?: number;
}

// ───────────────────────── 图谱 ─────────────────────────

export interface GraphEntity {
  entityId: string;
  name: string;
  entityType?: string;
  aliases?: string[];
  summary?: string;
}

export interface GraphRelation {
  relationType: string;
  direction: 'out' | 'in';
  targetEntityId: string;
  targetName: string;
  targetType?: string;
  weight?: number;
  description?: string;
  sourceDocId?: string;
}

export interface GraphChunkRef {
  chunkId: string;
  docId: string;
  docName?: string;
  pageNo?: number;
  snippet?: string;
}

/** 实体详情（GraphEntityDetailVO） */
export interface GraphEntityDetail {
  entity: GraphEntity;
  properties?: Record<string, unknown>;
  relations?: GraphRelation[];
  sourceChunks?: GraphChunkRef[];
}

/** 可视化子图（GraphSubgraphVO） */
export interface GraphSubgraph {
  nodes: { id: string; name: string; type?: string }[];
  edges: {
    source: string;
    target: string;
    relation?: string;
    weight?: number;
    description?: string;
    sourceDocId?: string;
  }[];
}

/** 图谱统计（GraphStatsVO） */
export interface GraphStats {
  entityCount?: number;
  relationCount?: number;
  typeDistribution?: Record<string, number>;
  lastExtractTime?: number;
}
