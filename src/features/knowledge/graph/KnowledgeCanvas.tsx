import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, BaseEdge, EdgeLabelRenderer, Handle, Position, MarkerType, getBezierPath, useNodesInitialized, useNodesState, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { Box, Building2, Code2, Database, FileText, Focus, MapPin, Maximize2, Minimize2, Minus, Pause, Play, Plus, Scan, User, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './knowledgeStudio.css';
import './knowledgeCanvas.css';
import { colorOfType } from './graphPalette';
import { reconcileStudioNodes } from './studioModel';

export function TypeIcon({ type, size = 16 }: { type?: string; size?: number }) {
  const Icon = /人员|人物|成员/.test(type ?? '') ? User : /组织|机构|团队/.test(type ?? '') ? Building2 : /文档|文件/.test(type ?? '') ? FileText : /地点|位置/.test(type ?? '') ? MapPin : /数据库/.test(type ?? '') ? Database : /技术|算法|概念/.test(type ?? '') ? Code2 : Box;
  return <Icon size={size} strokeWidth={1.6} />;
}
export type StudioNode = Node<{ label: string; category: string; description?: string; count?: number; dim?: boolean; root?: boolean; schema?: boolean }>;
export type StudioEdge = Edge<{ hierarchy?: boolean; dim?: boolean; emphasis?: boolean; animate?: boolean; showLabel?: boolean }>;
export interface KnowledgeCanvasHandle { fit: () => void; focus: (id: string) => void }
export interface StudioSceneSnapshot { layoutKey:string; dataKey:string; size:{width:number;height:number}; viewport:{x:number;y:number;zoom:number}; positions:Record<string,{x:number;y:number}>; animation:boolean; labels:boolean }
interface Props {
  nodes: StudioNode[]; edges: StudioEdge[]; selectedId?: string | null;
  onSelectNode: (id: string | null) => void; onSelectEdge?: (id: string) => void;
  onExpand?: (id: string) => void; layoutKey: string;
  snapshotRef?:React.MutableRefObject<StudioSceneSnapshot|null>;
}

const KnowledgeNode = memo(({ data, selected }: NodeProps<StudioNode>) => <div className={`studio-node is-entity ${selected ? 'is-selected' : ''} ${data.root ? 'is-root' : ''} ${data.dim ? 'is-dim' : ''}`} style={{ '--node-color': colorOfType(data.category) } as React.CSSProperties}>
  {[Position.Top, Position.Right, Position.Bottom, Position.Left].map(position => <React.Fragment key={position}><Handle type="target" position={position} id={`target-${position}`} /><Handle type="source" position={position} id={`source-${position}`} /></React.Fragment>)}
  <div className="studio-orb"><TypeIcon type={data.category} size={data.root ? 30 : 22} /><span className="studio-orb-ring" /></div>
  <strong className="studio-entity-label">{data.label}</strong><span className="studio-entity-category">{data.root ? '探索起点' : data.category}</span>
</div>);
const KnowledgeEdge = memo((props: EdgeProps<StudioEdge>) => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd, id, label } = props;
  let [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: .18 });
  if (props.source === props.target) { path = `M${sourceX},${sourceY} C${sourceX+75},${sourceY-110} ${targetX-75},${targetY-110} ${targetX},${targetY}`; labelX=(sourceX+targetX)/2; labelY=sourceY-81; }
  const emphasis = data?.emphasis || selected;
  const color = emphasis ? '#8b5cf6' : '#a3a3a3';
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={22} style={{ stroke: color, strokeWidth: emphasis ? 1.8 : 1.2, opacity: data?.dim ? .2 : emphasis ? .85 : .55 }} />
    {data?.animate && emphasis && !data.dim && <circle r="2" fill="#8b5cf6" className="studio-signal" aria-hidden="true"><animateMotion dur="5s" repeatCount="indefinite" path={path} /></circle>}
    {label && <EdgeLabelRenderer><div className={`studio-edge-label nodrag nopan ${emphasis ? 'is-active' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity: data?.showLabel === false ? 0 : data?.dim ? .15 : emphasis ? 1 : .62 }}>{label}</div></EdgeLabelRenderer>}
  </>;
});
const nodeTypes = { knowledge: KnowledgeNode }, edgeTypes = { knowledge: KnowledgeEdge };
const duration = (ms: number) => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;

const CanvasInner = forwardRef<KnowledgeCanvasHandle, Props>((props, ref) => {
  const initialSnapshot=useRef(props.snapshotRef?.current);
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>(reconcileStudioNodes([],props.nodes.map(node=>({...node,position:initialSnapshot.current?.layoutKey===props.layoutKey?initialSnapshot.current.positions[node.id]??node.position:node.position})),props.selectedId));
  const initialized = useNodesInitialized();
  const [animation, setAnimation] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches&&(initialSnapshot.current?.animation??true));
  const [labels, setLabels] = useState(initialSnapshot.current?.labels??true), [expanded, setExpanded] = useState(false), [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(initialSnapshot.current?.viewport.zoom??1), [size, setSize] = useState({ width: 0, height: 0 });
  const container = useRef<HTMLDivElement>(null), fitted = useRef(''), fitCount = useRef(0);
  const lastLayout = useRef(props.layoutKey);
  const edgeCache = useRef(new Map<string, StudioEdge>());
  const flow = useReactFlow<StudioNode, StudioEdge>();
  useLayoutEffect(() => {
    const reset = lastLayout.current !== props.layoutKey;
    lastLayout.current = props.layoutKey;
    setNodes(previous => reconcileStudioNodes(previous, props.nodes, props.selectedId,reset));
  }, [props.nodes, props.selectedId, props.layoutKey, setNodes]);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const width = Math.round(element.clientWidth), height = Math.round(element.clientHeight);
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fitKey = `${props.layoutKey}|${props.nodes.map(node=>node.id).join(',')}|${size.width}x${size.height}|${expanded}`;
  useLayoutEffect(() => {
    if ((!initialized && props.nodes.length) || !size.width || !size.height || fitted.current === fitKey) return;
    if(props.nodes.some(node=>{const measured=flow.getInternalNode(node.id)?.measured;return !measured?.width||!measured.height;}))return;
    fitted.current = fitKey;
    if (!props.nodes.length) { setReady(true); return; }
    const snapshot=initialSnapshot.current;
    if(!expanded&&snapshot?.dataKey===`${props.layoutKey}|${props.nodes.map(node=>node.id).join(',')}`&&snapshot.size.width===size.width&&snapshot.size.height===size.height){
      initialSnapshot.current=null;
      flow.setViewport(snapshot.viewport,{duration:0}).then(()=>setReady(true)); return;
    }
    fitCount.current++;
    // 自动适配只有一条路径，首屏与尺寸变化直接定位，避免多个动画竞争视口。
    flow.fitView({ padding: .16, duration: 0, maxZoom: 1.12 }).then(() => setReady(true));
  }, [fitKey, initialized, flow, props.nodes.length, size]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [expanded]);
  useImperativeHandle(ref, () => ({ fit: () => flow.fitView({ padding: .16, duration: duration(280), maxZoom: 1.12 }), focus: id => { const node=flow.getNode(id); if(node) flow.fitView({ nodes:[node], padding:1.5, maxZoom:1.3, duration:duration(280) }); } }));
  const edges = useMemo(() => {
    const next=props.edges.map(edge=>{
      const previous=edgeCache.current.get(edge.id);
      const data={...edge.data,animate:animation,showLabel:labels};
      if(previous&&previous.label===edge.label&&previous.sourceHandle===edge.sourceHandle&&previous.targetHandle===edge.targetHandle&&JSON.stringify(previous.data)===JSON.stringify(data))return previous;
      return {...edge,type:'knowledge',markerEnd:{type:MarkerType.ArrowClosed,color:edge.data?.emphasis?'#8b5cf6':'#a3a3a3',width:10,height:10},data};
    });
    edgeCache.current=new Map(next.map(edge=>[edge.id,edge])); return next;
  },[props.edges,animation,labels]);
  const toggleAnimation = () => {
    setAnimation(previous => !previous);
    const svgElements = container.current?.querySelectorAll<SVGSVGElement>('.react-flow__edges');
    svgElements?.forEach(element => animation ? element.pauseAnimations?.() : element.unpauseAnimations?.());
  };
  const saveSnapshot=useCallback((view?:{x:number;y:number;zoom:number},dragged?:StudioNode)=>{
    if(!props.snapshotRef||!size.width||!size.height)return;
    const live=flow.getNodes(); if(!live.length)return;
    const positions=Object.fromEntries(live.map(node=>[node.id,{...node.position}])); if(dragged)positions[dragged.id]={...dragged.position};
    props.snapshotRef.current={layoutKey:props.layoutKey,dataKey:`${props.layoutKey}|${live.map(node=>node.id).join(',')}`,size,viewport:view??flow.getViewport(),positions,animation,labels};
  },[flow,props.snapshotRef,props.layoutKey,size,animation,labels]);
  const saveRef=useRef(saveSnapshot); saveRef.current=saveSnapshot;
  useEffect(()=>()=>saveRef.current(),[]);
  const onMoveEnd = useCallback((_: unknown, view: {x:number;y:number;zoom:number}) => {setZoom(Math.round(view.zoom * 100) / 100);saveSnapshot(view);},[saveSnapshot]);
  return <div ref={container} className={`studio-canvas knowledge-network ${expanded ? 'is-expanded' : ''} ${animation ? '' : 'motion-paused'}`} data-ready={ready} data-fit-count={fitCount.current}>
    <div className="studio-canvas-caption"><i className="studio-live-dot" /><span>知识网络</span><span className="studio-caption-count">{props.nodes.length} 个实体 · {props.edges.length} 条关系</span></div>
    {expanded && <button className="studio-icon-button studio-fullscreen-close" aria-label="退出全屏" onClick={() => setExpanded(false)}><X size={18} /></button>}
    <ReactFlow<StudioNode, StudioEdge> nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodeClick={(_,node) => props.onSelectNode(node.id)} onNodeDoubleClick={(_,node) => props.onExpand?.(node.id)} onEdgeClick={(_,edge) => props.onSelectEdge?.(edge.id)} onPaneClick={() => props.onSelectNode(null)}
      onNodeDragStop={(_,node)=>saveSnapshot(undefined,node)} onMoveEnd={onMoveEnd} minZoom={.3} maxZoom={2} nodesConnectable={false} edgesFocusable={!!props.onSelectEdge} deleteKeyCode={null} aria-label="知识图谱画布" defaultViewport={{ x:0,y:0,zoom:1 }} proOptions={{ hideAttribution: true }}>
    </ReactFlow>
    <div className="studio-canvas-bottom"><span className="studio-canvas-hint">拖拽移动 · 滚轮缩放 · 双击展开</span><div className="studio-canvas-tools">
      <button className="studio-icon-button" onClick={toggleAnimation} aria-label={animation ? '暂停动画' : '播放动画'} title={animation ? '暂停动画' : '播放动画'}>{animation ? <Pause size={14} /> : <Play size={14} />}</button>
      <button className="studio-icon-button" onClick={() => setLabels(value => !value)} aria-label={labels ? '隐藏关系文字' : '显示关系文字'} title={labels ? '隐藏关系文字' : '显示关系文字'}><span>字</span></button><i />
      <button className="studio-icon-button" onClick={() => flow.zoomOut({ duration:duration(200) })} aria-label="缩小"><Minus size={15} /></button><span className="studio-zoom">{Math.round(zoom*100)}%</span>
      <button className="studio-icon-button" onClick={() => flow.zoomIn({ duration:duration(200) })} aria-label="放大"><Plus size={15} /></button><button className="studio-icon-button" onClick={() => flow.fitView({ padding:.16, duration:duration(280), maxZoom:1.12 })} aria-label="适应画布" title="适应画布"><Scan size={15} /></button>
      <button className="studio-icon-button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? '退出全屏' : '全屏画布'} title={expanded ? '退出全屏' : '全屏画布'}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
    </div></div>
    {!props.nodes.length && <div className="studio-canvas-empty"><Focus size={32} /><strong>从一个实体开始探索</strong><p>搜索实体，或调整关系筛选条件。</p></div>}
  </div>;
});
const KnowledgeCanvas = forwardRef<KnowledgeCanvasHandle,Props>((props,ref) => <ReactFlowProvider><CanvasInner {...props} ref={ref} /></ReactFlowProvider>);
export default KnowledgeCanvas;

