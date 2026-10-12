import React, { useCallback, useEffect, useState } from 'react';
import { Network, Search } from 'lucide-react';
import { graphService } from '../../../../shared/services/knowledge';
import type {
  GraphEntity, GraphEntityDetail, GraphStats, GraphSubgraph, KnowledgeApp,
} from '../../../../shared/types/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import Badge from '../../../../shared/components/ui/Badge';
import EmptyState from '../../../../shared/components/ui/EmptyState';
import Pagination from '../../../../shared/components/ui/Pagination';
import Spinner from '../../../../shared/components/ui/Spinner';
import Drawer from '../../../../shared/components/ui/Drawer';
import Select from '../../../../shared/components/ui/Select';
import { formatDateTime } from '../../../../shared/utils/date';
import SubgraphViewer from '../components/SubgraphViewer';
import ChunkPreviewDrawer from '../components/ChunkPreviewDrawer';

const PAGE_SIZE = 10;

interface GraphTabProps {
  app: KnowledgeApp;
}

/** 图谱浏览 tab：统计 + 实体检索 + 子图可视化 + 实体详情（出处回原文） */
const GraphTab: React.FC<GraphTabProps> = ({ app }) => {
  const toast = useToast();

  const [stats, setStats] = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ q: '', type: '', page: 1 });
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<GraphEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subgraph, setSubgraph] = useState<GraphSubgraph | null>(null);
  const [subgraphLoading, setSubgraphLoading] = useState(false);
  const [subgraphCenter, setSubgraphCenter] = useState<GraphEntity | null>(null);
  const [depth, setDepth] = useState(2);
  const [preview, setPreview] = useState<{ docId: string; docName?: string; chunkId?: string } | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await graphService.stats(app.id));
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [app.id]);

  const loadEntities = useCallback(async () => {
    setListLoading(true);
    try {
      const page = await graphService.entities({
        appId: app.id, q: query.q || undefined, type: query.type || undefined,
        page: query.page, size: PAGE_SIZE,
      });
      setEntities(page.records ?? []);
      setTotal(page.totalRow ?? 0);
    } catch (e: any) {
      toast.showError(e.message || '加载实体失败');
    } finally {
      setListLoading(false);
    }
  }, [app.id, query]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadEntities(); }, [loadEntities]);

  const openDetail = async (entityId: string) => {
    setDetailLoading(true);
    try {
      setDetail(await graphService.entityDetail(entityId));
    } catch (e: any) {
      toast.showError(e.message || '加载实体详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openSubgraph = async (entity: GraphEntity, d: number = depth) => {
    setSubgraphCenter(entity);
    setSubgraphLoading(true);
    try {
      setSubgraph(await graphService.subgraph(app.id, entity.entityId, d));
    } catch (e: any) {
      toast.showError(e.message || '加载子图失败');
      setSubgraph(null);
    } finally {
      setSubgraphLoading(false);
    }
  };

  const typeOptions = Object.keys(stats?.typeDistribution ?? {});
  const hasGraphData = (stats?.entityCount ?? 0) > 0 || entities.length > 0;

  return (
    <div className="space-y-4">
      {/* 统计头 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>实体总数</div>
          <div className="mt-1 text-2xl font-black text-neutral-900">{statsLoading ? '…' : stats?.entityCount ?? 0}</div>
        </div>
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>关系总数</div>
          <div className="mt-1 text-2xl font-black text-neutral-900">{statsLoading ? '…' : stats?.relationCount ?? 0}</div>
        </div>
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>类型分布</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {typeOptions.length === 0
              ? <span className="text-xs text-neutral-400">—</span>
              : typeOptions.map(t => (
                <Badge key={t} tone="neutral">{t} {stats?.typeDistribution?.[t]}</Badge>
              ))}
          </div>
        </div>
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>最近抽取</div>
          <div className="mt-1 text-[13px] font-bold text-neutral-700">
            {stats?.lastExtractTime ? formatDateTime(stats.lastExtractTime) : '—'}
          </div>
        </div>
      </div>

      {!statsLoading && !hasGraphData ? (
        <EmptyState
          icon={<Network size={24} />}
          title={app.graphEnabled ? '图谱尚无数据' : '图谱未开启'}
          desc={app.graphEnabled
            ? '文档入库并完成图谱抽取后，这里会出现实体与关系。'
            : '在「设置」页开启图谱开关后，新摄入的文档将进行实体关系抽取。'}
        />
      ) : (
        <div className="flex gap-4">
          {/* 实体列表 */}
          <div className={`${THEME.card} w-80 flex-shrink-0 p-3`}>
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
                <input
                  className={`${THEME.input} w-full !pl-8`}
                  placeholder="实体名搜索…"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setQuery(q => ({ ...q, q: (e.target as HTMLInputElement).value, page: 1 }));
                    }
                  }}
                />
              </div>
              <Select
                className="w-32"
                value={query.type}
                onChange={v => setQuery(q => ({ ...q, type: v, page: 1 }))}
                placeholder="全部类型"
                options={typeOptions.map(t => ({ value: t, label: t }))}
              />
            </div>
            {listLoading ? (
              <div className="flex justify-center py-12"><Spinner size={20} /></div>
            ) : entities.length === 0 ? (
              <div className="py-10 text-center text-xs text-neutral-400">无匹配实体</div>
            ) : (
              <div className="space-y-1.5">
                {entities.map(entity => (
                  <div
                    key={entity.entityId}
                    className={`group rounded-xl border px-3 py-2 transition-all ${
                      subgraphCenter?.entityId === entity.entityId ? 'border-black bg-black/5' : 'border-neutral-100 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button className="min-w-0 flex-1 truncate text-left text-[13px] font-bold text-neutral-800" onClick={() => openDetail(entity.entityId)}>
                        {entity.name}
                      </button>
                      <button
                        className="flex-shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-[10px] font-black text-neutral-500 opacity-0 transition-opacity hover:bg-black hover:text-white group-hover:opacity-100"
                        onClick={() => openSubgraph(entity)}
                      >
                        子图
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {entity.entityType && <Badge tone="teal">{entity.entityType}</Badge>}
                      {entity.summary && <span className="truncate text-[11px] text-neutral-400">{entity.summary}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination page={query.page} size={PAGE_SIZE} total={total} onChange={page => setQuery(q => ({ ...q, page }))} className="mt-2" />
          </div>

          {/* 子图 */}
          <div className={`${THEME.card} h-[560px] min-w-0 flex-1 overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <div className="text-[13px] font-black text-neutral-700">
                {subgraphCenter ? `子图 · ${subgraphCenter.name}` : '关系子图'}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={THEME.label}>深度</span>
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    disabled={!subgraphCenter}
                    onClick={() => { setDepth(d); if (subgraphCenter) openSubgraph(subgraphCenter, d); }}
                    className={`h-7 w-7 rounded-lg text-xs font-black transition-all disabled:opacity-30 ${
                      depth === d ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[calc(100%-45px)]">
              <SubgraphViewer subgraph={subgraph} loading={subgraphLoading} onNodeClick={openDetail} />
            </div>
          </div>
        </div>
      )}

      {/* 实体详情抽屉 */}
      <Drawer
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail ? `实体 · ${detail.entity.name}` : '实体详情'}
      >
        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                {detail.entity.entityType && <Badge tone="teal">{detail.entity.entityType}</Badge>}
                {detail.entity.aliases?.map(a => <Badge key={a} tone="neutral">别名 {a}</Badge>)}
              </div>
              {detail.entity.summary && (
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-neutral-600">{detail.entity.summary}</p>
              )}
            </div>

            {detail.properties && Object.keys(detail.properties).length > 0 && (
              <div>
                <div className={THEME.label}>属性</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {Object.entries(detail.properties).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-neutral-50 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{k}</div>
                      <div className="mt-0.5 text-[12px] font-bold text-neutral-700">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(detail.relations?.length ?? 0) > 0 && (
              <div>
                <div className={THEME.label}>邻接关系</div>
                <div className="mt-1.5 space-y-1.5">
                  {detail.relations!.map((rel, i) => (
                    <button
                      key={`${rel.targetEntityId}-${i}`}
                      className="flex w-full items-center gap-2 rounded-xl border border-neutral-100 px-3 py-2 text-left transition-colors hover:border-black"
                      onClick={() => openDetail(rel.targetEntityId)}
                    >
                      <span className="text-[11px] font-black text-neutral-400">{rel.direction === 'out' ? '→' : '←'}</span>
                      <Badge tone="purple">{rel.relationType}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-700">{rel.targetName}</span>
                      {rel.weight != null && <span className="text-[10px] font-semibold text-neutral-300">{rel.weight.toFixed(2)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(detail.sourceChunks?.length ?? 0) > 0 && (
              <div>
                <div className={THEME.label}>出处（点击回原文块）</div>
                <div className="mt-1.5 space-y-1.5">
                  {detail.sourceChunks!.map((ref, i) => (
                    <button
                      key={`${ref.chunkId}-${i}`}
                      className="w-full rounded-xl border border-neutral-100 px-3 py-2 text-left transition-colors hover:border-black"
                      onClick={() => setPreview({ docId: ref.docId, docName: ref.docName, chunkId: ref.chunkId })}
                    >
                      <div className="text-[11px] font-bold text-neutral-500">
                        {ref.docName || '文档'}{ref.pageNo != null ? ` · 第 ${ref.pageNo} 页` : ''}
                      </div>
                      {ref.snippet && <div className="mt-0.5 line-clamp-2 text-[12px] text-neutral-400">{ref.snippet}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ChunkPreviewDrawer
        open={!!preview}
        docId={preview?.docId ?? null}
        docName={preview?.docName}
        highlightChunkId={preview?.chunkId}
        onClose={() => setPreview(null)}
      />
    </div>
  );
};

export default GraphTab;
