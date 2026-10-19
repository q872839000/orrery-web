/**
 * 图谱浏览接口（/cy-knowledge-repository/knowledge/graph，数据经引擎查询 Neo4j）。
 */
import { get } from '../request';
import type {
  GraphEntity,
  GraphEntityDetail,
  GraphStats,
  GraphSubgraph,
  PageResult,
} from '../../types/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

export const graphService = {
  /** 实体分页检索（类型过滤/名称模糊） */
  entities: (params: { appId: string; type?: string; q?: string; page?: number; size?: number }) =>
    get('/cy-knowledge-repository/knowledge/graph/entities', { params }).then(res => unwrap<PageResult<GraphEntity>>(res)),

  /** 实体详情（邻接关系 + 出处 chunks；appId 后端亦可从 entityId 解析，传入作权限校验） */
  entityDetail: (entityId: string, appId: string) =>
    get(`/cy-knowledge-repository/knowledge/graph/entities/${encodeURIComponent(entityId)}`, { params: { appId } }).then(res => unwrap<GraphEntityDetail>(res)),

  /** 可视化子图（nodes/edges，depth 默认 2 上限 3） */
  subgraph: (appId: string, entityId: string, depth: number) =>
    get('/cy-knowledge-repository/knowledge/graph/subgraph', { params: { appId, entityId, depth } }).then(res => unwrap<GraphSubgraph>(res)),

  /** 图谱统计（实体/关系数、类型分布、最近抽取时间；后端带 1min 缓存） */
  stats: (appId: string) =>
    get('/cy-knowledge-repository/knowledge/graph/stats', { params: { appId } }).then(res => unwrap<GraphStats>(res)),
};
