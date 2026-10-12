import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, Handle, Position, MarkerType,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  Bot, Wrench, Network, UserCheck, CircleDot, AlertTriangle, ShieldCheck, GitBranch,
  Loader2, Check, X, Minus, LayoutGrid, ListOrdered,
} from 'lucide-react';
import type { PlanStep } from '../../shared/services/orrery.service';

/* ================= 布局常量 ================= */
const NODE_W = 236;
const NODE_H = 92;

/* ================= 状态视觉（与后端 StepStatus 对齐） ================= */
interface StatusVisual {
  /** 卡片边框/光晕颜色 */
  color: string;
  /** 状态徽章样式 */
  badge: string;
  label: string;
  /** 头部状态图标 */
  icon: 'spinner' | 'check' | 'x' | 'minus' | 'circle' | 'ready';
  /** 边颜色 */
  edge: string;
}

const STATUS_STYLE: Record<string, StatusVisual> = {
  PENDING:   { color: '#d4d4d4', badge: 'bg-neutral-100 text-neutral-500',   label: '待执行', icon: 'circle',  edge: '#cbd5e1' },
  READY:     { color: '#a3a3a3', badge: 'bg-neutral-100 text-neutral-600',   label: '就绪',   icon: 'ready',   edge: '#cbd5e1' },
  RUNNING:   { color: '#3b82f6', badge: 'bg-blue-50 text-blue-600',          label: '执行中', icon: 'spinner', edge: '#60a5fa' },
  SUCCEEDED: { color: '#10b981', badge: 'bg-emerald-50 text-emerald-600',    label: '完成',   icon: 'check',   edge: '#34d399' },
  FAILED:    { color: '#ef4444', badge: 'bg-red-50 text-red-600',            label: '失败',   icon: 'x',       edge: '#f87171' },
  SKIPPED:   { color: '#d4d4d4', badge: 'bg-neutral-50 text-neutral-400',    label: '已放弃', icon: 'minus',   edge: '#e2e8f0' },
  CANCELED:  { color: '#a3a3a3', badge: 'bg-neutral-100 text-neutral-500',   label: '已取消', icon: 'minus',   edge: '#cbd5e1' },
};

const KIND_META: Record<string, { icon: any; label: string }> = {
  TOOL:           { icon: Wrench,    label: '工具' },
  SUB_AGENT:      { icon: Bot,       label: '子Agent' },
  EXTERNAL_AGENT: { icon: Network,   label: '外部Agent' },
  HUMAN_GATE:     { icon: UserCheck, label: '人工门' },
};

const statusOf = (s?: string) => STATUS_STYLE[s ?? 'PENDING'] ?? STATUS_STYLE.PENDING;

/** 头部状态图标（执行中旋转、完成打勾、失败叉） */
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const v = statusOf(status);
  switch (v.icon) {
    case 'spinner': return <Loader2 size={13} className="animate-spin" style={{ color: v.color }} />;
    case 'check':   return (
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: v.color }}>
        <Check size={11} className="text-white" strokeWidth={3} />
      </span>
    );
    case 'x':       return (
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: v.color }}>
        <X size={11} className="text-white" strokeWidth={3} />
      </span>
    );
    case 'minus':   return <Minus size={13} style={{ color: v.color }} />;
    case 'ready':   return <CircleDot size={13} style={{ color: v.color }} />;
    default:        return <span className="w-[10px] h-[10px] rounded-full border-2" style={{ borderColor: v.color }} />;
  }
};

/* ================= 流式动画样式（状态光晕 / 完成闪烁 / 边流动已在 RF animated 内） ================= */
const FLOW_CSS = `
@keyframes dag-node-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,.35), 0 2px 6px rgba(0,0,0,.06); }
  50%      { box-shadow: 0 0 0 7px rgba(59,130,246,0), 0 2px 10px rgba(59,130,246,.18); }
}
.dag-node-running { animation: dag-node-glow 1.6s ease-out infinite; }
@keyframes dag-node-flash {
  0%   { box-shadow: 0 0 0 0 rgba(16,185,129,.45); }
  100% { box-shadow: 0 0 0 12px rgba(16,185,129,0); }
}
.dag-node-just-done { animation: dag-node-flash .9s ease-out 1; }
.dag-flow .react-flow__edge-path { transition: stroke .4s ease; }
.dag-flow .react-flow__controls { border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.dag-flow .react-flow__controls-button { border-bottom: 1px solid #f5f5f5; }
`;

/* ================= 自定义节点 ================= */
type StepNodeData = Record<string, unknown> & { step: PlanStep; selected: boolean };
type StepFlowNode = Node<StepNodeData>;

const StepNode: React.FC<NodeProps<StepFlowNode>> = ({ data }) => {
  const step = data.step;
  const status = step.status ?? 'PENDING';
  const style = statusOf(status);
  const kind = KIND_META[step.stepKind ?? ''] ?? { icon: CircleDot, label: '节点' };
  const Icon = kind.icon;
  const running = status === 'RUNNING';

  return (
    <div
      // key 随状态变化重挂载：完成瞬间触发一次闪烁光晕
      key={`${step.stepId}-${status}`}
      className={`relative rounded-2xl bg-white border transition-colors duration-300 ${
        running ? 'dag-node-running' : status === 'SUCCEEDED' ? 'dag-node-just-done' : ''
      }`}
      style={{
        width: NODE_W,
        height: NODE_H,
        borderColor: data.selected ? '#0a0a0a' : style.color,
        borderWidth: data.selected ? 2 : 1.5,
        boxShadow: data.selected ? '0 4px 14px rgba(0,0,0,.12)' : '0 2px 6px rgba(0,0,0,.06)',
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-2 !border-white" style={{ background: style.edge }} />
      {/* 左侧状态条 */}
      <div className="absolute left-[7px] top-[10px] bottom-[10px] w-1 rounded-full transition-colors duration-300" style={{ background: style.color }} />
      <div className="flex flex-col h-full justify-between pl-[18px] pr-3 py-2.5 select-none">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-neutral-400 shrink-0" />
          <span className="text-[10px] font-bold text-neutral-400">{kind.label}</span>
          {step.targetName && (
            <span className="ml-1 px-1.5 py-px rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-500 truncate max-w-[96px]">{step.targetName}</span>
          )}
          <span className="ml-auto shrink-0"><StatusIcon status={status} /></span>
        </div>
        <p className="text-[11.5px] font-bold text-neutral-800 leading-snug line-clamp-2">
          {step.description ?? step.stepId}
        </p>
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors duration-300 ${style.badge}`}>{style.label}</span>
          {step.onFailure === 'continue' && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-50 text-violet-600">容错</span>
          )}
          {step.confirmRequired && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-600 flex items-center gap-0.5">
              <ShieldCheck size={9} />门
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-2 !border-white" style={{ background: style.edge }} />
    </div>
  );
};

const nodeTypes = { planStep: StepNode };

/* ================= dagre 自动布局（LR 分层，交叉最小化） ================= */
function buildFlow(steps: PlanStep[], selectedId: string | null): { nodes: StepFlowNode[]; edges: Edge[] } {
  const byId = new Map(steps.map(s => [s.stepId, s]));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 84, marginx: 8, marginy: 8 });

  steps.forEach(s => g.setNode(s.stepId, { width: NODE_W, height: NODE_H }));
  steps.forEach(s => (s.dependsOn ?? []).forEach(dep => {
    if (byId.has(dep)) g.setEdge(dep, s.stepId);
  }));
  dagre.layout(g);

  const nodes: StepFlowNode[] = steps.map(s => {
    const pos = g.node(s.stepId);
    return {
      id: s.stepId,
      type: 'planStep',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { step: s, selected: selectedId === s.stepId },
      draggable: false,
      connectable: false,
    };
  });

  const edges: Edge[] = steps.flatMap(s =>
    (s.dependsOn ?? [])
      .filter(dep => byId.has(dep))
      .map(dep => {
        const depStep = byId.get(dep)!;
        const depStatus = statusOf(depStep.status);
        const running = (depStep.status ?? 'PENDING') === 'RUNNING';
        const tolerant = s.onFailure === 'continue';
        return {
          id: `${dep}->${s.stepId}`,
          source: dep,
          target: s.stepId,
          type: 'smoothstep',
          // 上游执行中 → 边流动画（数据流转体感）；失败容忍路径用虚线区分
          animated: running,
          style: {
            stroke: depStatus.edge,
            strokeWidth: running ? 2.4 : 1.8,
            strokeDasharray: tolerant ? '6 5' : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: depStatus.edge },
        } satisfies Edge;
      }),
  );

  return { nodes, edges };
}

/* ================= 节点详情（证据 / 错误 / 入参 / 验收条件） ================= */
const StepDetail: React.FC<{ step: PlanStep }> = ({ step }) => (
  <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
    <div className="flex items-center gap-2 flex-wrap">
      <p className="text-sm font-black text-black">{step.description ?? step.stepId}</p>
      {step.targetName && (
        <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">{step.targetName}</span>
      )}
      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${statusOf(step.status).badge}`}>
        {statusOf(step.status).label}
      </span>
      <span className="text-[10px] font-mono text-neutral-300">{step.stepId}</span>
    </div>
    {step.acceptanceCheck && (
      <p className="text-[11px] text-neutral-500">
        <span className="font-bold text-neutral-700">验收条件：</span>{step.acceptanceCheck}
      </p>
    )}
    {step.output?.evidence != null && (
      <div>
        <p className="text-[11px] font-bold text-neutral-700 mb-1">执行证据</p>
        <pre className="text-[11px] text-neutral-600 bg-neutral-50 rounded-xl p-3 max-h-40 overflow-auto whitespace-pre-wrap break-all">
          {String(step.output.evidence)}
        </pre>
      </div>
    )}
    {step.errorMessage && (
      <p className="flex items-start gap-1.5 text-[11px] text-red-600">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />{step.errorMessage}
      </p>
    )}
    {step.input != null && Object.keys(step.input).length > 0 && (
      <details className="text-[11px] text-neutral-500">
        <summary className="cursor-pointer font-bold text-neutral-700">入参模板</summary>
        <pre className="mt-1 bg-neutral-50 rounded-xl p-3 max-h-32 overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify(step.input, null, 2)}
        </pre>
      </details>
    )}
  </div>
);

/* ================= 步骤列表视图（Trae 式计划清单） ================= */
const StepList: React.FC<{ steps: PlanStep[]; selectedId: string | null; onSelect: (id: string | null) => void }> = ({
  steps, selectedId, onSelect,
}) => (
  <div className="rounded-2xl bg-neutral-50/70 border border-neutral-100 px-4 py-3">
    {steps.map((step, i) => {
      const status = step.status ?? 'PENDING';
      const style = statusOf(status);
      const kind = KIND_META[step.stepKind ?? ''] ?? { icon: CircleDot, label: '节点' };
      const isSelected = selectedId === step.stepId;
      return (
        <div key={step.stepId} className="relative">
          {/* 步骤间连接线 */}
          {i < steps.length - 1 && (
            <div className="absolute left-[17px] top-[34px] bottom-0 w-[2px] bg-neutral-200/80" />
          )}
          <button
            onClick={() => onSelect(isSelected ? null : step.stepId)}
            className={`relative w-full flex items-center gap-3 py-2.5 px-2 rounded-xl text-left transition-colors ${
              isSelected ? 'bg-white shadow-sm' : 'hover:bg-white/70'
            }`}
          >
            <span className="w-[22px] flex justify-center shrink-0 relative z-10 bg-inherit">
              <StatusIcon status={status} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <kind.icon size={11} className="text-neutral-300" />
                <span className="text-[10px] text-neutral-400">{kind.label}</span>
                {step.targetName && (
                  <span className="px-1 py-px rounded bg-indigo-50 text-[9px] font-bold text-indigo-500 truncate max-w-[120px]">{step.targetName}</span>
                )}
              </span>
              <span className={`block text-[12.5px] font-bold truncate mt-0.5 ${
                status === 'SKIPPED' || status === 'CANCELED' ? 'text-neutral-400 line-through' : 'text-neutral-800'
              }`}>
                {step.description ?? step.stepId}
              </span>
            </span>
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0 ${style.badge}`}>{style.label}</span>
          </button>
        </div>
      );
    })}
  </div>
);

/* ================= 主组件 ================= */
/**
 * 任务运行 DAG 视图（React Flow + dagre 自动布局）。
 * - 图视图：状态着色节点卡片 + 依赖边；上游执行中时边流动画，节点完成瞬间光晕闪烁
 * - 列表视图：Trae 式计划清单，步骤状态逐行流转
 * - 点击节点/步骤在下方展开详情；面板可折叠，折叠条实时显示完成进度
 * - hideHeader：嵌进规划抽屉等自带标题/进度的容器时隐藏内嵌折叠头，
 *   视图切换浮动在图区右上角，避免双层标题
 */
const TaskRunGraph: React.FC<{ steps: PlanStep[]; height?: number; defaultCollapsed?: boolean; hideHeader?: boolean }> = ({
  steps, height = 340, defaultCollapsed = false, hideHeader = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [view, setView] = useState<'graph' | 'list'>('graph');

  const anyRunning = steps.some(s => s.status === 'RUNNING');
  // 运行中强制展开，让流转动画始终可见；终态后用户可自由折叠
  useEffect(() => { if (anyRunning) setCollapsed(false); }, [anyRunning]);

  const { nodes, edges } = useMemo(() => buildFlow(steps, selectedId), [steps, selectedId]);
  const selected = selectedId ? steps.find(s => s.stepId === selectedId) ?? null : null;

  const doneCount = steps.filter(s => ['SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELED'].includes(s.status ?? '')).length;
  const successCount = steps.filter(s => s.status === 'SUCCEEDED').length;
  const failedCount = steps.filter(s => s.status === 'FAILED').length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const terminal = doneCount === steps.length;

  /** 图 / 步骤视图切换（折叠头内联或抽屉浮动两种挂点共用） */
  const viewSwitch = (
    <span
      className="flex items-center rounded-lg border border-neutral-200 bg-white overflow-hidden shrink-0"
      onClick={e => e.stopPropagation()}
    >
      <span
        role="button"
        onClick={() => setView('graph')}
        className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors ${
          view === 'graph' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-600'
        }`}
      >
        <LayoutGrid size={11} /> 图
      </span>
      <span
        role="button"
        onClick={() => setView('list')}
        className={`px-2 py-1 flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors ${
          view === 'list' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-600'
        }`}
      >
        <ListOrdered size={11} /> 步骤
      </span>
    </span>
  );

  return (
    <div className={hideHeader ? '' : 'rounded-2xl border border-neutral-200/80 bg-white overflow-hidden'}>
      <style>{FLOW_CSS}</style>

      {/* 折叠头：进度总览（Claude/Trae 式计划条）；抽屉场景由容器头部承担，不重复渲染 */}
      {!hideHeader && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-neutral-50/70 transition-colors text-left"
        >
          <GitBranch size={14} className="text-neutral-400 shrink-0" />
          <span className="text-xs font-bold text-neutral-600">任务规划</span>
          <span className="text-[10px] font-mono text-neutral-400">
            {successCount}/{steps.length} 完成{failedCount > 0 ? ` · ${failedCount} 失败` : ''}
          </span>
          {/* 进度条 */}
          <span className="flex-1 max-w-[140px] h-1 rounded-full bg-neutral-100 overflow-hidden ml-1">
            <span
              className={`block h-full rounded-full transition-all duration-500 ${failedCount > 0 && terminal ? 'bg-red-400' : 'bg-emerald-400'}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          {anyRunning && <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />}
          {/* 视图切换 */}
          {!collapsed && <span className="ml-auto shrink-0">{viewSwitch}</span>}
        </button>
      )}

      {(hideHeader || !collapsed) && (
        <div className={`relative ${hideHeader ? '' : 'px-3 pb-3'}`}>
          {hideHeader && <div className="absolute right-2 top-2 z-10">{viewSwitch}</div>}
          {view === 'graph' ? (
            <div
              className="dag-flow rounded-xl border border-neutral-100 overflow-hidden"
              style={{ height }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                minZoom={0.25}
                maxZoom={1.6}
                // 聊天内嵌：滚轮留给消息列表，缩放走按钮/双指
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                panOnScroll={false}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                onNodeClick={(_, node) => setSelectedId(selectedId === node.id ? null : node.id)}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#e5e5e5" />
                <Controls showInteractive={false} position="bottom-right" />
              </ReactFlow>
            </div>
          ) : (
            <StepList steps={steps} selectedId={selectedId} onSelect={setSelectedId} />
          )}

          {selected && <StepDetail step={selected} />}
        </div>
      )}
    </div>
  );
};

export default TaskRunGraph;
