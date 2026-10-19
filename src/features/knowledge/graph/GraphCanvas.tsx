import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import {
  SpriteCache, drawDynamic, drawStatic, fitView, hitTestEdge, hitTestNode, neighborhood,
  type DrawState, type EngineEdge, type EngineNode, type NodeStyle, type ViewTransform,
} from './canvasEngine';

export interface GraphCanvasHandle {
  /** 适配全部可见节点 */
  fitView: () => void;
  /** 以画布中心为锚点缩放（factor>1 放大） */
  zoomBy: (factor: number) => void;
}

interface GraphCanvasProps {
  nodes: EngineNode[];
  edges: EngineEdge[];
  style?: NodeStyle;
  selectedId?: string | null;
  focusId?: string | null;
  /** 边脉冲动画（自动尊重 prefers-reduced-motion） */
  pulses?: boolean;
  /** 全量标签的最小缩放（LOD） */
  labelsMinZoom?: number;
  /** 该 key 变化时自动适配视图（传图谱子图标识 / schema 摘要） */
  autoFitKey?: string | number;
  onSelectNode?: (id: string | null) => void;
  onSelectEdge?: (id: string | null) => void;
  onDoubleClickNode?: (id: string) => void;
  onViewChange?: (zoomPercent: number) => void;
  className?: string;
}

interface RenderInputs {
  nodes: EngineNode[];
  edges: EngineEdge[];
  nodeById: Map<string, EngineNode>;
  style: NodeStyle;
  emphasis: Set<string> | null;
  hoverId: string | null;
  selectedId: string | null;
  focusId: string | null;
  labelsMinZoom: number;
}

/**
 * 双层 Canvas 图组件：静态层（背景/边/节点/标签）仅交互时重绘，
 * 动态层（脉冲/选中旋转环）仅在动画激活期间跑 rAF。
 */
const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(({
  nodes, edges, style = 'orb', selectedId = null, focusId = null, pulses = true,
  labelsMinZoom = 0.8, autoFitKey, onSelectNode, onSelectEdge, onDoubleClickNode,
  onViewChange, className = '',
}, ref) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const dynRef = useRef<HTMLCanvasElement>(null);

  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const spritesRef = useRef<SpriteCache>(new SpriteCache());

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const [inView, setInView] = useState(true);

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  /** hover 优先于 selected 决定邻域强调 */
  const emphasis = useMemo(() => {
    const center = hoverId ?? selectedId;
    if (!center || !nodeById.has(center)) return null;
    return neighborhood(nodeById, edges, center);
  }, [hoverId, selectedId, nodeById, edges]);

  // 渲染输入走 ref：rAF 循环与事件回调永远读最新值，避免闭包过期
  const inputsRef = useRef<RenderInputs>(null!);
  inputsRef.current = { nodes, edges, nodeById, style, emphasis, hoverId, selectedId, focusId, labelsMinZoom };
  const cbsRef = useRef({ onSelectNode, onSelectEdge, onDoubleClickNode, onViewChange });
  cbsRef.current = { onSelectNode, onSelectEdge, onDoubleClickNode, onViewChange };

  // ── 绘制调度 ──
  const staticRafRef = useRef(0);
  const lastZoomPctRef = useRef(0);
  const notifyView = useCallback(() => {
    const pct = Math.round(viewRef.current.k * 100);
    if (pct !== lastZoomPctRef.current) {
      lastZoomPctRef.current = pct;
      cbsRef.current.onViewChange?.(pct);
    }
  }, []);

  const drawStaticNow = useCallback(() => {
    const c = staticRef.current;
    if (!c) return;
    const inp = inputsRef.current;
    const ds: DrawState = {
      ctx: c.getContext('2d')!,
      view: viewRef.current,
      w: sizeRef.current.w,
      h: sizeRef.current.h,
      dpr: sizeRef.current.dpr,
      nodes: inp.nodes,
      edges: inp.edges,
      nodeById: inp.nodeById,
      sprites: spritesRef.current,
      style: inp.style,
      emphasis: inp.emphasis,
      hoverId: inp.hoverId,
      selectedId: inp.selectedId,
      focusId: inp.focusId,
      labelsAll: viewRef.current.k >= inp.labelsMinZoom,
      now: 0,
    };
    drawStatic(ds);
  }, []);

  const scheduleStatic = useCallback(() => {
    if (staticRafRef.current) return;
    staticRafRef.current = requestAnimationFrame(() => {
      staticRafRef.current = 0;
      drawStaticNow();
    });
  }, [drawStaticNow]);

  const drawDynamicNow = useCallback((now: number) => {
    const c = dynRef.current;
    if (!c) return;
    const inp = inputsRef.current;
    const ds: DrawState = {
      ctx: c.getContext('2d')!,
      view: viewRef.current,
      w: sizeRef.current.w,
      h: sizeRef.current.h,
      dpr: sizeRef.current.dpr,
      nodes: inp.nodes,
      edges: inp.edges,
      nodeById: inp.nodeById,
      sprites: spritesRef.current,
      style: inp.style,
      emphasis: inp.emphasis,
      hoverId: inp.hoverId,
      selectedId: inp.selectedId,
      focusId: inp.focusId,
      labelsAll: true,
      now,
    };
    drawDynamic(ds, true);
  }, []);

  // ── 动画生命周期：仅激活时跑 rAF，否则清空动态层 ──
  const animatingRef = useRef(false);
  const hasContent = nodes.length > 0 && edges.length > 0;
  const animationActive = pulses && !reducedMotion && pageVisible && inView && hasContent;
  animatingRef.current = animationActive;

  useEffect(() => {
    if (!animationActive) {
      const c = dynRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        ctx.setTransform(sizeRef.current.dpr, 0, 0, sizeRef.current.dpr, 0, 0);
        ctx.clearRect(0, 0, sizeRef.current.w, sizeRef.current.h);
      }
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      drawDynamicNow(now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animationActive, drawDynamicNow]);

  // ── 尺寸自适应 ──
  const autoFitDoneRef = useRef<unknown>(undefined);
  const tryAutoFit = useCallback(() => {
    if (autoFitKey === undefined || autoFitDoneRef.current === autoFitKey) return;
    const { w, h } = sizeRef.current;
    if (w <= 0 || inputsRef.current.nodes.length === 0) return;
    autoFitDoneRef.current = autoFitKey;
    viewRef.current = fitView(inputsRef.current.nodes, w, h);
    notifyView();
    scheduleStatic();
  }, [autoFitKey, notifyView, scheduleStatic]);

  // 首次有内容时强制适配一次（不依赖 autoFitKey 变化）；布局引用变化时重新适配（schema 编辑后）
  const firstFitRef = useRef(false);
  const lastNodesRef = useRef(nodes);
  useEffect(() => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || nodes.length === 0) return;
    if (!firstFitRef.current) {
      firstFitRef.current = true;
      viewRef.current = fitView(nodes, w, h);
      notifyView();
      scheduleStatic();
      return;
    }
    // 节点集合变化（增删/布局重算）时重新适配；仅 hover/选中态变化不触发
    if (lastNodesRef.current !== nodes) {
      lastNodesRef.current = nodes;
      viewRef.current = fitView(nodes, w, h);
      notifyView();
      scheduleStatic();
    }
  }, [nodes, notifyView, scheduleStatic]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      sizeRef.current = { w, h, dpr };
      for (const c of [staticRef.current, dynRef.current]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      tryAutoFit();
      scheduleStatic();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    // 字体加载 / 样式稳定后重新量测（首帧布局未完成时兜底）
    document.fonts?.ready.then(() => resize());
    const t1 = setTimeout(resize, 120);
    const t2 = setTimeout(resize, 600);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [scheduleStatic, tryAutoFit]);

  useEffect(() => { tryAutoFit(); }, [autoFitKey, tryAutoFit]);

  // 属性变化 → 重绘静态层
  useEffect(() => { scheduleStatic(); }, [nodes, edges, style, selectedId, focusId, hoverId, emphasis, scheduleStatic]);

  // 可见性：页面隐藏 / 滚出视口时停动画
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onRm = () => setReducedMotion(mq.matches);
    mq?.addEventListener('change', onRm);
    const wrap = wrapRef.current;
    const io = wrap ? new IntersectionObserver(([en]) => setInView(en.isIntersecting), { rootMargin: '80px' }) : null;
    io?.observe(wrap!);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener('change', onRm);
      io?.disconnect();
    };
  }, []);

  // ── 交互 ──
  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    const v = viewRef.current;
    const k = Math.min(3, Math.max(0.12, v.k * factor));
    const scale = k / v.k;
    viewRef.current = { k, x: sx - (sx - v.x) * scale, y: sy - (sy - v.y) * scale };
    notifyView();
    scheduleStatic();
  }, [notifyView, scheduleStatic]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0014));
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const dragRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const pointerPos = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const hitNodeAt = useCallback((sx: number, sy: number) => {
    const inp = inputsRef.current;
    return hitTestNode({ view: viewRef.current, nodes: inp.nodes, nodeById: inp.nodeById, style: inp.style }, sx, sy);
  }, []);
  const hitEdgeAt = useCallback((sx: number, sy: number) => {
    const inp = inputsRef.current;
    return hitTestEdge({ view: viewRef.current, edges: inp.edges, nodeById: inp.nodeById }, sx, sy);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const [sx, sy] = pointerPos(e);
    dragRef.current = { sx, sy, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [sx, sy] = pointerPos(e);
    const drag = dragRef.current;
    if (drag && (e.buttons & 1)) {
      const dx = sx - drag.sx, dy = sy - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      viewRef.current = { ...viewRef.current, x: drag.vx + dx, y: drag.vy + dy };
      wrapRef.current!.style.cursor = 'grabbing';
      scheduleStatic();
      return;
    }
    // 纯 hover：命中节点/边 → pointer，否则 grab
    const node = hitNodeAt(sx, sy);
    const edge = node ? null : hitEdgeAt(sx, sy);
    const id = node?.id ?? null;
    if (id !== hoverId) setHoverId(id);
    wrapRef.current!.style.cursor = node || edge ? 'pointer' : 'grab';
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const [sx, sy] = pointerPos(e);
    const node = hitNodeAt(sx, sy);
    if (node) {
      cbsRef.current.onSelectEdge?.(null);
      cbsRef.current.onSelectNode?.(node.id);
      return;
    }
    const edge = hitEdgeAt(sx, sy);
    if (edge) {
      cbsRef.current.onSelectNode?.(null);
      cbsRef.current.onSelectEdge?.(edge.id);
      return;
    }
    cbsRef.current.onSelectNode?.(null);
    cbsRef.current.onSelectEdge?.(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const [sx, sy] = pointerPos(e);
    const node = hitNodeAt(sx, sy);
    if (node) cbsRef.current.onDoubleClickNode?.(node.id);
  };

  useImperativeHandle(ref, () => ({
    fitView: () => {
      const { w, h } = sizeRef.current;
      if (w <= 0) return;
      viewRef.current = fitView(inputsRef.current.nodes, w, h);
      notifyView();
      scheduleStatic();
    },
    zoomBy: (factor: number) => {
      zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, factor);
    },
  }), [notifyView, scheduleStatic, zoomAt]);

  return (
    <div
      ref={wrapRef}
      className={`touch-none select-none ${className}`}
      style={{ cursor: 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={staticRef} className="absolute inset-0" />
      <canvas ref={dynRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';

export default GraphCanvas;
