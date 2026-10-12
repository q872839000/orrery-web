/**
 * Wiki 百科接口（/cy-knowledge-repository/knowledge/wiki）。
 */
import { get, post } from '../request';
import type { WikiEntry, WikiTree, WikiVersion } from '../../types/knowledge';

const unwrap = <T>(res: any): T => res.data.data as T;

export const wikiService = {
  /** 导航树（本体层级；无本体按标题平铺；空树带引导文案） */
  tree: (appId: string) =>
    get('/cy-knowledge-repository/knowledge/wiki/tree', { params: { appId } }).then(res => unwrap<WikiTree>(res)),

  /** 条目详情（正文/版本/出处/互链） */
  entry: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/wiki/entries/${id}`).then(res => unwrap<WikiEntry>(res)),

  /** 版本历史 */
  history: (id: string) =>
    get(`/cy-knowledge-repository/knowledge/wiki/entries/${id}/history`).then(res => unwrap<WikiVersion[]>(res)),

  /** 历史正文（按版本取快照） */
  historyContent: (id: string, version: number) =>
    get(`/cy-knowledge-repository/knowledge/wiki/entries/${id}/history/${version}`).then(res => unwrap<WikiEntry>(res)),

  /** 手动重编译（EDITOR+） */
  recompile: (id: string) =>
    post(`/cy-knowledge-repository/knowledge/wiki/entries/${id}:recompile`).then(res => unwrap<boolean>(res)),
};
