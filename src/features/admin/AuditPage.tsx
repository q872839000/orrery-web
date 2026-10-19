import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  logService, LogRecord, PageResult,
  TraceDetailVO, SpanNode as SpanNodeType,
} from '../../shared/services/orrery.service';
import {
  RefreshCw, Search, ScrollText, AlertCircle,
  CheckCircle, XCircle, Activity, Globe, Server as ServerIcon, Link2, Cog,
  GitBranch, Zap, AlertTriangle, X, Maximize2, Minimize2,
  Clock, ShieldAlert, Cpu, ArrowRightLeft, CornerDownRight
} from 'lucide-react';
import { THEME } from '../../shared/styles/theme';
import Select from '../../shared/components/ui/Select';
import Pagination from '../../shared/components/ui/Pagination';

const LOG_TYPE_CFG: Record<string, { bg: string; text: string }> = {
  API:    { bg: 'bg-blue-50',    text: 'text-blue-600' },
  AUDIT:  { bg: 'bg-amber-50',  text: 'text-amber-600' },
  SYSTEM: { bg: 'bg-purple-50', text: 'text-purple-600' },
  ACCESS: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

const SOURCE_CFG: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  external: { label: '外部',   icon: Globe,      color: 'text-sky-500' },
  gateway:  { label: '网关',   icon: ServerIcon, color: 'text-indigo-500' },
  internal: { label: '内部',   icon: Link2,      color: 'text-teal-500' },
  system:   { label: '系统',   icon: Cog,        color: 'text-neutral-400' },
};

const fmtTime = (ts?: number) => ts ? new Date(ts).toLocaleString('zh-CN') : '-';
const fmtDuration = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}min` : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

// ==================== Span Detail Drawer ====================

const SpanDetailDrawer: React.FC<{ span: SpanNodeType | null; onClose: () => void; isOpen: boolean }> = ({ span, onClose, isOpen }) => {
  const formatJson = (s?: string) => {
    if (!s) return null;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  };

  // ESC key support
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen && span) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose, span]);

  if (!isOpen || !span) return null;

  const isErr = !span.success;
  const isSlow = span.success && span.duration > 0 && (span.actualDuration / span.duration) > 0.7;
  let icon = <Cpu size={16} className="text-indigo-600" />;
  if (isErr) icon = <ShieldAlert size={16} className="text-rose-600" />;
  else if (isSlow) icon = <Clock size={16} className="text-amber-600" />;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 justify-between bg-neutral-50/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-white shadow-sm border border-neutral-100 flex-shrink-0">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-neutral-900 tracking-tight leading-tight truncate">{span.methodName}</div>
              <div className="text-[11px] font-mono text-neutral-400 leading-tight mt-0.5 truncate">{span.className}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400 hover:text-black transition-all flex-shrink-0 ml-2">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">服务</span>
              <span className="text-sm font-semibold text-neutral-800">{span.serviceName ?? '-'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">状态</span>
              <span className={`text-sm font-bold ${span.success ? 'text-emerald-600' : 'text-rose-600'}`}>{span.success ? '成功' : '失败'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">耗时</span>
              <span className="text-sm font-mono font-bold text-neutral-800">{fmtDuration(span.duration)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">实际耗时</span>
              <span className={`text-sm font-mono font-bold ${isSlow ? 'text-amber-600' : 'text-neutral-800'}`}>{fmtDuration(span.actualDuration)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">深度</span>
              <span className="text-sm font-mono text-neutral-600">{span.depth}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">偏移</span>
              <span className="text-sm font-mono text-neutral-500">+{span.offsetFromTraceStart}ms</span>
            </div>
            {span.module && (
              <div className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">模块</span>
                <span className="text-sm text-neutral-700">{span.module}</span>
              </div>
            )}
          </div>

          {span.errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-rose-800"><AlertTriangle size={12}/> 错误信息</div>
              <div className="break-all font-mono text-[11px] text-rose-600">{span.errorMessage}</div>
            </div>
          )}

          {/* Payload / Context */}
          {(span.inputArgs || span.returnValue) && (
            <div className="space-y-4 pt-2 border-t border-neutral-100">
              {span.inputArgs && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-700"><ArrowRightLeft size={12} className="text-neutral-400"/> 入参</div>
                  <pre className="p-3.5 bg-[#1E1E1E] text-neutral-300 rounded-xl text-[11px] font-mono overflow-auto max-h-60 whitespace-pre-wrap break-all shadow-inner">
                    {formatJson(span.inputArgs)}
                  </pre>
                </div>
              )}
              {span.returnValue && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-700"><CornerDownRight size={12} className="text-neutral-400"/> 返回值</div>
                  <pre className="p-3.5 bg-[#1E1E1E] text-neutral-300 rounded-xl text-[11px] font-mono overflow-auto max-h-60 whitespace-pre-wrap break-all shadow-inner">
                    {formatJson(span.returnValue)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ==================== Trace Waterfall ====================

const TraceFlowDiagram: React.FC<{ detail: TraceDetailVO }> = ({ detail }) => {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const getSpanKey = (span: SpanNodeType) => span.id ?? `${span.className}-${span.methodName}-${span.startTime}`;

  // 展开为时间轴行：主树前序遍历（兄弟按开始偏移排序）；
  // 无子挂载点的孤立根（异步回流消费等）移到末尾"关联异步"区，仍在同一时间轴上
  const { rows, wallMs } = useMemo(() => {
    const roots = Array.isArray(detail.spanTree) ? detail.spanTree : [];
    const mainRoots = roots.filter(r => (r.children?.length ?? 0) > 0);
    const layoutRoots = (mainRoots.length > 0 ? mainRoots : roots)
      .slice().sort((x, y) => x.offsetFromTraceStart - y.offsetFromTraceStart);
    const orphanRoots = mainRoots.length > 0 ? roots.filter(r => !mainRoots.includes(r)) : [];

    const out: { span: SpanNodeType; orphan: boolean }[] = [];
    const walk = (n: SpanNodeType) => {
      out.push({ span: n, orphan: false });
      (n.children ?? []).slice().sort((x, y) => x.offsetFromTraceStart - y.offsetFromTraceStart).forEach(walk);
    };
    layoutRoots.forEach(walk);
    orphanRoots.slice().sort((x, y) => x.offsetFromTraceStart - y.offsetFromTraceStart)
      .forEach(r => out.push({ span: r, orphan: true }));

    const wall = Math.max(1, out.reduce((m, r) =>
      Math.max(m, (r.span.offsetFromTraceStart ?? 0) + (r.span.duration ?? 0)), 0));
    return { rows: out, wallMs: wall };
  }, [detail.spanTree]);

  const selectedSpan = selectedId != null
    ? (rows.find(r => getSpanKey(r.span) === selectedId)?.span ?? null)
    : null;

  const summary = detail.summary;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <GitBranch size={14} className="text-indigo-500" />
          <span className="font-mono text-[11px] text-neutral-500 select-all break-all">{detail.traceId}</span>
          {detail.success
            ? <CheckCircle size={13} className="text-emerald-500" />
            : <XCircle size={13} className="text-red-500" />}
        </div>
        {detail.requestMethod && detail.requestUri && (
          <div className="font-mono text-[11px] text-neutral-500 mb-2">
            <span className="font-bold text-neutral-700">{detail.requestMethod}</span>{' '}{detail.requestUri}
          </div>
        )}
        <div className="flex flex-wrap gap-4 text-[11px] text-neutral-500">
          {summary && (<>
            <span><strong className="text-black">{summary.totalSpans}</strong> Span</span>
            <span><strong className="text-black">{summary.totalServices}</strong> 服务</span>
            <span><strong className="text-black">{fmtDuration(detail.totalDuration)}</strong> 请求耗时</span>
            {wallMs > detail.totalDuration && (
              <span title="含异步段（引擎处理/回流消费）的端到端全程"><strong className="text-amber-600">{fmtDuration(wallMs)}</strong> 链路全程</span>
            )}
            <span><strong className="text-black">{summary.maxDepth}</strong> 最大深度</span>
            {summary.failedSpans > 0 && (
              <span className="text-red-500"><AlertTriangle size={10} className="inline" /> <strong>{summary.failedSpans}</strong> 失败</span>
            )}
            {summary.bottleneckMethod && (
              <span className="inline-flex items-center gap-1">
                <Zap size={10} className="text-amber-500" />
                <span className="font-mono text-amber-600">{summary.bottleneckMethod}</span>
                <span className="font-mono text-amber-500">{fmtDuration(summary.bottleneckDuration)}</span>
              </span>
            )}
          </>)}
        </div>
        {(detail.user || detail.clientIp) && (
          <div className="mt-1 flex gap-4 text-[11px] text-neutral-400">
            {detail.user && <span>用户 <strong className="text-neutral-600">{detail.user.nickname ?? detail.user.username ?? '-'}</strong></span>}
            {detail.clientIp && <span className="font-mono">{detail.clientIp}</span>}
          </div>
        )}
        <div className="mt-2 text-[11px] text-neutral-400">时间轴从左到右为链路全程，条块长度 = 该步耗时；点击行查看入参 / 出参 / 错误详情</div>
      </div>

      {/* Waterfall */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden">
        {/* 时间刻度头 */}
        <div className="flex items-stretch border-b border-neutral-100 bg-neutral-50/60">
          <div className="w-[300px] flex-shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center">
            Span · {rows.length}
          </div>
          <div className="relative flex-1">
            {ticks.map(t => (
              <span key={t} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[10px] font-mono text-neutral-400"
                style={{ left: `${t * 100}%` }}>
                {fmtDuration(wallMs * t)}
              </span>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2 text-neutral-300">
            <GitBranch size={26} strokeWidth={1} />
            <span className="text-sm">暂无可渲染的调用链节点</span>
          </div>
        ) : rows.map(({ span, orphan }, i) => {
          const key = getSpanKey(span);
          const active = selectedId === key;
          const isErr = !span.success;
          const isSlow = span.success && span.duration > 0 && (span.actualDuration / span.duration) > 0.7;
          const leftPct = Math.min((span.offsetFromTraceStart / wallMs) * 100, 100);
          const widthPct = Math.max((span.duration / wallMs) * 100, 0.4);
          const labelRight = leftPct + widthPct <= 78;
          const orphanHeader = orphan && (i === 0 || !rows[i - 1].orphan);
          return (
            <React.Fragment key={key}>
              {orphanHeader && (
                <div className="px-3 py-1.5 bg-amber-50/60 border-y border-amber-100 text-[10px] font-bold text-amber-600">
                  关联异步回流 · 由本链路触发（无父子挂载点）
                </div>
              )}
              <button onClick={() => setSelectedId(prev => prev === key ? null : key)}
                className={`w-full flex items-center text-left transition-colors border-b border-neutral-50
                  ${active ? 'bg-indigo-50/70' : 'hover:bg-neutral-50'}`}>
                {/* 名称列（按深度缩进） */}
                <div className="w-[300px] flex-shrink-0 py-2 min-w-0 flex items-center gap-1.5"
                  style={{ paddingLeft: 12 + Math.max(0, (span.depth ?? 1) - 1) * 16, paddingRight: 12 }}>
                  {isErr
                    ? <XCircle size={12} className="flex-shrink-0 text-rose-500" />
                    : isSlow
                      ? <Clock size={12} className="flex-shrink-0 text-amber-500" />
                      : <CheckCircle size={12} className="flex-shrink-0 text-emerald-500" />}
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-neutral-800">{span.methodName ?? '-'}</div>
                    <div className="truncate font-mono text-[10px] text-neutral-400">{span.className ?? ''}</div>
                  </div>
                </div>
                {/* 时间轴条块 */}
                <div className="relative flex-1 h-9">
                  {ticks.filter(t => t > 0 && t < 1).map(t => (
                    <span key={t} className="absolute top-0 bottom-0 w-px bg-neutral-100" style={{ left: `${t * 100}%` }} />
                  ))}
                  <div className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-md
                      ${isErr ? 'bg-rose-400' : isSlow ? 'bg-amber-400' : 'bg-indigo-400'}`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
                  <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-mono whitespace-nowrap
                      ${isErr ? 'text-rose-600' : 'text-neutral-500'}`}
                    style={labelRight
                      ? { left: `calc(${leftPct + widthPct}% + 6px)` }
                      : { right: `calc(${100 - leftPct}% + 6px)` }}>
                    {fmtDuration(span.duration)}
                  </span>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Detail drawer (shown when a node is selected) */}
      <SpanDetailDrawer span={selectedSpan} onClose={() => setSelectedId(null)} isOpen={!!selectedSpan} />
    </div>
  );
};

// ==================== Component ====================

const AuditPage: React.FC = () => {
  const [result, setResult]   = useState<PageResult<LogRecord>>({ records: [], total: 0, page: 1, size: 20, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [page, setPage]       = useState(1);
  const [size]                = useState(20);
  const [logType, setLogType] = useState('');
  const [module, setModule]   = useState('');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  // Drawer state
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [drawerFullscreen, setDrawerFullscreen] = useState(false);
  const [drawerTraceId, setDrawerTraceId] = useState('');
  const [drawerDetail, setDrawerDetail]   = useState<TraceDetailVO | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError]     = useState<string | null>(null);

  // Manual trace search bar (visible above table)
  const [manualTraceId, setManualTraceId] = useState('');

  // Debounce keyword search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const loadPage = useCallback(async (p: number, keywordValue = debouncedKeyword) => {
    setLoading(true); setError(null);
    try {
      const res = await logService.query({
        page: p, size,
        logType: logType || undefined,
        module: module || undefined,
        keyword: keywordValue || undefined,
      });
      setResult(res);
      setPage(p);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [size, logType, module, debouncedKeyword]);

  const openDrawer = async (tid: string) => {
    setDrawerTraceId(tid);
    setDrawerOpen(true);
    setDrawerDetail(null);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      const res = await logService.queryTraceDetail(tid);
      setDrawerDetail(res);
    } catch (e: any) { setDrawerError(e.message); }
    finally { setDrawerLoading(false); }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerFullscreen(false);
    setDrawerDetail(null);
    setDrawerError(null);
  };

  const searchManualTrace = () => {
    if (manualTraceId.trim()) openDrawer(manualTraceId.trim());
  };

  const triggerKeywordSearch = () => {
    const nextKeyword = keyword.trim();
    if (nextKeyword === debouncedKeyword) {
      loadPage(1, nextKeyword);
      return;
    }
    setDebouncedKeyword(nextKeyword);
  };

  // Load initial data and when filters change
  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  // ==================== Render ====================

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-black tracking-tighter">分布式审计日志</h1>
          <p className="text-neutral-400 text-sm font-medium mt-1">点击任意日志行的链路图标，即可查看完整调用链</p>
        </div>
        <button onClick={() => loadPage(page)} disabled={loading}
          className={`${THEME.button.primary} disabled:opacity-50`}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 筛选 + 手动 TraceId 搜索 */}
      <div className={`${THEME.card} p-4 sm:p-5`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <Select value={logType} onChange={setLogType}
              placeholder="全部类型"
              options={[
                { value: 'API', label: 'API 接口' },
                { value: 'AUDIT', label: '审计' },
                { value: 'SYSTEM', label: '系统' },
                { value: 'ACCESS', label: '调用链路' },
              ]} />
          </div>
          <div className="min-w-0">
            <input value={module} onChange={e => setModule(e.target.value)}
              placeholder="模块筛选"
              className={`${THEME.input} w-full`} />
          </div>

          {/* 关键词搜索 */}
          <div className={`min-w-0 ${THEME.searchWrapper}`}>
            <Search className={THEME.searchIcon} />
            <input value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && triggerKeywordSearch()}
              placeholder="关键词搜索（描述、错误消息等...）"
              className={THEME.searchInput} />
          </div>

          <div className="relative min-w-0">
            <GitBranch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-300" size={12} />
            <input value={manualTraceId} onChange={e => setManualTraceId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchManualTrace()}
              placeholder="Trace ID 直查..."
              className={`${THEME.input} w-full pl-8`} />
          </div>
          <button onClick={searchManualTrace} disabled={!manualTraceId.trim()}
            className="h-[42px] px-4 rounded-xl text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed">
            查询链路
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-sm">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
      ) : result.records.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-neutral-300 gap-3">
          <ScrollText size={32} strokeWidth={1} />
          <span className="text-sm">暂无日志记录</span>
        </div>
      ) : (
        <div className={`${THEME.card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-neutral-400 border-b border-neutral-100 bg-neutral-50/50">
                  {['', '类型', '来源', '服务', '模块 / 操作', 'URI', '状态', '耗时', '描述 / 变更', '用户', '时间'].map(h => (
                    <th key={h || '_chain'} className="px-3 py-3 text-left font-bold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.records.map((r, i) => {
                  const typeStyle = LOG_TYPE_CFG[r.logType ?? ''] ?? { bg: 'bg-neutral-50', text: 'text-neutral-500' };
                  return (
                    <tr key={r.id ?? i} className="border-b border-neutral-50 hover:bg-neutral-50/60 transition-colors">
                      {/* 链路按钮 */}
                      <td className="px-2 py-2.5 text-center">
                        {r.traceId ? (
                          <button onClick={() => openDrawer(r.traceId!)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 text-[11px] font-bold transition-all"
                            title="查看调用链路">
                            <GitBranch size={13} />链路
                          </button>
                        ) : <span className="text-neutral-200"><GitBranch size={14} /></span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${typeStyle.bg} ${typeStyle.text}`}>
                          {r.logType ?? '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const src = SOURCE_CFG[r.source ?? ''];
                          if (!src) return <span className="text-[10px] text-neutral-400">-</span>;
                          const Icon = src.icon;
                          return <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${src.color}`}><Icon size={11}/>{src.label}</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-neutral-500 truncate max-w-[100px]">{r.serviceName ?? '-'}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-neutral-700 font-medium">{r.module ?? '-'}</span>
                        {r.operation && <span className="text-neutral-400 ml-1">/ {r.operation}</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-neutral-400 text-[11px] truncate max-w-[140px]">
                        {r.requestMethod && <span className="font-bold mr-1">{r.requestMethod}</span>}
                        {r.requestUri ?? (r.className
                          ? <span className="text-indigo-400" title={`${r.className}.${r.methodName ?? ''}`}>
                              {r.className}{r.methodName ? ` · ${r.methodName}` : ''}
                            </span>
                          : '-')}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.success === true && <CheckCircle size={13} className="text-emerald-500" />}
                        {r.success === false && <XCircle size={13} className="text-red-500" />}
                        {r.success == null && <Activity size={13} className="text-neutral-300" />}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-400 font-mono text-[11px]">
                        {r.duration != null ? fmtDuration(r.duration) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 max-w-[220px]">
                        {r.errorMessage
                          ? <span className="text-red-500 truncate block">{r.errorMessage}</span>
                          : r.changeSummary
                            ? <span className="text-emerald-600 truncate block text-[11px] font-mono" title={r.changeSummary}>{r.changeSummary}</span>
                            : <span className="truncate block">{r.description ?? '-'}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-neutral-500 truncate max-w-[80px]">{r.nickname ?? r.username ?? '-'}</td>
                      <td className="px-3 py-2.5 text-neutral-400 whitespace-nowrap text-[11px]">{fmtTime(r.createTime)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.pages > 1 && (
            <div className="px-4 py-4 sm:px-6 border-t border-neutral-50 bg-white/50 backdrop-blur-sm flex justify-end">
              <Pagination page={result.page} total={result.total} size={result.size} onChange={loadPage} />
            </div>
          )}
        </div>
      )}

      {/* ==================== Trace Drawer ==================== */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={closeDrawer} />

          {/* Drawer panel */}
          <div className={`fixed top-0 right-0 h-full bg-white/95 backdrop-blur-xl border-l border-neutral-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 transition-all ${drawerFullscreen ? 'w-full' : 'w-[860px] max-w-[92vw]'}`}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-indigo-500" />
                <span className="font-black text-sm text-black">调用链路详情</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setDrawerFullscreen(f => !f)}
                  className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-black transition-all"
                  title={drawerFullscreen ? '退出全屏' : '全屏'}>
                  {drawerFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={closeDrawer}
                  className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-black transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-auto px-6 py-5">
              {drawerLoading ? (
                <div className="h-48 flex items-center justify-center text-neutral-400 text-sm">
                  <RefreshCw size={16} className="animate-spin mr-2" />加载链路...
                </div>
              ) : drawerError ? (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-sm">
                  <AlertCircle size={16} />{drawerError}
                </div>
              ) : !drawerDetail ? (
                <div className="h-48 flex flex-col items-center justify-center text-neutral-300 gap-3">
                  <GitBranch size={28} strokeWidth={1} />
                  <span className="text-sm">未找到该 TraceId 的调用链路数据</span>
                  <span className="text-[10px] font-mono text-neutral-400 select-all">{drawerTraceId}</span>
                </div>
              ) : (
                <TraceFlowDiagram detail={drawerDetail} />
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default AuditPage;

