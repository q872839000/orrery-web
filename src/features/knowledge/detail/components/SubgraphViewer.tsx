import React, { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, MarkerType, Position, Handle,
  type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Network } from 'lucide-react';
import type { GraphSubgraph } from '../../../../shared/types/knowledge';
import EmptyState from '../../../../shared/components/ui/EmptyState';

/** 类型 → 节点配色（中性色板，避免一次性质色值散落页面） */
const TYPE_COLORS = ['#171717', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#6366f1', '#0ea5e9'];

const NODE_W = 172;
const NODE_H = 44;

/** dagre 自动布局（TB 分层） */
const layout = (subgraph: GraphSubgraph): { nodes: Node[]; edges: Edge[] } => {
  const typeIndex = new Map<string, number>();
  subgraph.nodes.forEach(n => {
    const t = n.type || '未分类';
    if (!typeIndex.has(t)) typeIndex.set(t, typeIndex.size);
  });

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 72 });
  g.setDefaultEdgeLabel(() => ({}));
  subgraph.nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  subgraph.edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const nodes: Node[] = subgraph.nodes.map(n => {
    const pos = g.node(n.id);
    const color = TYPE_COLORS[(typeIndex.get(n.type || '未分类') ?? 0) % TYPE_COLORS.length];
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: n.name, type: n.type || '未分类', color },
      type: 'entityNode',
    };
  });

  const edges: Edge[] = subgraph.edges.map((e, i) => ({
    id: `${e.source}-${e.target}-${e.relation ?? i}`,
    source: e.source,
    target: e.target,
    label: e.relation,
    labelStyle: { fontSize: 10, fontWeight: 700, fill: '#737373' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
    style: { stroke: '#a3a3a3', strokeWidth: 1.2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a3a3a3' },
  }));

  return { nodes, edges };
};

/** 实体节点（圆形色点 + 名称 + 类型） */
const EntityNode: React.FC<{ data: { label: string; type: string; color: string } }> = ({ data }) => (
  <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm transition-shadow hover:shadow-md" style={{ width: NODE_W }}>
    <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-neutral-300" />
    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: data.color }} />
    <div className="min-w-0">
      <div className="truncate text-[12px] font-black text-neutral-800">{data.label}</div>
      <div className="truncate text-[10px] font-semibold text-neutral-400">{data.type}</div>
    </div>
    <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-neutral-300" />
  </div>
);

const nodeTypes = { entityNode: EntityNode };

interface SubgraphViewerProps {
  subgraph: GraphSubgraph | null;
  loading: boolean;
  /** 点击节点联动实体详情 */
  onNodeClick?: (entityId: string) => void;
}

/** 可视化子图（React Flow + dagre 布局） */
const SubgraphViewer: React.FC<SubgraphViewerProps> = ({ subgraph, loading, onNodeClick }) => {
  const { nodes, edges } = useMemo(() => (subgraph ? layout(subgraph) : { nodes: [], edges: [] }), [subgraph]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-xs font-bold text-neutral-400">子图加载中…</div>;
  }
  if (!subgraph || nodes.length === 0) {
    return <EmptyState icon={<Network size={24} />} title="暂无子图数据" desc="从实体列表选择一个实体查看其关系子图。" />;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.3}
      maxZoom={1.6}
      nodesConnectable={false}
      onNodeClick={(_, node) => onNodeClick?.(node.id)}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#e5e5e5" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
};

export default SubgraphViewer;
