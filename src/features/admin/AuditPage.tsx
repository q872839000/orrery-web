import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  logService, LogRecord, PageResult,
  TraceDetailVO, SpanNode as SpanNodeType,
} from '../../shared/services/orrery.service';
import {
  RefreshCw, Search, ScrollText, AlertCircle,
  CheckCircle, XCircle, Activity, Globe, Server as ServerIcon, Link2, Cog,
  GitBranch, Zap, AlertTriangle, X, Maximize2, Minimize2,
  Clock, ShieldAlert, Cpu, ArrowRightLeft, CornerDownRight,
  ZoomIn, ZoomOut, Focus
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
const fmtDuration = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

// ==================== Tree Layout Algorithm ====================

const NODE_W = 192;
const NODE_H = 80;
const GAP_H = 32;
const GAP_V = 48;
const PAD = 32;

interface LayoutNode {
  span: SpanNodeType;
  x: number;
  y: number;
  children: LayoutNode[];
}

function subtreeWidth(span: SpanNodeType): number {
  if (!span.children?.length) return NODE_W;
  const cw = span.children.reduce((s, c) => s + subtreeWidth(c) + GAP_H, -GAP_H);
  return Math.max(NODE_W, cw);
}

function layoutNode(span: SpanNodeType, x: number, y: number): LayoutNode {
  const sw = subtreeWidth(span);
  const node: LayoutNode = {
    span, x: x + sw / 2 - NODE_W / 2, y, children: [],
  };
  if (span.children?.length) {
    let cx = x;
    for (const child of span.children) {
      const cw = subtreeWidth(child);
      node.children.push(layoutNode(child, cx, y + NODE_H + GAP_V));
      cx += cw + GAP_H;
    }
  }
  return node;
}

function flattenNodes(node: LayoutNode): LayoutNode[] {
  return [node, ...node.children.flatMap(flattenNodes)];
}

interface ConnectorEdge { px: number; py: number; cx: number; cy: number; }

function collectEdges(node: LayoutNode): ConnectorEdge[] {
  const edges: ConnectorEdge[] = [];
  for (const child of node.children) {
    edges.push({
      px: node.x + NODE_W / 2,
      py: node.y + NODE_H,
      cx: child.x + NODE_W / 2,
      cy: child.y,
    });
    edges.push(...collectEdges(child));
  }
  return edges;
}

function connectorPath(e: ConnectorEdge): string {
  const midY = (e.py + e.cy) / 2;
  if (Math.abs(e.px - e.cx) < 1) {
    return `M ${e.px} ${e.py} L ${e.cx} ${e.cy}`;
  }
  const r = Math.min(20, Math.abs(e.cx - e.px) / 2, (e.cy - e.py) / 2);
  const dir = e.cx > e.px ? 1 : -1;
  return [
    `M ${e.px} ${e.py}`,
    `L ${e.px} ${midY - r}`,
    `Q ${e.px} ${midY} ${e.px + dir * r} ${midY}`,
    `L ${e.cx - dir * r} ${midY}`,
    `Q ${e.cx} ${midY} ${e.cx} ${midY + r}`,
    `L ${e.cx} ${e.cy}`,
  ].join(' ');
}

// ==================== Span Node Card ====================

const FlowNodeCard: React.FC<{
  span: SpanNodeType; totalDuration: number;
  selected: boolean;
}> = ({ span, totalDuration, selected }) => {
  const isErr = !span.success;
  const isSlow = span.success && span.duration > 0 && (span.actualDuration / span.duration) > 0.7;
  
  let theme = {
    ring: 'ring-indigo-500/30',
    border: 'border-indigo-100',
    bg: 'bg-white',
    icon: <Cpu size={14} className="text-indigo-600" />,
    serviceBg: 'bg-indigo-50',
    serviceText: 'text-indigo-600',
    bar: 'bg-indigo-500'
  };
  if (isErr) {
    theme = {
      ring: 'ring-rose-500/30',
      border: 'border-rose-200',
      bg: 'bg-rose-50/40',
      icon: <ShieldAlert size={14} className="text-rose-600" />,
      serviceBg: 'bg-rose-100',
      serviceText: 'text-rose-700',
      bar: 'bg-rose-500'
    };
  } else if (isSlow) {
    theme = {
      ring: 'ring-amber-500/30',
      border: 'border-amber-200',
      bg: 'bg-amber-50/40',
      icon: <Clock size={14} className="text-amber-600" />,
      serviceBg: 'bg-amber-100',
      serviceText: 'text-amber-700',
      bar: 'bg-amber-500'
    };
  }

  const pct = totalDuration > 0 ? Math.max((span.duration / totalDuration) * 100, 1.5) : 0;

  return (
    <div className={`group relative flex flex-col rounded-[20px] border backdrop-blur-md shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]
      hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden
      ${theme.bg} ${theme.border}
      ${selected ? `ring-[3px] ring-offset-2 ${theme.ring} border-transparent` : ''}`}
      style={{ width: NODE_W, height: NODE_H }}>

      <div className="flex flex-1 flex-col justify-between p-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">{theme.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-tight text-neutral-800" title={span.methodName}>
              {span.methodName ?? '?'}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-400" title={span.className}>
              {span.className ?? ''}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`max-w-[82px] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.serviceBg} ${theme.serviceText}`}>
            {span.serviceName ?? 'UNKNOWN'}
          </span>
          <div className="flex flex-col items-end">
            <span className={`font-mono text-sm font-black tracking-tight ${isErr ? 'text-rose-600' : 'text-neutral-700'}`}>
              {fmtDuration(span.duration)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Progress bar at the absolute bottom */}
      <div className="h-1 bg-neutral-100 w-full relative z-10 opacity-70 group-hover:opacity-100 transition-opacity">
        <div className={`h-full ${theme.bar} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
};

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

// ==================== Trace Flow Diagram ====================

const TraceFlowDiagram: React.FC<{ detail: TraceDetailVO }> = ({ detail }) => {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const getSpanKey = (span: SpanNodeType) => span.id ?? `${span.className}-${span.methodName}-${span.startTime}`;

  const { allNodes, allEdges, totalW, totalH } = useMemo(() => {
    const spanRoots = Array.isArray(detail.spanTree) ? detail.spanTree : [];
    let tw = 0;
    const roots: LayoutNode[] = [];
    for (const root of spanRoots) {
      const ln = layoutNode(root, tw, 0);
      roots.push(ln);
      tw += subtreeWidth(root) + GAP_H;
    }
    tw = Math.max(tw - GAP_H, NODE_W);
    const flat = roots.flatMap(flattenNodes);
    const maxY = flat.reduce((m, n) => Math.max(m, n.y), 0);
    const edges = roots.flatMap(collectEdges);
    return { allNodes: flat, allEdges: edges, totalW: tw, totalH: maxY + NODE_H };
  }, [detail.spanTree]);

  const svgW = totalW + PAD * 2;
  const svgH = totalH + PAD * 2;

  // Zoom & Pan state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const wasDraggingRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const recenter = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth } = containerRef.current;
    setOffset({
      x: (clientWidth - svgW) / 2,
      y: 32,
    });
  }, [svgW]);

  useEffect(() => {
    recenter();
    setScale(1);
  }, [recenter, svgH]);

  useEffect(() => {
    window.addEventListener('resize', recenter);
    return () => window.removeEventListener('resize', recenter);
  }, [recenter]);

  // Drag-to-pan: use window-level mousemove/mouseup so drag works even outside canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = offset.x;
    const initY = offset.y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        moved = true;
        setIsDragging(true);
      }
      if (moved) {
        setOffset({ x: initX + dx, y: initY + dy });
      }
    };

    const onUp = () => {
      wasDraggingRef.current = moved;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const zoomIn = () => setScale(s => Math.min(s + 0.15, 2.5));
  const zoomOut = () => setScale(s => Math.max(s - 0.15, 0.2));
  const zoomReset = () => {
    setScale(1);
    recenter();
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Only scale if using wheel.
    // NOTE: do not call preventDefault here directly because React wheel events are passive.
    // The passive false listener in useEffect handles the preventDefault.
    e.stopPropagation();
    
    // Zoom sensitivity
    const zoomFactor = -e.deltaY * 0.001;
    let newScale = scale + zoomFactor;
    newScale = Math.min(Math.max(0.2, newScale), 2.5);

    // Zoom towards mouse pointer
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate how far the mouse is into the scaled canvas
      const xRatio = (mouseX - offset.x) / scale;
      const yRatio = (mouseY - offset.y) / scale;

      // New offsets based on mouse position
      const newOffsetX = mouseX - (xRatio * newScale);
      const newOffsetY = mouseY - (yRatio * newScale);

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
  };

  // Prevent default scroll behavior when wheeling on canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const selectedSpan = selectedId != null
    ? allNodes.find(n => getSpanKey(n.span) === selectedId)?.span ?? null
    : null;

  const summary = detail.summary;

  return (
    <div className="space-y-5">
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
            <span><strong className="text-black">{fmtDuration(detail.totalDuration)}</strong> 总耗时</span>
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
        <div className="mt-2 text-[11px] text-neutral-400">拖动画布，滚轮缩放，点击节点查看详情</div>
      </div>

      {/* Flow diagram canvas */}
      <div ref={containerRef}
        className={`relative h-[580px] overflow-hidden rounded-2xl border border-neutral-200/80 bg-[#fafafa] select-none
          ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} md:h-[680px] 2xl:h-[780px]`}
        style={{ backgroundImage: 'radial-gradient(#e5e5e5 1px, transparent 1px)', backgroundSize: `${20 * scale}px ${20 * scale}px`, backgroundPosition: `${offset.x}px ${offset.y}px` }}
        onMouseDown={handleCanvasMouseDown}
        onClick={() => setSelectedId(null)}
        onWheel={handleWheel}>

        <div
          className="absolute right-3 top-3 z-20 flex flex-col gap-1 rounded-xl border border-neutral-200/60 bg-white/92 p-1.5 shadow-sm backdrop-blur-md"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} className="rounded-lg p-2 text-neutral-500 transition-all hover:bg-neutral-100 hover:text-black" title="放大"><ZoomIn size={16}/></button>
          <button onClick={(e) => { e.stopPropagation(); zoomReset(); }} className="rounded-lg p-2 text-neutral-500 transition-all hover:bg-neutral-100 hover:text-black" title="重置"><Focus size={16}/></button>
          <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} className="rounded-lg p-2 text-neutral-500 transition-all hover:bg-neutral-100 hover:text-black" title="缩小"><ZoomOut size={16}/></button>
          <div className="text-[9px] font-mono text-neutral-400 text-center py-1 font-bold">{Math.round(scale * 100)}%</div>
        </div>

        {/* Transform Layer */}
        {allNodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-300">
            <GitBranch size={30} strokeWidth={1} />
            <span className="text-sm">暂无可渲染的调用链节点</span>
          </div>
        ) : (
          <div className="absolute top-0 left-0 origin-top-left transition-transform duration-75"
            style={{ width: svgW, height: svgH, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            
            {/* SVG connector layer */}
            <svg className="absolute inset-0 pointer-events-none" width={svgW} height={svgH}>
              <defs>
                <marker id="flow-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" className="fill-indigo-400" />
                </marker>
                <marker id="flow-arrow-err" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" className="fill-red-400" />
                </marker>
              </defs>
              {allEdges.map((e, i) => {
                const childSpan = allNodes.find(n =>
                  Math.abs(n.x + NODE_W / 2 - e.cx) < 1 && Math.abs(n.y - e.cy) < 1
                )?.span;
                const isErr = childSpan && !childSpan.success;
                return (
                  <path key={i}
                    d={connectorPath({ px: e.px + PAD, py: e.py + PAD, cx: e.cx + PAD, cy: e.cy + PAD })}
                    fill="none"
                    className={isErr ? 'stroke-red-300' : 'stroke-indigo-300'}
                    strokeWidth="2.5"
                    strokeDasharray={isErr ? '6 4' : 'none'}
                    markerEnd={isErr ? 'url(#flow-arrow-err)' : 'url(#flow-arrow)'} 
                    style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.05))' }} />
                );
              })}
            </svg>

            {allNodes.map((node) => {
              const spanKey = getSpanKey(node.span);
              return (
                <div key={spanKey}
                  className="absolute transition-all duration-200"
                  style={{ left: node.x + PAD, top: node.y + PAD }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (wasDraggingRef.current) return;
                    setSelectedId(prev => prev === spanKey ? null : spanKey);
                  }}>
                  <FlowNodeCard span={node.span} totalDuration={detail.totalDuration}
                    selected={selectedId === spanKey} />
                </div>
              );
            })}
          </div>
        )}
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
                            className="p-1 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-all"
                            title="查看调用链路">
                            <GitBranch size={14} />
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
                        {r.requestUri ?? '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.success === true && <CheckCircle size={13} className="text-emerald-500" />}
                        {r.success === false && <XCircle size={13} className="text-red-500" />}
                        {r.success == null && <Activity size={13} className="text-neutral-300" />}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-400 font-mono text-[11px]">
                        {r.duration != null ? `${r.duration}ms` : '-'}
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

