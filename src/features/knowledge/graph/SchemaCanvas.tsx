import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { ArrowRight, GitBranch, Maximize2, Minimize2, Minus, Plus, Scan, Shapes } from 'lucide-react';
import type { EntityTypeDef, RelationTypeDef } from '../../../shared/types/knowledge';
import { TypeIcon } from './KnowledgeCanvas';
import { colorOfType } from './graphPalette';
import { inheritedAttributes } from './studioModel';
import { ANY_TYPE_ID, SCHEMA_NODE_SIZE, layoutSchema, routeSchemaRelation, schemaLinks, schemaTypeId, type SchemaBox, type SchemaLink } from './schemaModel';
import '@xyflow/react/dist/style.css';
import './ontologyStudio.css';

export type SchemaSelection = { kind: 'entity' | 'relation'; index: number } | null;
interface Props {
  entityTypes: EntityTypeDef[]; relationTypes: RelationTypeDef[];
  selected: SchemaSelection; onSelect: (selection: SchemaSelection) => void; className?: string;
  examples?: { source: string; relation: string; target: string; sourceType?: string; targetType?: string }[];
}
type TypeNode = Node<{ definition: EntityTypeDef; index: number; inherited: number; dim: boolean; wildcard: boolean; onSelect: () => void }>;
type RuleEdge = Edge<{ link: SchemaLink; active: boolean; dim: boolean; lane: number; boxes: SchemaBox[]; onSelect: () => void }>;

const SchemaTypeNode = memo(({ data, selected }: NodeProps<TypeNode>) => <div className={`schema-type-node ${selected ? 'is-selected' : ''} ${data.dim ? 'is-dim' : ''}`} style={{ '--type-color': colorOfType(data.definition.name) } as React.CSSProperties}>
  {[Position.Left, Position.Right, Position.Top, Position.Bottom].map(position => <React.Fragment key={position}><Handle id={`in-${position}`} type="target" position={position} /><Handle id={`out-${position}`} type="source" position={position} /></React.Fragment>)}
  <button className="schema-node-card" aria-label={data.wildcard ? '任意类型：不限制关系端点' : `查看类型 ${data.definition.name}`} onClick={data.onSelect} disabled={data.wildcard}>
    <span className="schema-node-title"><span className="schema-node-icon"><TypeIcon type={data.definition.name} size={17} /></span><strong>{data.definition.name}</strong>{selected && <i />}</span>
    <span className="schema-node-description">{data.wildcard ? '此端点不限制对象类型' : data.definition.description || '尚未添加类型说明'}</span>
    <span className="schema-node-meta"><span>{data.wildcard ? '开放约束' : `${data.definition.attributes?.length ?? 0} 个属性`}</span><span>{data.definition.parent ? `继承 ${data.inherited} 个` : data.wildcard ? '' : '顶级类型'}</span></span>
  </button>
</div>);

const SchemaRuleEdge = memo((props: EdgeProps<RuleEdge>) => {
  const { sourceX, sourceY, targetX, targetY, markerEnd, id, data } = props;
  const inheritance = data.link.kind === 'inheritance';
  let { path, labelX, labelY } = routeSchemaRelation({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.boxes, props.source, props.target, data.lane);
  if (props.source === props.target) {
    path = `M${sourceX},${sourceY} C${sourceX},${sourceY - 76} ${targetX + 64},${sourceY - 76} ${targetX + 64},${sourceY - 10} C${targetX + 64},${targetY} ${targetX + 38},${targetY} ${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2 + 28; labelY = sourceY - 53;
  } else if (inheritance) {
    const bend = Math.max(sourceX, targetX) + 46 + data.lane * 28;
    path = `M${sourceX},${sourceY} C${bend},${sourceY} ${bend},${targetY} ${targetX},${targetY}`;
    labelX = bend - 12; labelY = (sourceY + targetY) / 2;
  }
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={24} style={{ stroke: data.active ? '#8b5cf6' : '#a3a3a3', strokeWidth: data.active ? 2 : 1.6, strokeDasharray: inheritance ? '5 5' : undefined, opacity: data.dim ? .22 : 1 }} />
    <EdgeLabelRenderer><button className={`schema-edge-label nodrag nopan ${inheritance ? 'is-inheritance' : ''} ${data.active ? 'is-active' : ''} ${data.dim ? 'is-dim' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} onClick={data.onSelect} aria-label={`${inheritance ? '查看继承' : `查看关系 ${data.link.label}`}：${props.source === ANY_TYPE_ID ? '任意类型' : props.source.replace('schema:type:', '')} → ${props.target === ANY_TYPE_ID ? '任意类型' : props.target.replace('schema:type:', '')}`}>
      {inheritance && <GitBranch size={10} />}{data.link.label}{!inheritance && <ArrowRight size={11} />}
    </button></EdgeLabelRenderer>
  </>;
});
const nodeTypes = { schemaType: SchemaTypeNode }, edgeTypes = { schemaRule: SchemaRuleEdge };

function SchemaCanvasInner({ entityTypes, relationTypes, selected, onSelect, examples = [], className = '' }: Props) {
  const links = useMemo(() => schemaLinks(entityTypes, relationTypes), [entityTypes, relationTypes]);
  const positions = useMemo(() => layoutSchema(entityTypes, links), [entityTypes, links]);
  const layoutKey = JSON.stringify([entityTypes.map(type => [type.name, type.parent]), links.map(link => [link.source, link.target, link.label])]);
  const [baseNodes, setNodes, onNodesChange] = useNodesState<TypeNode>([]);
  const [expanded, setExpanded] = useState(false), [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showInheritance, setShowInheritance] = useState(true);
  const flow = useReactFlow<TypeNode, RuleEdge>(), initialized = useNodesInitialized();
  const container = useRef<HTMLDivElement>(null), lastLayout = useRef('');
  const selectedId = selected?.kind === 'entity' ? schemaTypeId(entityTypes[selected.index]?.name ?? '') : null;
  const connected = useMemo(() => {
    const activeLinks = links.filter(link => selected?.kind === 'relation' ? link.kind === 'relation' && link.relationIndex === selected.index : link.source === selectedId || link.target === selectedId);
    return new Set([selectedId, ...activeLinks.flatMap(link => [link.source, link.target])]);
  }, [links, selected, selectedId]);

  useLayoutEffect(() => {
    const reset = lastLayout.current !== layoutKey;
    lastLayout.current = layoutKey;
    setNodes(previous => {
      const old = new Map(previous.map(node => [node.id, node]));
      const nodes: TypeNode[] = entityTypes.map((definition, index) => ({ id: schemaTypeId(definition.name), type: 'schemaType', position: positions.get(schemaTypeId(definition.name))!, width: SCHEMA_NODE_SIZE.width, height: SCHEMA_NODE_SIZE.height,
        data: { definition, index, inherited: inheritedAttributes(entityTypes, index).length, wildcard: false, dim: false, onSelect: () => {} } }));
      if (positions.has(ANY_TYPE_ID)) nodes.push({ id: ANY_TYPE_ID, type: 'schemaType', position: positions.get(ANY_TYPE_ID)!, width: SCHEMA_NODE_SIZE.width, height: SCHEMA_NODE_SIZE.height, draggable: false, selectable: false,
        data: { definition: { name: '任意类型' }, index: -1, inherited: 0, wildcard: true, dim: false, onSelect: () => {} } });
      return nodes.map(node => ({ ...node, position: reset ? node.position : old.get(node.id)?.position ?? node.position }));
    });
  }, [entityTypes, positions, layoutKey, setNodes]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setSize(current => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!initialized || !size.width || !size.height) return;
    const frame = requestAnimationFrame(() => { flow.fitView({ padding: .16, duration: 0, maxZoom: 1 }).then(() => setZoom(flow.getZoom())); });
    return () => cancelAnimationFrame(frame);
  }, [initialized, layoutKey, size, flow]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [expanded]);

  const nodes = useMemo(() => baseNodes.map(node => ({ ...node, selected: node.id === selectedId,
    data: { ...node.data, dim: !!selected && !connected.has(node.id), onSelect: () => onSelect({ kind: 'entity', index: node.data.index }) } })), [baseNodes, selectedId, selected, connected, onSelect]);
  const boxes = baseNodes.map(node => ({ id: node.id, ...node.position, ...SCHEMA_NODE_SIZE }));
  const edges: RuleEdge[] = links.filter(link => showInheritance || link.kind !== 'inheritance').map(link => {
    const active = selected?.kind === 'relation' ? link.kind === 'relation' && selected.index === link.relationIndex : !!selectedId && (link.source === selectedId || link.target === selectedId);
    const self = link.source === link.target, inheritance = link.kind === 'inheritance';
    const lane = inheritance ? links.filter(item => item.kind === 'inheritance' && item.target === link.target).findIndex(item => item.id === link.id) : links.filter(item => item.source === link.source && item.target === link.target && item.kind === link.kind).findIndex(item => item.id === link.id);
    return { id: link.id, source: link.source, target: link.target, type: 'schemaRule', sourceHandle: self ? 'out-top' : 'out-right', targetHandle: self || inheritance ? 'in-right' : 'in-left',
      markerEnd: { type: inheritance ? MarkerType.Arrow : MarkerType.ArrowClosed, width: 17, height: 17, color: active ? '#8b5cf6' : '#a3a3a3' },
      data: { link, active, dim: !!selected && !active, lane, boxes, onSelect: () => onSelect(inheritance ? { kind: 'entity', index: link.entityIndex! } : { kind: 'relation', index: link.relationIndex! }) } };
  });
  const rule = selected?.kind === 'relation' ? relationTypes[selected.index] : null;
  const example = examples.find(fact => fact.relation === rule?.name && (!rule.sourceTypes?.length || rule.sourceTypes.includes(fact.sourceType ?? '')) && (!rule.targetTypes?.length || rule.targetTypes.includes(fact.targetType ?? '')));

  return <div ref={container} className={`schema-canvas ${expanded ? 'is-expanded' : ''} ${className}`}>
    <div className="schema-canvas-caption"><span><Shapes size={13} />本体关系图</span><small>{entityTypes.length} 个类型 · {relationTypes.length} 条规则</small></div>
    {!nodes.length ? <div className="schema-empty"><Shapes size={30} /><strong>从定义一种类型开始</strong><p>添加人员、项目等类型，再用关系连接它们。</p></div> : <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
      onNodeClick={(_, node) => { if (!node.data.wildcard) onSelect({ kind: 'entity', index: node.data.index }); }} onEdgeClick={(_, edge) => edge.data.onSelect()} onPaneClick={() => onSelect(null)} onMoveEnd={(_, viewport) => setZoom(viewport.zoom)}
      nodesConnectable={false} edgesFocusable deleteKeyCode={null} minZoom={.25} maxZoom={1.6} aria-label="本体类型与关系画布" proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} color="#e5e5e5" gap={24} size={1} />
    </ReactFlow>}
    <div className="schema-canvas-legend"><span><i className="schema-line-key" />业务关系<ArrowRight size={11} /></span><button aria-pressed={showInheritance} onClick={() => setShowInheritance(value => !value)}><i className="schema-line-key is-dashed" />类型继承</button><span className="schema-legend-note">子类型 → 父类型</span></div>
    {rule && <div className="schema-rule-focus"><div><span>当前关系</span><strong>{rule.name}</strong><button onClick={() => onSelect(null)}>显示全部</button></div><p>{rule.sourceTypes?.join(' / ') || '任意类型'}<ArrowRight size={13} />{rule.targetTypes?.join(' / ') || '任意类型'}</p>{example && <small>例如：{example.source} → {rule.name} → {example.target}</small>}</div>}
    <div className="schema-canvas-bottom"><span>拖动节点调整布局 · 点击连线查看规则</span><div className="schema-canvas-controls"><button aria-label="缩小本体画布" onClick={() => flow.zoomOut()}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大本体画布" onClick={() => flow.zoomIn()}><Plus size={14} /></button><i /><button aria-label="适应本体画布" onClick={() => flow.fitView({ padding: .16, maxZoom: 1 })}><Scan size={15} /></button><button aria-label={expanded ? '退出本体全屏' : '全屏查看本体'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div></div>
  </div>;
}

export default function SchemaCanvas(props: Props) { return <ReactFlowProvider><SchemaCanvasInner {...props} /></ReactFlowProvider>; }
