/**
 * 知识图谱 / 本体 schema 共用的 Canvas 2D 渲染引擎（纯 TS，无 React）。
 *
 * 性能设计（针对参考项目 neural-creator-dashboard 的四个瓶颈）：
 * 1. 发光节点预渲染成 offscreen 精灵（按 颜色×半径桶 缓存），绘制用 drawImage，
 *    杜绝"每帧每节点 createRadialGradient"；
 * 2. 静态层（背景/边/节点/标签）只在 pan/zoom/hover/数据变化时重绘；
 *    脉冲/选中环画在独立动态层 canvas 上，无动画时 rAF 完全停止；
 * 3. 布局由外部一次算好（径向环 / dagre），引擎零物理循环；
 * 4. 视口裁剪 + LOD（低缩放隐藏标签）、DPR≤2。
 */

import { CANVAS } from './graphPalette';

// ───────────────────────── 数据结构 ─────────────────────────

export interface EngineNode {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  color: string;
  /** orb 半径（世界坐标 px） */
  r: number;
  /** card 尺寸 */
  w: number;
  h: number;
  /** card 顶部强调条颜色（缺省 color） */
  accent?: string;
  /** card 第二行小字 */
  meta?: string;
  /** card 右上角徽章 */
  badge?: string;
  focus?: boolean;
  hidden?: boolean;
}

export interface EngineEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  arrow?: boolean;
  /** 平行边弯曲偏移（世界坐标 px，垂直于连线方向） */
  curve?: number;
  /** 层级边（父类）：更弱化、无箭头 */
  hierarchy?: boolean;
  /** 强制高亮（如本体页选中关系类型的所有边） */
  emphasis?: boolean;
  hidden?: boolean;
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export type NodeStyle = 'orb' | 'card';

// ───────────────────────── 精灵缓存 ─────────────────────────

const SPRITE_SS = 2; // 2x 超采样，保证 DPR=2 下清晰

class SpriteCache {
  private orbs = new Map<string, HTMLCanvasElement>();
  private pulses = new Map<string, HTMLCanvasElement>();

  /** 发光圆点：浅色底上的柔和辉光 + 白芯到类型色的径向渐变球体 */
  orb(color: string, r: number): HTMLCanvasElement {
    const rb = Math.max(3, Math.round(r * 2) / 2); // 半径按 0.5px 分桶
    const key = `${color}|${rb}`;
    const hit = this.orbs.get(key);
    if (hit) return hit;

    const glow = 4.2;
    const size = Math.ceil(rb * glow * 2) + 4;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * SPRITE_SS);
    const ctx = c.getContext('2d')!;
    ctx.scale(SPRITE_SS, SPRITE_SS);
    const cx = size / 2;

    // 辉光（浅底用半透明同色晕染，不用加法混合避免发白）
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, rb * glow);
    g.addColorStop(0, color + '2e');
    g.addColorStop(0.45, color + '16');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cx, rb * glow, 0, Math.PI * 2);
    ctx.fill();

    // 球体（白高光 → 类型色 → 深色收边，有"实体感"）
    const b = ctx.createRadialGradient(cx - rb * 0.32, cx - rb * 0.34, 0, cx, cx, rb * 1.05);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(0.28, color);
    b.addColorStop(0.8, color);
    b.addColorStop(1, color + 'cc');
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(cx, cx, rb, 0, Math.PI * 2);
    ctx.fill();
    // 高光点
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - rb * 0.3, cx - rb * 0.32, rb * 0.3, 0, Math.PI * 2);
    ctx.fill();

    this.orbs.set(key, c);
    return c;
  }

  /** 脉冲光点（屏幕尺寸固定） */
  pulse(color: string): HTMLCanvasElement {
    const hit = this.pulses.get(color);
    if (hit) return hit;
    const size = 22;
    const c = document.createElement('canvas');
    c.width = c.height = size * SPRITE_SS;
    const ctx = c.getContext('2d')!;
    ctx.scale(SPRITE_SS, SPRITE_SS);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, color);
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    this.pulses.set(color, c);
    return c;
  }
}

// ───────────────────────── 视图变换 ─────────────────────────

export const worldToScreen = (v: ViewTransform, x: number, y: number): [number, number] => [
  x * v.k + v.x,
  y * v.k + v.y,
];

export const screenToWorld = (v: ViewTransform, sx: number, sy: number): [number, number] => [
  (sx - v.x) / v.k,
  (sy - v.y) / v.k,
];

/** 计算适配视图（含 padding 的 bounds→transform） */
export const fitView = (
  nodes: EngineNode[],
  w: number,
  h: number,
  maxK = 1.4,
  minK = 0.14,
): ViewTransform => {
  const visible = nodes.filter(n => !n.hidden);
  if (visible.length === 0) return { x: w / 2, y: h / 2, k: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of visible) {
    const rr = Math.max(n.r, Math.max(n.w, n.h) / 2) + 26;
    minX = Math.min(minX, n.x - rr); minY = Math.min(minY, n.y - rr);
    maxX = Math.max(maxX, n.x + rr); maxY = Math.max(maxY, n.y + rr);
  }
  const pad = 46;
  const k = Math.min(maxK, Math.max(minK, Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1))));
  return {
    k,
    x: w / 2 - ((minX + maxX) / 2) * k,
    y: h / 2 - ((minY + maxY) / 2) * k,
  };
};

// ───────────────────────── 边几何 ─────────────────────────

export interface EdgeGeo {
  from: [number, number];
  to: [number, number];
  ctrl: [number, number];
}

const edgeGeoRaw = (a: EngineNode, b: EngineNode, curve: number): EdgeGeo => {
  const from: [number, number] = [a.x, a.y];
  const to: [number, number] = [b.x, b.y];
  const ctrl: [number, number] = [
    (from[0] + to[0]) / 2 - (to[1] - from[1]) * curve,
    (from[1] + to[1]) / 2 + (to[0] - from[0]) * curve,
  ];
  return { from, to, ctrl };
};

/** 二次贝塞尔取点 */
const qPoint = (g: EdgeGeo, u: number): [number, number] => {
  const iu = 1 - u;
  return [
    iu * iu * g.from[0] + 2 * iu * u * g.ctrl[0] + u * u * g.to[0],
    iu * iu * g.from[1] + 2 * iu * u * g.ctrl[1] + u * u * g.to[1],
  ];
};

/** 端点裁剪：沿线推进到节点边界外（orb 用半径，card 用矩形），保留原曲率 */
const trimEnds = (g: EdgeGeo, a: EngineNode, b: EngineNode, style: NodeStyle, curve: number): EdgeGeo => {
  const clipAt = (from: [number, number], to: [number, number], n: EngineNode): [number, number] => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    let t = 1;
    if (style === 'card') {
      const hw = n.w / 2 + 4, hh = n.h / 2 + 4;
      if (Math.abs(dx) > 1e-6) t = Math.min(t, hw / Math.abs(dx));
      if (Math.abs(dy) > 1e-6) t = Math.min(t, hh / Math.abs(dy));
    } else {
      const len = Math.hypot(dx, dy) || 1;
      t = Math.min(t, (n.r + 3) / len);
    }
    return [from[0] + dx * t, from[1] + dy * t];
  };
  // 用原端点向控制点方向裁剪
  const newFrom = clipAt(g.from, g.ctrl, a);
  const newTo = clipAt(g.to, g.ctrl, b);
  const ctrl: [number, number] = [
    (newFrom[0] + newTo[0]) / 2 - (newTo[1] - newFrom[1]) * curve,
    (newFrom[1] + newTo[1]) / 2 + (newTo[0] - newFrom[0]) * curve,
  ];
  return { from: newFrom, to: newTo, ctrl };
};

const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
};

// ───────────────────────── 绘制上下文 ─────────────────────────

export interface DrawState {
  ctx: CanvasRenderingContext2D;
  view: ViewTransform;
  w: number;
  h: number;
  dpr: number;
  nodes: EngineNode[];
  edges: EngineEdge[];
  nodeById: Map<string, EngineNode>;
  sprites: SpriteCache;
  style: NodeStyle;
  /** hover/选中的邻域（null=无强调态） */
  emphasis: Set<string> | null;
  hoverId: string | null;
  selectedId: string | null;
  focusId: string | null;
  labelsAll: boolean;   // LOD：是否显示全部标签
  /** 需要绘制的关系标签边 id 集合（card 风格 schema 用；null=按 emphasis 规则） */
  now: number;
}

/** 1 跳邻域（含自身） */
export const neighborhood = (nodeById: Map<string, EngineNode>, edges: EngineEdge[], centerId: string): Set<string> => {
  const set = new Set([centerId]);
  for (const e of edges) {
    if (e.hidden) continue;
    if (e.source === centerId) set.add(e.target);
    else if (e.target === centerId) set.add(e.source);
  }
  return set;
};

// ───────────────────────── 静态层绘制 ─────────────────────────

let dotPattern: CanvasPattern | null = null;
const getDotPattern = (ctx: CanvasRenderingContext2D): CanvasPattern => {
  if (dotPattern) return dotPattern;
  const tile = document.createElement('canvas');
  tile.width = tile.height = CANVAS.dotGrid;
  const tctx = tile.getContext('2d')!;
  tctx.fillStyle = CANVAS.dot;
  tctx.beginPath();
  tctx.arc(CANVAS.dotGrid / 2, CANVAS.dotGrid / 2, 1.1, 0, Math.PI * 2);
  tctx.fill();
  dotPattern = ctx.createPattern(tile, 'repeat')!;
  return dotPattern;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawEdgeLabel = (ctx: CanvasRenderingContext2D, text: string, sx: number, sy: number, alpha = 1) => {
  ctx.font = `600 10.5px ${CANVAS.fontFamily}`;
  const tw = ctx.measureText(text).width;
  const px = 8, py = 4;
  ctx.globalAlpha = alpha;
  roundRect(ctx, sx - tw / 2 - px, sy - 8 - py, tw + px * 2, 16 + py, 8);
  ctx.fillStyle = 'rgba(8,9,12,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,236,233,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = CANVAS.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx, sy - 7);
  ctx.globalAlpha = 1;
};

export const drawStatic = (ds: DrawState) => {
  const { ctx, view, w, h, dpr } = ds;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 背景底色 + 网格点
  ctx.fillStyle = CANVAS.bg;
  ctx.fillRect(0, 0, w, h);
  const pat = getDotPattern(ctx);
  ctx.save();
  ctx.translate(view.x % CANVAS.dotGrid, view.y % CANVAS.dotGrid);
  ctx.fillStyle = pat;
  ctx.fillRect(-CANVAS.dotGrid, -CANVAS.dotGrid, w + CANVAS.dotGrid * 2, h + CANVAS.dotGrid * 2);
  ctx.restore();
  // 边（世界→屏幕一次性算好，裁剪离屏）
  for (const e of ds.edges) {
    if (e.hidden) continue;
    const a = ds.nodeById.get(e.source), b = ds.nodeById.get(e.target);
    if (!a || !b || a.hidden || b.hidden) continue;
    const geo = edgeGeoRaw(a, b, e.curve ?? 0);
    const trimmed = trimEnds(geo, a, b, ds.style, e.curve ?? 0);
    const [x1, y1] = worldToScreen(view, trimmed.from[0], trimmed.from[1]);
    const [x2, y2] = worldToScreen(view, trimmed.to[0], trimmed.to[1]);
    const [cx0, cy0] = worldToScreen(view, trimmed.ctrl[0], trimmed.ctrl[1]);
    const m = 80;
    if ((x1 < -m && x2 < -m) || (x1 > w + m && x2 > w + m) || (y1 < -m && y2 < -m) || (y1 > h + m && y2 > h + m)) continue;

    const emph = ds.emphasis;
    const isHlEdge = e.emphasis === true || (!!emph && emph.has(e.source) && emph.has(e.target));
    const on = !emph || isHlEdge;
    // 透明度全部烘焙进 rgba 字符串，避免 globalAlpha 状态泄漏
    let stroke: string;
    let alpha: number;
    if (e.hierarchy) {
      alpha = on ? 0.4 : 0.14;
      stroke = `rgba(113,113,122,${alpha})`;
    } else if (isHlEdge) {
      alpha = CANVAS.edgeHl;
      stroke = e.color ?? `rgba(${CANVAS.edgeBase},${alpha})`;
    } else {
      alpha = on ? CANVAS.edgeDim : CANVAS.edgeDim * 0.25;
      stroke = `rgba(${CANVAS.edgeBase},${alpha})`;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx0, cy0, x2, y2);
    if (e.dashed || e.hierarchy) ctx.setLineDash([4, 5]);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isHlEdge && !e.hierarchy ? 1.6 : 1.1;
    ctx.stroke();
    ctx.setLineDash([]);

    // 箭头（世界尺寸，随缩放）
    if (e.arrow !== false && !e.hierarchy) {
      const dx = x2 - cx0, dy = y2 - cy0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const s = 5.5 * view.k;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ux * s - uy * s * 0.5, y2 - uy * s + ux * s * 0.5);
      ctx.lineTo(x2 - ux * s + uy * s * 0.5, y2 - uy * s - ux * s * 0.5);
      ctx.closePath();
      ctx.fillStyle = isHlEdge ? (e.color ?? `rgba(${CANVAS.edgeBase},${CANVAS.edgeHl})`) : `rgba(${CANVAS.edgeBase},${alpha + 0.08})`;
      ctx.fill();
    }

    // 关系标签：card 风格常显（缩放足够时），orb 风格仅高亮边显示
    if (e.label && !e.hierarchy) {
      const show = ds.style === 'card'
        ? (ds.labelsAll ? true : isHlEdge)
        : isHlEdge;
      if (show) {
        const [mx, my] = worldToScreen(view, ...qPoint(trimmed, 0.5));
        drawEdgeLabel(ctx, e.label, mx, my, on ? 1 : 0.45);
      }
    }
  }

  // 节点
  const m2 = 120;
  for (const n of ds.nodes) {
    if (n.hidden) continue;
    const [sx, sy] = worldToScreen(view, n.x, n.y);
    const ext = ds.style === 'orb' ? n.r * 3.6 * view.k : Math.max(n.w, n.h) * view.k;
    if (sx < -m2 - ext || sx > w + m2 + ext || sy < -m2 - ext || sy > h + m2 + ext) continue;

    const emph = ds.emphasis;
    const on = !emph || emph.has(n.id);
    // 卡片在强调态下也保持可读：非邻域压到 0.5 而不是 0.22
    ctx.globalAlpha = on ? 1 : ds.style === 'card' ? 0.5 : 0.22;

    if (ds.style === 'orb') {
      const sprite = ds.sprites.orb(n.color, n.r);
      const drawR = n.r * 4.2 * view.k + 2;
      const d = drawR * 2;
      ctx.drawImage(sprite, sx - drawR, sy - drawR, d, d);
      // 焦点实体：金色双环
      if (n.focus) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = CANVAS.focusRing;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, (n.r + 9) * view.k, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(sx, sy, (n.r + 16) * view.k, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = on ? 1 : 0.22;
      }
      // 标签：始终放在球体外（下方），避免与焦点环重叠
      const showLabel = (ds.labelsAll && (n.r >= 5 || emph?.has(n.id))) || n.focus || n.id === ds.hoverId || n.id === ds.selectedId || emph?.has(n.id);
      if (showLabel && view.k > 0.42) {
        ctx.font = `700 11px ${CANVAS.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const ly = sy + (n.r + 9) * view.k + 5;
        const tw = ctx.measureText(n.label).width;
        roundRect(ctx, sx - tw / 2 - 5, ly - 2, tw + 10, 15, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(23,23,23,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = n.focus || n.id === ds.selectedId ? CANVAS.focusRing : emph?.has(n.id) ? CANVAS.label : CANVAS.labelSub;
        ctx.fillText(n.label, sx, ly + 2);
      }
    } else {
      // card：圆角卡片 + 顶部强调条
      const cw = n.w * view.k, ch = n.h * view.k;
      const x0 = sx - cw / 2, y0 = sy - ch / 2;
      const isSel = n.id === ds.selectedId;
      const isHover = n.id === ds.hoverId;
      roundRect(ctx, x0, y0, cw, ch, 11 * view.k);
      ctx.fillStyle = CANVAS.cardFill;
      ctx.fill();
      ctx.strokeStyle = isSel ? CANVAS.selectRing : isHover ? CANVAS.cardHover : (n.accent ?? n.color) + '55';
      ctx.lineWidth = isSel ? 1.6 : 1;
      ctx.stroke();
      // 顶部强调条
      ctx.save();
      roundRect(ctx, x0, y0, cw, ch, 11 * view.k);
      ctx.clip();
      ctx.fillStyle = (n.accent ?? n.color) + 'cc';
      ctx.fillRect(x0, y0, cw, 3.5 * Math.max(0.7, view.k));
      ctx.restore();
      // 文本（缩放过小时只画名称）
      if (view.k > 0.55) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 13px ${CANVAS.fontFamily}`;
        ctx.fillStyle = CANVAS.label;
        ctx.fillText(n.label, x0 + 13 * view.k, y0 + ch * 0.4);
        if (n.meta) {
          ctx.font = `500 10px ${CANVAS.fontFamily}`;
          ctx.fillStyle = CANVAS.labelMuted;
          ctx.fillText(n.meta, x0 + 13 * view.k, y0 + ch * 0.68);
        }
        if (n.badge) {
          ctx.font = `700 9px ${CANVAS.fontFamily}`;
          const tw = ctx.measureText(n.badge).width;
          const bx = x0 + cw - tw - 16 * view.k, by = y0 + 8 * view.k;
          roundRect(ctx, bx - 5, by - 1, tw + 10, 13, 6.5);
          ctx.fillStyle = (n.accent ?? n.color) + '22';
          ctx.fill();
          ctx.fillStyle = (n.accent ?? n.color) + 'dd';
          ctx.textAlign = 'left';
          ctx.fillText(n.badge, bx, by + 6);
        }
      } else {
        ctx.font = `700 11px ${CANVAS.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = CANVAS.label;
        ctx.fillText(n.label, sx, sy);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 选中 orb 节点：静止金环（动画关闭时由静态层负责）
  if (ds.style === 'orb' && ds.selectedId) {
    const n = ds.nodeById.get(ds.selectedId);
    if (n && !n.hidden) {
      const [sx, sy] = worldToScreen(view, n.x, n.y);
      ctx.strokeStyle = CANVAS.selectRing;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx, sy, (n.r + 5) * view.k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 浅色暗角（极轻微，保持边缘层次）
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(244,244,245,0)');
  vg.addColorStop(1, 'rgba(228,228,231,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
};

// ───────────────────────── 动态层绘制（脉冲 / 选中旋转环） ─────────────────────────

export const drawDynamic = (ds: DrawState, animating: boolean) => {
  const { ctx, view, w, h, dpr, now } = ds;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (animating) {
    ctx.globalCompositeOperation = 'lighter';
    for (const e of ds.edges) {
      if (e.hidden || e.hierarchy) continue;
      const a = ds.nodeById.get(e.source), b = ds.nodeById.get(e.target);
      if (!a || !b || a.hidden || b.hidden) continue;
      const [ax, ay] = worldToScreen(view, a.x, a.y);
      const [bx, by] = worldToScreen(view, b.x, b.y);
      const m = 40;
      if ((ax < -m && bx < -m) || (ax > w + m && bx > w + m) || (ay < -m && by < -m) || (ay > h + m && by > h + m)) continue;

      const emph = ds.emphasis;
      const on = !emph || (emph.has(e.source) && emph.has(e.target));
      const speed = 0.09;
      const u = ((now / 1000) * speed + hash01(e.id)) % 1;
      const [px, py] = worldToScreen(view, ...qPoint(edgeGeoRaw(a, b, e.curve ?? 0), u));
      const alpha = Math.sin(u * Math.PI) * (on ? 0.8 : 0.15);
      const sprite = ds.sprites.pulse(e.color ?? '#cdd0cc');
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, px - 11, py - 11, 22, 22);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 选中节点：旋转虚线环
    const sn = ds.selectedId ? ds.nodeById.get(ds.selectedId) : null;
    if (sn && !sn.hidden) {
      const [sx, sy] = worldToScreen(view, sn.x, sn.y);
      ctx.strokeStyle = CANVAS.selectRing;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -now * 0.02;
      ctx.beginPath();
      if (ds.style === 'orb') ctx.arc(sx, sy, (sn.r + 5) * view.k, 0, Math.PI * 2);
      else {
        const cw = sn.w * view.k / 2 + 5, ch = sn.h * view.k / 2 + 5;
        roundRect(ctx, sx - cw, sy - ch, cw * 2, ch * 2, 12);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }
};

// ───────────────────────── 命中检测 ─────────────────────────

export const hitTestNode = (ds: Pick<DrawState, 'view' | 'nodes' | 'nodeById' | 'style'>, sx: number, sy: number): EngineNode | null => {
  const [wx, wy] = screenToWorld(ds.view, sx, sy);
  let best: EngineNode | null = null;
  let bestD = Infinity;
  for (const n of ds.nodes) {
    if (n.hidden) continue;
    if (ds.style === 'orb') {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= Math.max(n.r + 5 / ds.view.k, 9 / ds.view.k) && d < bestD) { best = n; bestD = d; }
    } else {
      if (Math.abs(n.x - wx) <= n.w / 2 + 4 && Math.abs(n.y - wy) <= n.h / 2 + 4) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d < bestD) { best = n; bestD = d; }
      }
    }
  }
  return best;
};

export const hitTestEdge = (ds: Pick<DrawState, 'view' | 'edges' | 'nodeById'>, sx: number, sy: number): EngineEdge | null => {
  const [wx, wy] = screenToWorld(ds.view, sx, sy);
  const tol = 7 / ds.view.k;
  let best: EngineEdge | null = null;
  let bestD = Infinity;
  for (const e of ds.edges) {
    if (e.hidden || e.hierarchy) continue;
    const a = ds.nodeById.get(e.source), b = ds.nodeById.get(e.target);
    if (!a || !b || a.hidden || b.hidden) continue;
    const geo = edgeGeoRaw(a, b, e.curve ?? 0);
    for (let i = 0; i <= 16; i++) {
      const [px, py] = qPoint(geo, i / 16);
      const d = Math.hypot(px - wx, py - wy);
      if (d < tol && d < bestD) { best = e; bestD = d; }
    }
  }
  return best;
};

// ───────────────────────── 布局：全局分簇（全量实体图） ─────────────────────────

export interface GlobalNodeInput {
  id: string;
  name: string;
  type?: string;
}

/**
 * 全局图谱布局：类型分簇成网格星座，簇内节点螺旋散布；
 * 跨簇边自动弯曲错开；确定性（同数据同布局），零物理循环。
 */
export const globalClusterLayout = <T extends GlobalNodeInput>(
  nodes: T[],
  edges: { source: string; target: string; relation?: string }[],
  colorOf: (type?: string) => string,
): { nodes: EngineNode[]; edges: EngineEdge[] } => {
  // 度数
  const degree = new Map<string, number>(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // 按类型分簇（簇按簇大小降序排成网格）
  const byType = new Map<string, T[]>();
  for (const n of nodes) {
    const t = n.type || '未分类';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(n);
  }
  const clusters = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
  const cols = Math.max(1, Math.ceil(Math.sqrt(clusters.length)));

  const engineNodes: EngineNode[] = [];
  const NODE_GAP = 110;
  clusters.forEach(([type, list], ci) => {
    const col = ci % cols, row = Math.floor(ci / cols);
    // 簇内螺旋半径
    const clusterR = Math.max(130, Math.sqrt(list.length) * NODE_GAP * 0.58);
    const centerX = col * (clusterR * 1.7 + 240);
    const centerY = row * (clusterR * 1.7 + 240);
    // 簇内按度数降序（枢纽靠中心）
    const sorted = [...list].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    sorted.forEach((n, i) => {
      const deg = degree.get(n.id) ?? 0;
      let x = centerX, y = centerY;
      if (i > 0) {
        const ang = i * 2.39996 + hash01(n.id) * 0.5; // 黄金角螺旋
        const rr = Math.sqrt(i) * NODE_GAP * 0.46 + hash01('r' + n.id) * 16;
        x = centerX + Math.cos(ang) * rr;
        y = centerY + Math.sin(ang) * rr * 0.88;
      }
      engineNodes.push({
        id: n.id,
        label: n.name,
        sublabel: type,
        x, y,
        color: colorOf(type),
        r: Math.min(22, 5 + Math.sqrt(deg) * 2.6),
        w: 0, h: 0,
      });
    });
  });

  // 平行边弯曲错开
  const pairCount = new Map<string, number>();
  const engineEdges: EngineEdge[] = edges.map((e, i) => {
    const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    const idx = pairCount.get(key) ?? 0;
    pairCount.set(key, idx + 1);
    return {
      id: `${e.source}->${e.target}#${i}`,
      source: e.source,
      target: e.target,
      label: e.relation,
      arrow: true,
      curve: (idx - 0.5) * 0.14,
    };
  });

  return { nodes: engineNodes, edges: engineEdges };
};

// ───────────────────────── 布局：径向同心环（图谱子图，保留给检查器"聚焦"） ─────────────────────────

export interface RadialNodeInput {
  id: string;
  name: string;
  type?: string;
}

/** BFS 深度分环：focus 居中，1 跳按类型聚扇区，外环角度 hash；返回世界坐标 */
export const radialLayout = <T extends RadialNodeInput>(
  nodes: T[],
  edges: { source: string; target: string }[],
  focusId: string | null,
  colorOf: (type?: string) => string,
): { nodes: EngineNode[]; edges: EngineEdge[] } => {
  // 邻接 & 度数
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const degree = new Map<string, number>(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  // BFS 深度（≤3）
  const depth = new Map<string, number>();
  if (focusId) {
    depth.set(focusId, 0);
    const q = [focusId];
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of adj.get(cur) ?? []) {
        if (!depth.has(nx)) { depth.set(nx, (depth.get(cur) ?? 0) + 1); q.push(nx); }
      }
    }
  }

  // 1 跳节点按类型聚扇区
  const hop1 = nodes.filter(n => depth.get(n.id) === 1);
  const sectors = new Map<string, typeof hop1>();
  for (const n of hop1) {
    const t = n.type || '未分类';
    if (!sectors.has(t)) sectors.set(t, []);
    sectors.get(t)!.push(n);
  }
  const sectorAngle = new Map<string, { start: number; span: number }>();
  {
    const total = Math.max(1, hop1.length);
    let a = -Math.PI / 2;
    for (const [t, list] of sectors) {
      const span = (list.length / total) * Math.PI * 2;
      sectorAngle.set(t, { start: a, span });
      a += span;
    }
  }

  const ringR = [0, 320, 620, 920];
  const engineNodes: EngineNode[] = nodes.map(n => {
    const d = Math.min(3, depth.get(n.id) ?? 3);
    const deg = degree.get(n.id) ?? 0;
    let x = 0, y = 0;
    if (d === 0) {
      x = 0; y = 0;
    } else {
      const R = ringR[d] * (0.88 + hash01(n.id) * 0.24);
      let ang: number;
      const sec = sectorAngle.get(n.type || '未分类');
      if (d === 1 && sec) {
        const list = sectors.get(n.type || '未分类')!;
        const idx = list.findIndex(x2 => x2.id === n.id);
        ang = sec.start + (sec.span * (idx + 0.5)) / list.length + (hash01('j' + n.id) - 0.5) * 0.22;
      } else {
        ang = hash01(n.id) * Math.PI * 2;
      }
      x = Math.cos(ang) * R;
      y = Math.sin(ang) * R;
    }
    const isFocus = n.id === focusId;
    return {
      id: n.id,
      label: n.name,
      sublabel: n.type,
      x, y,
      color: colorOf(n.type),
      r: isFocus ? Math.max(26, 13 + Math.sqrt(deg) * 2.8) : Math.min(20, 7 + Math.sqrt(deg) * 2.8),
      w: 0, h: 0,
      focus: isFocus,
    };
  });

  const engineEdges: EngineEdge[] = edges.map((e, i) => ({
    id: `${e.source}->${e.target}#${i}`,
    source: e.source,
    target: e.target,
    label: (e as { relation?: string }).relation,
    arrow: true,
    curve: 0,
  }));

  return { nodes: engineNodes, edges: engineEdges };
};

export { SpriteCache, edgeGeoRaw, qPoint, hash01 };
