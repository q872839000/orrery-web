
import { get, put, del } from './request';
import config from '../config';

const B = config.SERVICE_BUTLER; // orrery-butler-service

// ─── 类型定义（对齐 orrery-memory 当前模型；枚举按 name 序列化，均为大写） ──

/** 记忆归属范围。 */
export interface MemoryScope {
  type: 'SESSION' | 'USER' | 'AGENT' | 'TENANT';
  ownerId: string;
  tenantId?: string | null;
}

/** 记忆溯源。 */
export interface Provenance {
  actorId?: string | null;
  sourceRef?: string | null;
  reason?: string | null;
  /** true = 用户/Agent 显式要求记住；false = 巩固通道推断 */
  explicit?: boolean;
}

/** 画像条目（一条画像 = 一个维度的一个值）。 */
export interface ProfileItem {
  itemId: string;
  ownerType: 'USER' | 'AGENT';
  ownerId: string;
  tenantId?: string | null;
  /** 维度 key（消费方注册）。 */
  dimension: string;
  value: string;
  /** true = 行为推断；false = 显式陈述。 */
  inferred: boolean;
  /** 证据（对话原文依据）。 */
  evidence?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'INVALIDATED';
  version: number;
  /** ISO-8601 时间串。 */
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 长期记忆条目（L2 语义记忆本体）。 */
export interface MemoryItem {
  memoryId: string;
  scope: MemoryScope;
  kind: 'FACT' | 'PREFERENCE' | 'EXPERIENCE' | 'EPISODE';
  /** 一句话索引（≤50 字，随正文更正同步重派生）。 */
  abstractText?: string | null;
  content: string;
  /** 来源指针（sessionId#runId）。 */
  sourceRef?: string | null;
  importance: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'INVALIDATED';
  version: number;
  accessCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastAccessedAt?: string | null;
  provenance?: Provenance | null;
}

/** 记忆审计修订。 */
export interface MemoryRevision {
  revisionId: string;
  memoryId: string;
  op: 'CREATE' | 'UPDATE' | 'SUPERSEDE' | 'INVALIDATE' | 'ERASE' | 'PURGE';
  beforeJson?: string | null;
  afterJson?: string | null;
  actorId?: string | null;
  reason?: string | null;
  at?: string | null;
}

/** 画像维度定义（消费方注册）。 */
export interface ProfileDimension {
  key: string;
  label: string;
  extractionHint?: string | null;
  multiValue: boolean;
  maxItems: number;
}

/** 记忆总览（后端 record：画像条目全状态 + 用户级长期记忆全状态）。 */
export interface MemoryOverview {
  profileItems?: ProfileItem[];
  userFacts?: MemoryItem[];
}

// ─── API（经网关 → orrery-butler-service） ────────────────

export const memoryService = {
  /** 记忆总览（当前登录用户，画像/长期记忆均全状态） */
  getOverview: () => get(`${B}/butler/memory/overview`),

  /** 已注册画像维度（label 渲染分组用） */
  getDimensions: () => get(`${B}/butler/memory/dimensions`),

  /** 画像条目谱系（同维度全状态流转记录，时间升序） */
  getItemHistory: (itemId: string) =>
    get(`${B}/butler/memory/items/${itemId}/history`),

  /** 编辑画像条目（旧条目作废，新条目显式生效） */
  editItem: (itemId: string, value: string) =>
    put(`${B}/butler/memory/items/${itemId}`, { value }),

  /** 画像条目作废（保留谱系） */
  retireItem: (itemId: string, reason?: string) =>
    del(`${B}/butler/memory/items/${itemId}`, { params: { reason } }),

  /** 长期记忆审计链 */
  getFactHistory: (memoryId: string) =>
    get(`${B}/butler/memory/facts/${memoryId}/history`),

  /** 更正长期记忆正文（索引随正文自动重派生） */
  correctFact: (memoryId: string, content: string) =>
    put(`${B}/butler/memory/facts/${memoryId}`, { content }),

  /** 作废长期记忆（保留审计链） */
  invalidateFact: (memoryId: string, reason?: string) =>
    del(`${B}/butler/memory/facts/${memoryId}`, { params: { reason } }),
};
