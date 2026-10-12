/**
 * 统一检索接口（POST /cy-knowledge-repository/knowledge/search，四模式）。
 */
import { post } from '../request';
import type { KnowledgeSearchRequest, KnowledgeSearchResult } from '../../types/knowledge';

export const knowledgeSearchService = {
  /** 混合检索（可见集前置过滤由后端处理） */
  search: (req: KnowledgeSearchRequest) =>
    post('/cy-knowledge-repository/knowledge/search', req).then(res => res.data.data as KnowledgeSearchResult),
};
