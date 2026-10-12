import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Brain, RefreshCw, Loader2, History as HistoryIcon, Pencil, Trash2,
  ChevronRight, Quote, Database, ShieldAlert, Inbox, X, Check, Sparkles, UserCheck,
} from 'lucide-react';
import { THEME } from '../../shared/styles/theme';
import {
  memoryService,
  MemoryOverview,
  ProfileItem,
  ProfileDimension,
  MemoryItem,
  MemoryRevision,
} from '../../shared/services/memory.service';
import { useConfirm } from '../../shared/hooks/useConfirm';

// ─── 展示映射 ────────────────────────────────────────────────

const ITEM_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  ACTIVE:      { label: '生效中',   cls: 'bg-emerald-50 text-emerald-600',  dot: 'bg-emerald-500' },
  SUPERSEDED:  { label: '已被取代', cls: 'bg-neutral-100 text-neutral-500', dot: 'bg-neutral-400' },
  INVALIDATED: { label: '已作废',   cls: 'bg-neutral-100 text-neutral-400', dot: 'bg-neutral-300' },
};

const FACT_KIND: Record<string, { label: string; cls: string }> = {
  FACT:       { label: '事实', cls: 'bg-blue-50 text-blue-600' },
  PREFERENCE: { label: '偏好', cls: 'bg-violet-50 text-violet-600' },
  EXPERIENCE: { label: '经验', cls: 'bg-indigo-50 text-indigo-600' },
  EPISODE:    { label: '情景', cls: 'bg-teal-50 text-teal-600' },
};

const FACT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:      { label: '生效',   cls: 'bg-emerald-50 text-emerald-600' },
  SUPERSEDED:  { label: '已取代', cls: 'bg-neutral-100 text-neutral-500' },
  INVALIDATED: { label: '已作废', cls: 'bg-neutral-100 text-neutral-400' },
};

const REVISION_OP: Record<string, string> = {
  CREATE: '创建', UPDATE: '更正', SUPERSEDE: '被取代',
  INVALIDATE: '作废', ERASE: '隐私擦除', PURGE: '治理清理',
};

/** 画像条目状态排序（生效优先，其余按关注程度）。 */
const STATUS_RANK: Record<string, number> = { ACTIVE: 0, SUPERSEDED: 1, INVALIDATED: 2 };

// ─── 小组件 ────────────────────────────────────────────────

const fmtTime = (v?: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('zh-CN', { hour12: false });
};

const EmptyState: React.FC<{ icon: React.ElementType; text: string; sub?: string }> = ({ icon: Icon, text, sub }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-2">
    <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center">
      <Icon size={24} className="text-neutral-300" />
    </div>
    <p className="text-sm font-bold text-neutral-400">{text}</p>
    {sub && <p className="text-xs text-neutral-300 max-w-md text-center leading-relaxed">{sub}</p>}
  </div>
);

const ImportanceBar: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-1.5" title={`重要度 ${value}/10`}>
    <span className="w-14 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
      <span
        className={`block h-full rounded-full ${value >= 7 ? 'bg-emerald-500' : value >= 4 ? 'bg-amber-500' : 'bg-neutral-400'}`}
        style={{ width: `${Math.round(Math.min(10, Math.max(0, value)) * 10)}%` }}
      />
    </span>
    <span className="text-[10px] font-mono text-neutral-400">{value}/10</span>
  </span>
);

// ─── 画像条目卡片 ────────────────────────────────────────────

interface ItemCardProps {
  item: ProfileItem;
  editing: boolean;
  editValue: string;
  historyOpen: boolean;
  historyLoading: boolean;
  history: ProfileItem[];
  acting: boolean;
  onEditValue: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleHistory: () => void;
  onRetire: () => void;
}

const ProfileItemCard: React.FC<ItemCardProps> = ({
  item, editing, editValue, historyOpen, historyLoading, history, acting,
  onEditValue, onStartEdit, onCancelEdit, onSaveEdit, onToggleHistory, onRetire,
}) => {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const status = ITEM_STATUS[item.status] ?? { label: item.status, cls: 'bg-neutral-100 text-neutral-500', dot: 'bg-neutral-400' };
  const live = item.status === 'ACTIVE';

  return (
    <div className={`rounded-2xl border transition-all ${
      item.status === 'ACTIVE' ? 'border-neutral-200/70 bg-white' : 'border-neutral-200/50 bg-neutral-50/50'}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0" title={item.inferred ? '据对话行为推断' : '你显式陈述的'}>
            {item.inferred
              ? <Sparkles size={13} className="text-amber-500" />
              : <UserCheck size={13} className="text-violet-500" />}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={editValue}
                  onChange={e => onEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onSaveEdit()}
                  autoFocus
                  className={THEME.input}
                />
                <button onClick={onSaveEdit} disabled={acting || !editValue.trim()}
                  className="p-2 rounded-xl bg-black text-white hover:bg-neutral-800 transition-all disabled:opacity-40" title="保存">
                  {acting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button onClick={onCancelEdit} disabled={acting}
                  className="p-2 rounded-xl bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all" title="取消">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <p className={`text-sm font-bold leading-relaxed ${
                item.status === 'ACTIVE' ? 'text-neutral-800' : 'text-neutral-400 line-through'}`}>
                {item.value}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                item.inferred ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600'}`}>
                {item.inferred ? '据对话推断' : '显式陈述'}
              </span>
              <span className="text-[10px] font-mono text-neutral-300">v{item.version}</span>
              <span className="text-[11px] text-neutral-400">记于 {fmtTime(item.createdAt)}</span>
              {item.status !== 'ACTIVE' && item.updatedAt !== item.createdAt && (
                <span className="text-[11px] text-neutral-300">变更 {fmtTime(item.updatedAt)}</span>
              )}
            </div>
          </div>
          {!editing && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {item.evidence && (
                <button onClick={() => setEvidenceOpen(!evidenceOpen)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold text-neutral-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                  title="查看证据（对话原文）">
                  <Quote size={12} />
                </button>
              )}
              <button onClick={onToggleHistory}
                className={`p-1.5 rounded-xl transition-all ${historyOpen ? 'text-violet-600 bg-violet-50' : 'text-neutral-400 hover:text-violet-600 hover:bg-violet-50'}`}
                title="谱系（同维度全状态流转）">
                <HistoryIcon size={13} />
              </button>
              {live && (
                <>
                  <button onClick={onStartEdit}
                    className="p-1.5 rounded-xl text-neutral-400 hover:text-sky-600 hover:bg-sky-50 transition-all" title="编辑">
                    <Pencil size={13} />
                  </button>
                  <button onClick={onRetire} disabled={acting}
                    className="p-1.5 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40" title="移除">
                    {acting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {evidenceOpen && item.evidence && (
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/60">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">证据（对话原文）</p>
          <div className="flex items-start gap-2 text-[12px]">
            <Quote size={11} className="text-neutral-300 mt-0.5 flex-shrink-0" />
            <p className="text-neutral-600 leading-relaxed">{item.evidence}</p>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/60">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">谱系（同维度全状态流转）</p>
          {historyLoading ? (
            <div className="flex items-center justify-center py-3 text-neutral-400"><Loader2 size={14} className="animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-xs text-neutral-300 py-2">无谱系记录</p>
          ) : (
            <div className="space-y-0">
              {history.map((node, i) => {
                const nodeStatus = ITEM_STATUS[node.status] ?? ITEM_STATUS.INVALIDATED;
                return (
                  <div key={node.itemId} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full mt-1.5 ${nodeStatus.dot}`} />
                      {i < history.length - 1 && <span className="w-px flex-1 bg-neutral-200" />}
                    </div>
                    <div className="pb-3 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-black ${nodeStatus.cls} border-neutral-200`}>
                          {nodeStatus.label}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-300">v{node.version}</span>
                        <span className="text-[10px] text-neutral-400">{fmtTime(node.createdAt)}</span>
                        {node.itemId === item.itemId && (
                          <span className="text-[10px] font-bold text-violet-500">← 当前条目</span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">{node.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 长期记忆卡片 ────────────────────────────────────────────

interface FactCardProps {
  fact: MemoryItem;
  editing: boolean;
  editValue: string;
  historyOpen: boolean;
  historyLoading: boolean;
  history: MemoryRevision[];
  acting: boolean;
  onEditValue: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleHistory: () => void;
  onInvalidate: () => void;
}

const FactCard: React.FC<FactCardProps> = ({
  fact, editing, editValue, historyOpen, historyLoading, history, acting,
  onEditValue, onStartEdit, onCancelEdit, onSaveEdit, onToggleHistory, onInvalidate,
}) => {
  const kind = FACT_KIND[fact.kind] ?? { label: fact.kind, cls: 'bg-neutral-100 text-neutral-500' };
  const status = FACT_STATUS[fact.status] ?? { label: fact.status, cls: 'bg-neutral-100 text-neutral-500' };
  const live = fact.status === 'ACTIVE';
  const explicit = fact.provenance?.explicit === true;
  return (
    <div className={`rounded-2xl border transition-all ${
      live ? 'border-neutral-200/70 bg-white' : 'border-neutral-200/50 bg-neutral-50/50'}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {fact.abstractText && fact.abstractText !== fact.content && !editing && (
              <p className={`text-[11px] font-bold mb-1 ${live ? 'text-neutral-400' : 'text-neutral-300'}`}>
                {fact.abstractText}
              </p>
            )}
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={editValue}
                  onChange={e => onEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onSaveEdit()}
                  autoFocus
                  className={THEME.input}
                />
                <button onClick={onSaveEdit} disabled={acting || !editValue.trim()}
                  className="p-2 rounded-xl bg-black text-white hover:bg-neutral-800 transition-all disabled:opacity-40" title="保存">
                  {acting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button onClick={onCancelEdit} disabled={acting}
                  className="p-2 rounded-xl bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all" title="取消">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <p className={`text-sm font-medium leading-relaxed ${
                live ? 'text-neutral-800' : 'text-neutral-400 line-through'}`}>
                {fact.content}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kind.cls}`}>{kind.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.cls}`}>{status.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                explicit ? 'bg-violet-50 text-violet-600' : 'bg-neutral-100 text-neutral-500'}`}>
                {explicit ? '你要求记住的' : '自动沉淀'}
              </span>
              <ImportanceBar value={fact.importance} />
              {(fact.accessCount ?? 0) > 0 && (
                <span className="text-[11px] text-neutral-400 font-medium">召回 ×{fact.accessCount}</span>
              )}
              <span className="text-[10px] font-mono text-neutral-300">v{fact.version}</span>
              <span className="text-[11px] text-neutral-400">{fmtTime(fact.createdAt)}</span>
              {fact.lastAccessedAt && (
                <span className="text-[10px] text-neutral-300">最近召回 {fmtTime(fact.lastAccessedAt)}</span>
              )}
            </div>
          </div>
          {!editing && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={onToggleHistory}
                className={`p-1.5 rounded-xl transition-all ${historyOpen ? 'text-violet-600 bg-violet-50' : 'text-neutral-400 hover:text-violet-600 hover:bg-violet-50'}`}
                title="审计链">
                <HistoryIcon size={13} />
              </button>
              {live && (
                <>
                  <button onClick={onStartEdit}
                    className="p-1.5 rounded-xl text-neutral-400 hover:text-sky-600 hover:bg-sky-50 transition-all" title="更正">
                    <Pencil size={13} />
                  </button>
                  <button onClick={onInvalidate} disabled={acting}
                    className="p-1.5 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40" title="移除">
                    {acting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {historyOpen && (
        <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/60">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">审计链</p>
          {historyLoading ? (
            <div className="flex items-center justify-center py-3 text-neutral-400"><Loader2 size={14} className="animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-xs text-neutral-300 py-2">无修订记录</p>
          ) : (
            <div className="space-y-0">
              {history.map((rev, i) => (
                <div key={rev.revisionId} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className="w-2 h-2 rounded-full bg-neutral-300 mt-1.5" />
                    {i < history.length - 1 && <span className="w-px flex-1 bg-neutral-200" />}
                  </div>
                  <div className="pb-3 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-md bg-white border border-neutral-200 text-[10px] font-black text-neutral-600">
                        {REVISION_OP[rev.op] ?? rev.op}
                      </span>
                      <span className="text-[10px] text-neutral-400">{fmtTime(rev.at)}</span>
                      {rev.actorId && <span className="text-[10px] text-neutral-300">by {rev.actorId}</span>}
                    </div>
                    {rev.reason && <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">{rev.reason}</p>}
                    {rev.op === 'UPDATE' && rev.beforeJson && rev.afterJson && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                        <span className="line-through">{rev.beforeJson}</span>
                        <ChevronRight size={10} className="inline mx-1 text-neutral-300" />
                        <span className="text-neutral-600">{rev.afterJson}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 主页面 ────────────────────────────────────────────────

type TabKey = 'items' | 'facts';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'items', label: '画像条目', icon: Brain },
  { key: 'facts', label: '长期记忆', icon: Database },
];

const MemoryPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('items');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<MemoryOverview>({});
  const [dimensions, setDimensions] = useState<ProfileDimension[]>([]);

  // 条目操作状态（画像与长期记忆共用一套编辑/审计状态，按当前页签作用）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [itemHistory, setItemHistory] = useState<ProfileItem[]>([]);
  const [factHistory, setFactHistory] = useState<MemoryRevision[]>([]);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, dims] = await Promise.all([
        memoryService.getOverview(),
        memoryService.getDimensions().catch(() => ({ data: { data: [] } })),
      ]);
      setOverview((ov.data?.data ?? {}) as MemoryOverview);
      setDimensions(((dims as any).data?.data ?? []) as ProfileDimension[]);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => overview.profileItems ?? [], [overview.profileItems]);
  const facts = useMemo(
    () => [...(overview.userFacts ?? [])].sort((a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [overview.userFacts],
  );

  const activeItemCount = items.filter(i => i.status === 'ACTIVE').length;
  const archivedItemCount = items.length - activeItemCount;
  const activeFactCount = facts.filter(f => f.status === 'ACTIVE').length;
  const totalRecalls = facts.reduce((sum, f) => sum + (f.accessCount ?? 0), 0);

  const dimensionLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dimensions) map.set(d.key, d.label);
    return map;
  }, [dimensions]);

  // 按维度分组（维度注册顺序优先，未知维度排最后）
  const grouped = useMemo(() => {
    const order = dimensions.map(d => d.key);
    const groups = new Map<string, ProfileItem[]>();
    for (const it of items) {
      if (!groups.has(it.dimension)) groups.set(it.dimension, []);
      groups.get(it.dimension)!.push(it);
    }
    for (const list of groups.values()) {
      list.sort((a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
        || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    }
    return [...groups.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [items, dimensions]);

  const toggleItemHistory = async (item: ProfileItem) => {
    if (historyId === item.itemId) { setHistoryId(null); return; }
    setHistoryId(item.itemId);
    setHistoryLoading(true);
    setItemHistory([]);
    try {
      const res = await memoryService.getItemHistory(item.itemId);
      setItemHistory((res.data?.data ?? []) as ProfileItem[]);
    } catch { setItemHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const toggleFactHistory = async (fact: MemoryItem) => {
    if (historyId === fact.memoryId) { setHistoryId(null); return; }
    setHistoryId(fact.memoryId);
    setHistoryLoading(true);
    setFactHistory([]);
    try {
      const res = await memoryService.getFactHistory(fact.memoryId);
      setFactHistory((res.data?.data ?? []) as MemoryRevision[]);
    } catch { setFactHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const saveItemEdit = async (item: ProfileItem) => {
    if (!editValue.trim()) return;
    setActingId(item.itemId);
    try {
      await memoryService.editItem(item.itemId, editValue.trim());
      setEditingId(null);
      await load();
    } catch (e: any) { setError(e.message || '编辑失败'); }
    finally { setActingId(null); }
  };

  const saveFactEdit = async (fact: MemoryItem) => {
    if (!editValue.trim()) return;
    setActingId(fact.memoryId);
    try {
      await memoryService.correctFact(fact.memoryId, editValue.trim());
      setEditingId(null);
      await load();
    } catch (e: any) { setError(e.message || '更正失败'); }
    finally { setActingId(null); }
  };

  const retireItem = async (item: ProfileItem) => {
    const ok = await confirm({
      title: '移除画像记忆',
      message: `确定移除「${item.value.slice(0, 40)}${item.value.length > 40 ? '…' : ''}」吗？移除后不再注入对话（谱系保留）。`,
    });
    if (!ok) return;
    setActingId(item.itemId);
    try {
      await memoryService.retireItem(item.itemId, '用户在记忆档案页移除');
      await load();
    } catch (e: any) { setError(e.message || '移除失败'); }
    finally { setActingId(null); }
  };

  const invalidateFact = async (fact: MemoryItem) => {
    const ok = await confirm({
      title: '移除长期记忆',
      message: `确定移除「${fact.content.slice(0, 40)}${fact.content.length > 40 ? '…' : ''}」吗？移除后不再参与召回（审计链保留）。`,
    });
    if (!ok) return;
    setActingId(fact.memoryId);
    try {
      await memoryService.invalidateFact(fact.memoryId, '用户在记忆档案页移除');
      await load();
    } catch (e: any) { setError(e.message || '移除失败'); }
    finally { setActingId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-black tracking-tighter">记忆档案</h1>
          <p className="text-neutral-400 text-sm font-medium mt-1">
            当前登录用户的画像与长期记忆：AI 记住了什么、从哪来、经历了几番更正，全部透明可见
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold bg-black text-white hover:bg-neutral-800 transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '生效画像', value: activeItemCount, icon: Brain, cls: 'text-violet-500' },
          { label: '画像历史', value: archivedItemCount, icon: HistoryIcon, cls: 'text-neutral-400' },
          { label: '生效长期记忆', value: activeFactCount, icon: Database, cls: 'text-blue-500' },
          { label: '累计召回命中', value: totalRecalls, icon: Sparkles, cls: 'text-teal-500' },
        ].map(s => (
          <div key={s.label} className={`${THEME.card} px-5 py-4 flex items-center gap-4`}>
            <div className="w-10 h-10 rounded-xl bg-neutral-50 flex items-center justify-center flex-shrink-0">
              <s.icon size={18} className={s.cls} />
            </div>
            <div>
              <p className="text-2xl font-black text-black leading-none">{s.value}</p>
              <p className="text-[11px] text-neutral-400 font-bold mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 标签栏 */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-100/70 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setEditingId(null); setHistoryId(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.key ? 'bg-black text-white shadow-md' : 'text-neutral-500 hover:text-black'}`}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-bold">
          <ShieldAlert size={15} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* ── 画像条目 ── */}
          {tab === 'items' && (
            grouped.length === 0 ? (
              <EmptyState icon={Brain} text="还没有画像记忆"
                sub="在对话中告诉管家你的偏好（或明确说「记住……」），画像会按维度逐条展示在这里：生效、被取代、已作废一目了然" />
            ) : (
              <div className="space-y-6">
                {grouped.map(([dimension, list]) => (
                  <div key={dimension}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className={`${THEME.label}`}>{dimensionLabel.get(dimension) ?? dimension}</p>
                      <span className="text-[10px] font-mono text-neutral-300">{dimension}</span>
                      <span className="text-[10px] text-neutral-300">· {list.length} 条</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {list.map(item => (
                        <ProfileItemCard
                          key={item.itemId}
                          item={item}
                          editing={editingId === item.itemId}
                          editValue={editValue}
                          historyOpen={historyId === item.itemId}
                          historyLoading={historyLoading}
                          history={historyId === item.itemId ? itemHistory : []}
                          acting={actingId === item.itemId}
                          onEditValue={setEditValue}
                          onStartEdit={() => { setEditingId(item.itemId); setEditValue(item.value); }}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={() => saveItemEdit(item)}
                          onToggleHistory={() => toggleItemHistory(item)}
                          onRetire={() => retireItem(item)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── 长期记忆 ── */}
          {tab === 'facts' && (
            facts.length === 0 ? (
              <EmptyState icon={Inbox} text="没有长期记忆"
                sub="跨会话的事实、偏好与经验会沉淀在这里（含已作废与已取代的全状态条目，附审计链）" />
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {facts.map(fact => (
                  <FactCard
                    key={fact.memoryId}
                    fact={fact}
                    editing={editingId === fact.memoryId}
                    editValue={editValue}
                    historyOpen={historyId === fact.memoryId}
                    historyLoading={historyLoading}
                    history={historyId === fact.memoryId ? factHistory : []}
                    acting={actingId === fact.memoryId}
                    onEditValue={setEditValue}
                    onStartEdit={() => { setEditingId(fact.memoryId); setEditValue(fact.content); }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveFactEdit(fact)}
                    onToggleHistory={() => toggleFactHistory(fact)}
                    onInvalidate={() => invalidateFact(fact)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {ConfirmDialog}
    </div>
  );
};

export default MemoryPage;
