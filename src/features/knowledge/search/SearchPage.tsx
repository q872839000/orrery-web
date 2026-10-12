import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp, FileSearch, Search as SearchIcon } from 'lucide-react';
import { knowledgeAppService, knowledgeSearchService, ontologyService } from '../../../shared/services/knowledge';
import type { KnowledgeApp, KnowledgeSearchItem, KnowledgeSearchResult } from '../../../shared/types/knowledge';
import {
  channelLabel, CHANNEL_META, SEARCH_MODELS, type SearchModel,
} from '../../../shared/constants/knowledge';
import { THEME } from '../../../shared/styles/theme';
import { useToast } from '../../../shared/components/ui/ToastManager';
import Badge from '../../../shared/components/ui/Badge';
import EmptyState from '../../../shared/components/ui/EmptyState';
import Spinner from '../../../shared/components/ui/Spinner';
import SegmentedControl from '../../../shared/components/ui/SegmentedControl';
import ChunkPreviewDrawer from '../detail/components/ChunkPreviewDrawer';
import ChunkContent from '../shared/ChunkContent';

/** 全域智慧检索页（/knowledge/search） */
const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [apps, setApps] = useState<KnowledgeApp[]>([]);
  const [query, setQuery] = useState('');
  const [model, setModel] = useState<SearchModel>('HYBRID');
  const [scope, setScope] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);
  const [topK, setTopK] = useState(10);
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ docId: string; docName?: string; chunkId?: string } | null>(null);

  // 可见知识库（检索范围候选）
  useEffect(() => {
    knowledgeAppService.page({ page: 1, size: 100 })
      .then(p => setApps(p.records ?? []))
      .catch(() => setApps([]));
  }, []);

  // 单选库且已配本体时加载实体类型候选（本体过滤）
  useEffect(() => {
    setAvailableEntityTypes([]);
    setEntityTypes([]);
    if (scope.length !== 1) return;
    ontologyService.overview(scope[0])
      .then(ov => {
        if (ov.configured && ov.active) {
          setAvailableEntityTypes((ov.active.entityTypes ?? []).map(t => t.name).filter(Boolean));
        }
      })
      .catch(() => undefined);
  }, [scope]);

  const doSearch = async () => {
    if (!query.trim()) {
      toast.showWarning('请输入检索内容');
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      setResult(await knowledgeSearchService.search({
        query: query.trim(),
        knowledgeAppIds: scope.length > 0 ? scope : undefined,
        model,
        topK,
        returnParent: true,
        entityTypes: entityTypes.length > 0 ? entityTypes : undefined,
      }));
    } catch (e: any) {
      toast.showError(e.message || '检索失败');
    } finally {
      setSearching(false);
    }
  };

  const toggleScope = (id: string) => {
    setScope(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleExpand = (chunkId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId); else next.add(chunkId);
      return next;
    });
  };

  const scopeNames = useMemo(() => {
    if (!result?.effectiveKnowledgeIds) return '';
    const names = result.effectiveKnowledgeIds
      .map(id => apps.find(a => a.id === id)?.name)
      .filter(Boolean);
    return names.join('、');
  }, [result, apps]);

  return (
    <div className={THEME.page}>
      <div className={THEME.pageHeader}>
        <div>
          <h1 className={THEME.pageTitle}>智慧检索</h1>
          <p className={THEME.pageDesc}>混合召回 + RRF 融合 + 精排，命中可下钻原文、Wiki 与图谱</p>
        </div>
      </div>

      {/* 检索面板 */}
      <div className={`${THEME.card} space-y-3 p-4`}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              className={`${THEME.input} w-full !py-3 !pl-10 text-sm`}
              placeholder="输入问题或关键词，回车检索…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
          </div>
          <button className={`${THEME.button.primary} !py-3`} onClick={doSearch} disabled={searching}>
            {searching ? <Spinner size={14} className="text-white" /> : '检索'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={SEARCH_MODELS.map(m => ({ value: m.value, label: m.label, title: m.desc }))}
            value={model}
            onChange={v => setModel(v)}
          />
          <div className="flex items-center gap-1.5">
            <span className={THEME.label}>返回条数</span>
            <input
              type="number"
              min={1}
              max={50}
              className={`${THEME.input} !w-20`}
              value={topK}
              onChange={e => setTopK(Number(e.target.value) || 10)}
            />
          </div>
        </div>

        {/* 范围选择 */}
        <div>
          <div className={THEME.label}>检索范围（缺省 = 全部可见库）</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {apps.map(app => (
              <button
                key={app.id}
                onClick={() => toggleScope(app.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                  scope.includes(app.id) ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white/80 text-neutral-500 hover:border-neutral-400'
                }`}
              >
                {app.name}
              </button>
            ))}
            {apps.length === 0 && <span className="text-xs text-neutral-400">暂无可见知识库</span>}
          </div>
        </div>

        {/* 实体类型过滤（单库 + 已配本体） */}
        {availableEntityTypes.length > 0 && (
          <div>
            <div className={THEME.label}>实体类型过滤（本体）</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {availableEntityTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setEntityTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                    entityTypes.includes(t) ? 'border-teal-600 bg-teal-600 text-white' : 'border-neutral-200 bg-white/80 text-neutral-500 hover:border-teal-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 降级 / 放宽提示 */}
      {result && (result.degradedChannels?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[12px] font-bold text-amber-700">
          <AlertTriangle size={14} />
          部分召回通道不可用已降级：{result.degradedChannels!.map(channelLabel).join('、')}
        </div>
      )}
      {result?.suggestRelax && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[12px] font-medium text-neutral-500">
          未命中任何内容，建议放宽检索条件（减少范围/类型过滤，或改用混合检索）。
        </div>
      )}

      {/* 结果列表 */}
      {searching ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : result ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400">
            <span>
              命中 {result.results.length} 条 · 耗时 {result.took ?? 0}ms
              {scopeNames && ` · 范围：${scopeNames}`}
            </span>
            {result.queryUsed && result.queryUsed !== query.trim() && (
              <span>实际查询：{result.queryUsed}</span>
            )}
          </div>
          {result.results.map(item => (
            <SearchResultCard
              key={item.chunkId}
              item={item}
              expanded={expanded.has(item.chunkId)}
              onToggleExpand={() => toggleExpand(item.chunkId)}
              onPreview={() => setPreview({ docId: item.docId, docName: item.docName, chunkId: item.chunkId })}
              onJumpWiki={() => navigate(`/knowledge/${item.knowledgeId}?tab=wiki`)}
              onJumpGraph={() => navigate(`/knowledge/${item.knowledgeId}?tab=graph`)}
            />
          ))}
          {result.results.length === 0 && !result.suggestRelax && (
            <EmptyState icon={<FileSearch size={24} />} title="没有命中结果" />
          )}
        </div>
      ) : (
        <EmptyState
          icon={<FileSearch size={24} />}
          title="开始一次检索"
          desc="默认混合检索：Wiki 条目 + 语义 + 关键词 + 图谱四路召回，RRF 融合后精排输出。"
        />
      )}

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

/** 单条命中卡片 */
const SearchResultCard: React.FC<{
  item: KnowledgeSearchItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onPreview: () => void;
  onJumpWiki: () => void;
  onJumpGraph: () => void;
}> = ({ item, expanded, onToggleExpand, onPreview, onJumpWiki, onJumpGraph }) => (
  <div className={`${THEME.card} p-4`}>
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="black">{(item.score ?? 0).toFixed(3)}</Badge>
      <button className="text-[13px] font-black text-neutral-800 hover:underline" onClick={onPreview}>
        {item.docName}
      </button>
      <span className="text-[11px] font-semibold text-neutral-400">{item.knowledgeName}</span>
      {item.pageNo != null && <Badge tone="neutral">第 {item.pageNo} 页</Badge>}
      {item.chapterPath && <span className="text-[11px] font-semibold text-neutral-400">{item.chapterPath}</span>}
      <div className="ml-auto flex items-center gap-1">
        {item.channels?.map(ch => (
          <Badge key={ch} tone={CHANNEL_META[ch]?.tone ?? 'neutral'}>{channelLabel(ch)}</Badge>
        ))}
        {item.refType === 'wikiEntry' && (
          <button onClick={onJumpWiki} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-black text-violet-600 hover:bg-violet-100">Wiki 条目</button>
        )}
        {item.refType === 'graphPath' && (
          <button onClick={onJumpGraph} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-black text-teal-600 hover:bg-teal-100">图谱路径</button>
        )}
      </div>
    </div>

    <ChunkContent content={item.content} className="mt-2" />

    {(item.entities?.length ?? 0) > 0 && (
      <div className="mt-2 flex flex-wrap gap-1">
        {item.entities!.map((e, i) => <Badge key={`${e}-${i}`} tone="teal">{e}</Badge>)}
      </div>
    )}

    {item.parentContent && (
      <div className="mt-2">
        <button className="flex items-center gap-1 text-[11px] font-black text-neutral-400 hover:text-black" onClick={onToggleExpand}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? '收起父块上下文' : '展开父块上下文'}
        </button>
        {expanded && (
          <div className="mt-1.5 rounded-xl bg-neutral-50 p-3 text-[12px] text-neutral-500">
            <ChunkContent content={item.parentContent} className="!text-[12px] !text-neutral-500" />
          </div>
        )}
      </div>
    )}
  </div>
);

export default SearchPage;
