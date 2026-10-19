import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Download, Expand, FileText, Focus, GitBranch, Info, LayoutGrid, List, Network, Route, Search, Shapes, SlidersHorizontal, X } from 'lucide-react';
import type { GraphChunkRef, GraphEntity, GraphEntityDetail, GraphStats, GraphSubgraph, KnowledgeApp } from '../../../shared/types/knowledge';
import { useToast } from '../../../shared/components/ui/ToastManager';
import Modal from '../../../shared/components/ui/Modal';
import Spinner from '../../../shared/components/ui/Spinner';
import { THEME } from '../../../shared/styles/theme';
import KnowledgeCanvas, { TypeIcon, type KnowledgeCanvasHandle, type StudioEdge, type StudioNode, type StudioSceneSnapshot } from './KnowledgeCanvas';
import { colorOfType } from './graphPalette';
import { DEMO_GRAPH, graphApi } from './studioMock';
import { edgeKey, mergeSubgraphs, shortestPath } from './graphAlgorithms';
import { layoutKnowledgeGraph } from './studioModel';
import './knowledgeStudio.css';

const EMPTY_GRAPH: GraphSubgraph = { nodes: [], edges: [] };

export default function GraphExplorer({ app, stats, statsLoading, active = true }: { app: KnowledgeApp; stats: GraphStats | null; statsLoading: boolean; active?: boolean }) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useMemo(() => graphApi(app.id), [app.id]);
  const demo = app.id === 'demo';
  const canvas = useRef<KnowledgeCanvasHandle>(null);
  const sceneSnapshot=useRef<StudioSceneSnapshot|null>(null);
  const actionSequence = useRef(0);
  const [graph, setGraph] = useState<GraphSubgraph>(EMPTY_GRAPH);
  const [root, setRoot] = useState('');
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const layoutSnapshot = useRef({ root: '', revision:0, positions:new Map<string,{x:number;y:number}>() });
  const [detail, setDetail] = useState<GraphEntityDetail | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphSubgraph['edges'][number] | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState('');
  const [catalog, setCatalog] = useState<GraphEntity[]>([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState(searchParams.get('type') ?? '');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [relationFilter, setRelationFilter] = useState('');
  const [view, setView] = useState<'network' | 'list'>('network');
  const [help, setHelp] = useState(false);
  const [source, setSource] = useState<GraphChunkRef | null>(null);
  const [pathOpen, setPathOpen] = useState(false);
  const [pathStart, setPathStart] = useState('');
  const [pathEnd, setPathEnd] = useState('');
  const [path, setPath] = useState<GraphSubgraph | null>(null);
  const [busy, setBusy] = useState(false);
  const distribution = Object.entries(stats?.typeDistribution ?? {});

  const initialize = useCallback(async () => {
    const sequence = ++actionSequence.current;
    setGraphLoading(true); setGraphError('');
    try {
      const result = await api.entities({ appId: app.id, page: 1, size: 1 });
      if (sequence !== actionSequence.current) return;
      const first = result.records[0];
      if (!first) { setGraph(EMPTY_GRAPH); setRoot(''); setSelected(null); return; }
      const initial = await api.subgraph(app.id, first.entityId, 1);
      if (sequence !== actionSequence.current) return;
      setGraph(initial); setRoot(first.entityId); setSelected(first.entityId); setSelectedEdge(null); setPath(null);
      setLayoutRevision(revision => revision + 1);
      setRelationFilter('');
    } catch (e: any) { if (sequence === actionSequence.current) setGraphError(e.message || '图谱加载失败'); }
    finally { if (sequence === actionSequence.current) setGraphLoading(false); }
  }, [api, app.id]);
  useEffect(() => { initialize(); return () => { actionSequence.current++; }; }, [initialize]);
  useEffect(() => {
    let live = true;
    setCatalogLoading(true); setCatalogError('');
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.entities({ appId: app.id, type: type || undefined, q: query.trim() || undefined, page, size: 12 });
        if (live) { setCatalog(result.records ?? []); setTotal(result.totalRow ?? 0); }
      } catch (e: any) { if (live) { setCatalog([]); setTotal(0); setCatalogError(e.message || '实体搜索失败'); } }
      finally { if (live) setCatalogLoading(false); }
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [api, app.id, type, query, page]);
  useEffect(() => {
    let live = true;
    setDetail(null); setDetailError('');
    if (!selected) { setDetailLoading(false); return; }
    setDetailLoading(true);
    api.entityDetail(selected, app.id).then(result => { if (live) setDetail(result); }).catch(e => { if (live) setDetailError(e.message || '实体详情加载失败'); }).finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [api, selected]);

  const changeType = (next: string) => { setType(next); setPage(1); setPath(null); setSearchParams(p => { const result = new URLSearchParams(p); if (next) result.set('type', next); else result.delete('type'); return result; }, { replace: true }); };
  const selectNode = async (id: string | null) => {
    setSelected(id); setSelectedEdge(null);
    if (id && !graph.nodes.some(n => n.id === id)) {
      try { const more = await api.subgraph(app.id, id, 1); setGraph(g => mergeSubgraphs(g, more)); }
      catch (e: any) { toast.showError(e.message || '实体关联加载失败'); }
    }
  };
  const expand = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const more = await api.subgraph(app.id, id, 1);
      const added = more.nodes.filter(n => !graph.nodes.some(old => old.id === n.id)).length;
      setGraph(g => mergeSubgraphs(g, more)); setSelected(id); setSelectedEdge(null); setPath(null);
      toast.showInfo(added ? `已展开 ${added} 个关联实体` : '这些直接关联已全部显示，可以继续展开相邻实体');
    } catch (e: any) { toast.showError(e.message || '展开失败'); }
    finally { setBusy(false); }
  };
  const focusNeighbours = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try { const next = await api.subgraph(app.id, selected, 1); setGraph(next); setRoot(selected); setLayoutRevision(revision => revision + 1); setPath(null); changeType(''); setRelationFilter(''); }
    catch (e: any) { toast.showError(e.message || '关联加载失败'); }
    finally { setBusy(false); }
  };
  const pathGraph = demo ? DEMO_GRAPH : graph;
  const candidatePath = useMemo(() => pathStart && pathEnd ? shortestPath(pathGraph, pathStart, pathEnd) : null, [pathGraph, pathStart, pathEnd]);
  const pathIds = useMemo(() => new Set(path?.nodes.map(n => n.id)), [path]);
  const pathEdges = useMemo(() => new Set(path?.edges.map(edgeKey)), [path]);
  const visibleEdges = useMemo(() => graph.edges.filter(e => !relationFilter || e.relation === relationFilter), [graph, relationFilter]);
  const relationOptions = [...new Set(graph.edges.map(e => e.relation ?? '关联'))];
  const viewNodes = useMemo(()=>relationFilter ? graph.nodes.filter(n => visibleEdges.some(e => e.source === n.id || e.target === n.id)) : graph.nodes,[graph.nodes,visibleEdges,relationFilter]);
  const positions = useMemo(() => {
    const previous=layoutSnapshot.current;
    const next=layoutKnowledgeGraph(graph,root,previous.root===root&&previous.revision===layoutRevision?previous.positions:undefined);
    layoutSnapshot.current={root,revision:layoutRevision,positions:next}; return next;
  }, [graph, root, layoutRevision]);
  const nodes: StudioNode[] = useMemo(()=>viewNodes.map(n => ({ id: n.id, position: positions.get(n.id) ?? { x: 460, y: 340 }, data: {
    label: n.name, category: n.type || '未分类', root: n.id === root,
    dim: path ? !pathIds.has(n.id) : !!type && n.type !== type,
  } })),[viewNodes,positions,root,path,pathIds,type]);
  const edges: StudioEdge[] = useMemo(()=>visibleEdges.map(e => {
    const a = positions.get(e.source) ?? { x: 0, y: 0 }, b = positions.get(e.target) ?? { x: 0, y: 0 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const sourceSide = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'bottom' : 'top';
    const targetSide = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' }[sourceSide];
    return { id: edgeKey(e), source: e.source, target: e.target, label: e.relation, sourceHandle: `source-${sourceSide}`, targetHandle: `target-${targetSide}`,
    data: { emphasis: path ? pathEdges.has(edgeKey(e)) : selectedEdge ? edgeKey(selectedEdge) === edgeKey(e) : e.source === selected || e.target === selected,
      dim: path ? !pathEdges.has(edgeKey(e)) : !!type && ![e.source, e.target].some(id => graph.nodes.find(n => n.id === id)?.type === type) },
  }; }),[visibleEdges,positions,path,pathEdges,selectedEdge,selected,type,graph.nodes]);
  const exportGraph = () => {
    const payload = { nodes: viewNodes, edges: visibleEdges };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${demo ? 'atlas-demo' : 'knowledge'}-graph.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.showSuccess('当前网络已导出为 JSON');
  };
  const openPath = () => {
    const start = selected || root;
    setPathStart(start); setPathEnd(pathGraph.nodes.find(n => n.id !== start && !graph.nodes.some(v => v.id === n.id))?.id || pathGraph.nodes.find(n => n.id !== start)?.id || ''); setPathOpen(true);
  };
  const nodeName = (id: string) => graph.nodes.find(n => n.id === id)?.name || id;

  if (!active) return null;

  return <section className="knowledge-studio graph-studio space-y-4" aria-label="知识图谱工作区">
    <div className={THEME.pageHeader}>
      <p className={THEME.pageDesc}>查看实体关系与知识来源，逐步展开关联网络。</p>
      <div className="studio-heading-actions"><button className={`${THEME.button.secondary} studio-button`} onClick={exportGraph} disabled={!graph.nodes.length}><Download size={14} />导出网络</button><button className={`${THEME.button.primary} studio-button`} onClick={openPath} disabled={pathGraph.nodes.length < 2}><Route size={14} />查找关联路径</button></div>
    </div>
    <div className="studio-stats" aria-label="图谱统计">
      <span className="studio-stat"><Network size={15} />知识实体 <strong>{statsLoading ? '—' : stats?.entityCount ?? 0}</strong></span>
      <span className="studio-stat"><GitBranch size={15} />实体关系 <strong>{statsLoading ? '—' : stats?.relationCount ?? 0}</strong></span>
      <span className="studio-stat"><Shapes size={15} />实体类别 <strong>{statsLoading ? '—' : distribution.length}</strong></span>
      <span className="studio-stat studio-stat-status"><i className="studio-status-dot" />{demo ? '示例数据' : graphLoading ? '正在加载' : stats?.lastExtractTime ? '图谱已更新' : '知识网络'}</span>
    </div>
    {graphError && <div className="studio-error"><Info size={14} />{graphError}<button className={`${THEME.button.secondary} studio-button is-small`} onClick={initialize}>重新加载</button></div>}
    <div className="studio-workspace"><div className="studio-workspace-toolbar"><div className="studio-segment"><button aria-pressed={view === 'network'} onClick={() => setView('network')}><LayoutGrid size={14} />网络视图</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} />关系清单</button></div><button className={`${THEME.button.secondary} studio-button`} onClick={() => { changeType(''); setQuery(''); setPage(1); initialize(); }} disabled={graphLoading}><Focus size={14} />返回总览</button></div>
      <div className="studio-body"><aside className={`${THEME.card} studio-library`}><div className="studio-library-title">实体目录<span className="studio-small-count">{total}</span></div><div className="studio-search"><Search size={15} /><input aria-label="搜索知识实体" placeholder="搜索名称或别名…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />{query && <button className="studio-icon-button" aria-label="清空实体搜索" onClick={() => { setQuery(''); setPage(1); }}><X size={12} /></button>}</div>
        <label className="mb-3 block"><select aria-label="筛选实体类别" value={type} onChange={e => changeType(e.target.value)} className={`${THEME.select} studio-select`}><option value="">全部类别</option>{distribution.map(([name, count]) => <option key={name} value={name}>{name} · {count}</option>)}</select></label>
        <div className="studio-library-scroll">{catalogLoading ? <div className="studio-loading"><Spinner size={15} /></div> : catalog.map(entity => <button key={entity.entityId} className={`studio-library-item ${selected === entity.entityId ? 'is-active' : ''}`} onClick={() => selectNode(entity.entityId)}><span className="studio-type-icon" style={{ '--node-color': colorOfType(entity.entityType) } as React.CSSProperties}><TypeIcon type={entity.entityType} size={14} /></span><div><strong>{entity.name}</strong><small>{entity.entityType || '未分类'}</small></div><ChevronRight size={11} /></button>)}{!catalogLoading && !catalog.length && <div className="studio-empty-list">{catalogError || '没有找到匹配实体'}{query && <button className={`${THEME.button.secondary} studio-button is-small mt-3`} onClick={() => { setQuery(''); changeType(''); }}>清除筛选</button>}</div>}</div>
        {total > 12 && <div className="studio-pagination"><button className="studio-icon-button" aria-label="上一页实体" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button><span>{page} / {Math.ceil(total / 12)}</span><button className="studio-icon-button" aria-label="下一页实体" disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button></div>}
        <div className="studio-library-footer"><div className="studio-library-note"><Info size={12} /><span>先找到一个实体，再逐步展开。<br />类别筛选会聚焦对应的节点。</span></div><button className={`${THEME.button.secondary} studio-button mt-3`} onClick={() => setHelp(true)}><CircleHelp size={12} />探索小指南</button></div>
      </aside>
      <div className={`${THEME.card} studio-main`}><div className="studio-type-chips"><span>类别</span><button className="studio-type-chip" aria-pressed={!type} onClick={() => changeType('')}>全部</button>{distribution.map(([name]) => <button key={name} className="studio-type-chip" aria-pressed={type === name} onClick={() => changeType(type === name ? '' : name)}><i style={{ background: colorOfType(name) }} />{name}</button>)}</div>
        <div className="studio-main-heading"><SlidersHorizontal size={11} /><span>关系</span><select aria-label="筛选图谱关系" value={relationFilter} onChange={e => { setRelationFilter(e.target.value); setPath(null); }} className="border-0 bg-transparent p-0 pr-5 text-xs shadow-none outline-none"><option value="">全部关系</option>{relationOptions.map(name => <option key={name} value={name}>{name}</option>)}</select><span className="studio-flex-spacer" /><span>{type ? `聚焦「${type}」` : '箭头表示关系方向'}</span></div>
        {path && <div className="studio-path-summary"><Route size={12} /><strong>最短关联路径</strong><span>{path.nodes.map(n => n.name).join(' → ')} · {path.edges.length} 步</span><button className="studio-icon-button" aria-label="清除路径高亮" onClick={() => setPath(null)}><X size={12} /></button></div>}
        {graphLoading ? <div className="studio-loading flex-1"><Spinner size={19} />正在连接知识…</div> : view === 'network' ? <KnowledgeCanvas ref={canvas} snapshotRef={sceneSnapshot} nodes={nodes} edges={edges} selectedId={selected} layoutKey={`${root}|${layoutRevision}`} onSelectNode={selectNode} onExpand={expand} onSelectEdge={id => { setSelected(null); setSelectedEdge(graph.edges.find(e => edgeKey(e) === id) ?? null); }} /> : <div className="studio-table-wrap"><table className="studio-table"><thead><tr><th>起点实体</th><th>关系</th><th>目标实体</th></tr></thead><tbody>{visibleEdges.map(edge => <tr key={edgeKey(edge)} onClick={() => { setSelected(null); setSelectedEdge(edge); }}><td><button onClick={e => { e.stopPropagation(); selectNode(edge.source); }}>{nodeName(edge.source)}</button></td><td>{edge.relation}<ArrowRight size={10} className="ml-1 inline" /></td><td><button onClick={e => { e.stopPropagation(); selectNode(edge.target); }}>{nodeName(edge.target)}</button></td></tr>)}</tbody></table>{!visibleEdges.length && <div className="studio-empty-list">当前筛选下没有关系</div>}</div>}
      </div>
      <aside className={`${THEME.card} studio-inspector`}><div className="studio-inspector-heading"><span><Info size={14} />{selectedEdge ? '关系详情' : selected ? '实体详情' : '探索指南'}</span>{(selected || selectedEdge) && <button className="studio-icon-button" aria-label="关闭图谱详情" onClick={() => { setSelected(null); setSelectedEdge(null); }}><X size={14} /></button>}</div>
        <div className="studio-inspector-content">{detailLoading ? <div className="studio-loading"><Spinner size={18} /></div> : detailError ? <div className="studio-error">{detailError}</div> : selectedEdge ? <>
          <span className="studio-type-icon studio-detail-icon"><GitBranch size={20} /></span><h3 className="studio-detail-name">{selectedEdge.relation || '关联'}</h3><div className="studio-detail-kind"><span className="studio-tag">有向关系</span></div><div className="studio-callout"><strong>{nodeName(selectedEdge.source)}</strong><div className="my-2 flex items-center gap-2"><ArrowDown size={13} />{selectedEdge.relation}</div><strong>{nodeName(selectedEdge.target)}</strong></div><p className="studio-detail-description mt-4">{selectedEdge.description || '沿箭头从起点阅读到目标，可以理解这条关系。'}</p>
          {selectedEdge.weight != null && <div className="studio-detail-section"><h4>关系信息</h4><div className="studio-property"><span>置信度</span><strong>{Math.round(selectedEdge.weight * 100)}%</strong></div></div>}
          <div className="studio-detail-section"><h4>关联实体</h4>{[selectedEdge.source, selectedEdge.target].map(id => <button className="studio-related-item" key={id} onClick={() => selectNode(id)}><TypeIcon type={graph.nodes.find(n => n.id === id)?.type} size={12} /><strong>{nodeName(id)}</strong><ChevronRight size={12} /></button>)}</div>
        </> : detail ? <>
          <span className="studio-type-icon studio-detail-icon" style={{ '--node-color': colorOfType(detail.entity.entityType) } as React.CSSProperties}><TypeIcon type={detail.entity.entityType} size={21} /></span><h3 className="studio-detail-name">{detail.entity.name}</h3><div className="studio-detail-kind"><span className="studio-tag"><i className="h-1 w-1 rounded-full" style={{ background: colorOfType(detail.entity.entityType) }} />{detail.entity.entityType || '未分类'}</span><span>{detail.relations?.length ?? 0} 条直接关联</span></div><p className="studio-detail-description">{detail.entity.summary || '从下方关系和来源中了解这个实体。'}</p>
          {!!detail.entity.aliases?.length && <div className="mt-3 flex flex-wrap gap-1">{detail.entity.aliases.map(alias => <span className="studio-tag" key={alias}>{alias}</span>)}</div>}
          <div className="studio-detail-section"><h4>实体属性</h4>{Object.entries(detail.properties ?? {}).map(([name, value]) => <div className="studio-property" key={name}><span>{name}</span><strong>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</strong></div>)}{!Object.keys(detail.properties ?? {}).length && <p className="studio-muted text-xs">暂无扩展属性</p>}</div>
          <div className="studio-detail-section"><h4>直接关联<span className="studio-small-count">{detail.relations?.length ?? 0}</span></h4>{detail.relations?.map((relation, i) => <button className="studio-related-item" key={`${relation.targetEntityId}-${i}`} onClick={() => selectNode(relation.targetEntityId)} title={relation.direction === 'out' ? `${detail.entity.name} ${relation.relationType} ${relation.targetName}` : `${relation.targetName} ${relation.relationType} ${detail.entity.name}`}>
            {relation.direction === 'out' ? <ArrowRight size={10} /> : <ArrowLeft size={10} />}<span className="studio-tag">{relation.relationType}</span><strong>{relation.targetName}</strong><ChevronRight size={10} />
          </button>)}</div>
          <div className="studio-detail-section"><h4><span className="flex items-center gap-1.5"><FileText size={13} />知识来源</span><span className="studio-small-count">{detail.sourceChunks?.length ?? 0}</span></h4>{detail.sourceChunks?.map(chunk => <div className="studio-source-card" key={chunk.chunkId}><button onClick={() => setSource(chunk)}><FileText size={13} /><strong>{chunk.docName || '来源文档'}</strong><span>{chunk.pageNo ? `第 ${chunk.pageNo} 页` : ''}</span><ChevronRight size={12} /></button><p>{chunk.snippet?.slice(0, 85) || '点击查看来源信息'}{(chunk.snippet?.length ?? 0) > 85 ? '…' : ''}</p></div>)}{!detail.sourceChunks?.length && <p className="studio-muted text-xs">暂无来源片段</p>}</div>
        </> : <><span className="studio-type-icon studio-detail-icon"><Network size={21} /></span><h3 className="studio-detail-name">从好奇开始探索</h3><p className="studio-detail-description mt-3">每个节点是一条知识，每条连线是一种联系。点击它们，看看知识背后的故事。</p><div className="studio-callout"><strong>试试这样的探索</strong>找到一个项目 → 查看负责人员 → 展开所在团队 → 发现更多相关项目。</div></>}
        </div>
        <div className="studio-detail-actions">{selected ? <><button className={`${THEME.button.primary} studio-button`} disabled={busy} onClick={() => expand(selected)}><Expand size={12} />{busy ? '展开中…' : '展开关联'}</button><button className={`${THEME.button.secondary} studio-button`} disabled={busy} onClick={focusNeighbours}><Focus size={12} />只看关联</button></> : <button className={`${THEME.button.secondary} studio-button`} onClick={() => setHelp(true)}><CircleHelp size={12} />快速入门</button>}</div>
      </aside></div><div className="studio-footer"><span><i className="studio-status-dot" />已展示 {viewNodes.length} / {stats?.entityCount ?? graph.nodes.length} 个实体 · {demo ? '示例数据，可自由探索' : '按需展开关联网络'}</span><button className="studio-help-link" onClick={() => setHelp(true)}><CircleHelp size={11} />如何探索图谱</button></div>
    </div><div className="studio-guide-strip"><a href="#" onClick={e => { e.preventDefault(); setSearchParams(p => { const next = new URLSearchParams(p); next.set('tab', 'ontology'); next.delete('type'); return next; }); }}>查看本体定义<ArrowRight size={14} /></a></div>

    <Modal open={pathOpen} title="查找知识之间的关联" onClose={() => setPathOpen(false)} footer={<><button className={`${THEME.button.secondary} studio-button`} onClick={() => setPathOpen(false)}>取消</button><button className={`${THEME.button.primary} studio-button`} disabled={!candidatePath || pathStart === pathEnd} onClick={() => { if (!candidatePath) return; setGraph(g => mergeSubgraphs(g, candidatePath)); changeType(''); setPath(candidatePath); setSelected(candidatePath.nodes[0].id); setSelectedEdge(null); setRelationFilter(''); setView('network'); setPathOpen(false); }}><Route size={12} />在图中查看路径</button></>}>
      <div className="knowledge-studio studio-form"><p className="studio-detail-description">{demo ? '在示例网络中' : '在当前已加载的网络中'}，查找两个实体之间最少的连接步数。查找时不区分方向，图中仍保留关系箭头。</p><label><span>从这个实体出发</span><select aria-label="路径起点" value={pathStart} onChange={e => setPathStart(e.target.value)}>{pathGraph.nodes.map(n => <option value={n.id} key={n.id}>{n.name} · {n.type}</option>)}</select></label><label><span>找到这个实体</span><select aria-label="路径终点" value={pathEnd} onChange={e => setPathEnd(e.target.value)}>{pathGraph.nodes.map(n => <option value={n.id} key={n.id}>{n.name} · {n.type}</option>)}</select></label>
        <div className="studio-path-preview">{pathStart === pathEnd ? '请选择两个不同的实体。' : candidatePath ? <><span className="studio-tag">{candidatePath.edges.length} 步</span>{candidatePath.nodes.map((n, i) => <React.Fragment key={n.id}>{i > 0 && <ArrowRight size={12} />}<span>{n.name}</span></React.Fragment>)}</> : '这两个实体在当前网络中尚未找到关联。试着展开更多节点。'}</div>
      </div>
    </Modal>
    <Modal open={!!source} title={source?.docName || '知识来源'} onClose={() => setSource(null)}><div className="knowledge-studio"><div className="mb-4 flex gap-2"><span className="studio-tag"><FileText size={13} />{demo ? '示例文档片段' : '文档原文片段'}</span>{source?.pageNo && <span className="studio-tag">第 {source.pageNo} 页</span>}</div><blockquote className="studio-source-modal">{source?.snippet || '当前来源没有返回原文片段。'}</blockquote><p className="studio-muted mt-4 text-xs">{demo ? '此片段为示例数据，用于展示来源追溯。' : `来源文档：${source?.docName || source?.docId}`}</p></div></Modal>
    <Modal open={help} title="从一个节点，读懂一张图" onClose={() => setHelp(false)}><div className="knowledge-studio studio-help-steps">{[['查找感兴趣的实体', '左侧搜索支持名称与别名。类别筛选同步聚焦图中的对应节点。'], ['沿着关系逐步展开', '点击节点看详情，点击“展开关联”或双击节点加载它的邻居。“只看关联”将它作为新的中心。'], ['查看路径与知识来源', '查找两点之间的关联路径；点击连线读懂方向，点击来源片段查看证据。'], ['随时回到熟悉的视图', '拖拽画布、滚轮缩放；底部可暂停动画、隐藏关系文字、适应画布或全屏。点击“返回总览”重置探索。']].map(([title, text], i) => <div className="studio-help-step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}</div></Modal>
  </section>;
}






