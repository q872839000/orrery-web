/**
 * 本体管理接口（/cy-knowledge-repository/knowledge/ontology）。图纸而非大楼：JSON 定义 + 版本化。
 */
import { get, post, put } from '../request';
import type { Ontology, OntologyOverview, OntologyVersion } from '../../types/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

export const ontologyService = {
  /** 读取本体（ACTIVE 与 DRAFT 并列；无则空 + 引导文案） */
  overview: (appId: string) =>
    get('/cy-knowledge-repository/knowledge/ontology', { params: { appId } }).then(res => unwrap<OntologyOverview>(res)),

  /** 保存草稿（DRAFT 不影响线上） */
  saveDraft: (appId: string, draft: Omit<Ontology, 'id' | 'version' | 'status' | 'updateTime'>) =>
    put('/cy-knowledge-repository/knowledge/ontology/draft', draft, { params: { appId } }).then(res => unwrap<Ontology>(res)),

  /** 发布（校验 → 版本+1 → 历史留痕） */
  publish: (appId: string, changeNote?: string) =>
    post('/cy-knowledge-repository/knowledge/ontology:publish', { changeNote }, { params: { appId } }).then(res => unwrap<number>(res)),

  /** 版本历史 */
  versions: (appId: string) =>
    get('/cy-knowledge-repository/knowledge/ontology/versions', { params: { appId } }).then(res => unwrap<OntologyVersion[]>(res)),

  /** LLM 草拟（抽样文档 → 建议类型体系 → DRAFT） */
  suggest: (appId: string) =>
    post('/cy-knowledge-repository/knowledge/ontology:suggest', null, { params: { appId } }).then(res => unwrap<Ontology>(res)),
};
