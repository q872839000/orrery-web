import type { EntityTypeDef, GraphSubgraph } from '../../../shared/types/knowledge';
import type { StudioNode } from './KnowledgeCanvas';

/** 内容更新保留位置、尺寸和未变化的对象，避免悬停或详情更新重建整个画布。 */
export function reconcileStudioNodes(previous: StudioNode[], incoming: StudioNode[], selectedId?: string | null, resetPositions = false): StudioNode[] {
  const existing = new Map(previous.map(node => [node.id, node]));
  let changed = previous.length !== incoming.length;
  const next = incoming.map(node => {
    const old = existing.get(node.id);
    const selected = node.id === selectedId;
    if (old && old.selected === selected && JSON.stringify(old.data) === JSON.stringify(node.data) && (!resetPositions || old.position.x === node.position.x && old.position.y === node.position.y)) return old;
    changed = true;
    return { ...old, ...node, type: 'knowledge', selected, position: resetPositions ? node.position : old?.position ?? node.position,
      ariaLabel: `${node.data.schema ? '类型' : '实体'}：${node.data.label}，${node.data.category}` };
  });
  if (!changed && next.every((node, i) => node === previous[i])) return previous;
  return next;
}

/** 扩展时固定已有实体，新增实体寻找外围空位。没有逐帧力模拟。 */
export function layoutKnowledgeGraph(graph: GraphSubgraph, root: string, previous = new Map<string, { x: number; y: number }>()) {
  const positions = new Map<string, { x:number; y:number }>();
  for (const node of graph.nodes) { const old=previous.get(node.id); if(old) positions.set(node.id, old); }
  if (graph.nodes.some(node => node.id === root) && !positions.has(root)) positions.set(root,{x:460,y:340});
  const adjacent=new Set(graph.edges.flatMap(edge => edge.source===root?[edge.target]:edge.target===root?[edge.source]:[]));
  const inner=graph.nodes.filter(node=>node.id!==root&&adjacent.has(node.id)).sort((a,b)=>(a.type??'').localeCompare(b.type??'')||a.id.localeCompare(b.id));
  const outer=graph.nodes.filter(node=>node.id!==root&&!adjacent.has(node.id)).sort((a,b)=>(a.type??'').localeCompare(b.type??'')||a.id.localeCompare(b.id));
  [inner,outer].forEach((ring,ri)=>ring.forEach((node,i)=>{
    if(positions.has(node.id))return;
    let angle=i/Math.max(1,ring.length)*Math.PI*2-Math.PI/2+ri*.17;
    let radius=ri===0?Math.max(238,ring.length*24):375;
    let point={x:460+Math.cos(angle)*radius,y:340+Math.sin(angle)*radius*.84};
    for(let attempt=0;attempt<80&&[...positions.values()].some(old=>Math.hypot(old.x-point.x,(old.y-point.y)/.84)<145);attempt++){
      angle+=.38; if(attempt%16===15)radius+=75;
      point={x:460+Math.cos(angle)*radius,y:340+Math.sin(angle)*radius*.84};
    }
    positions.set(node.id,point);
  }));
  return positions;
}

export function typeFamilies(types: EntityTypeDef[]) {
  const names = new Set(types.map(type => type.name));
  return types.map((type, index) => ({ type, index })).filter(({ type }) => !type.parent || !names.has(type.parent));
}

export function inheritedAttributes(types: EntityTypeDef[], index: number) {
  const result: { attribute: string; owner: string }[] = [];
  const seenTypes = new Set<string>();
  const ownNames = new Set((types[index]?.attributes ?? []).map(attribute => attribute.split(/[:：]/)[0].trim()));
  let parent = types[index]?.parent;
  while (parent && !seenTypes.has(parent)) {
    seenTypes.add(parent);
    const definition = types.find(type => type.name === parent);
    for (const attribute of definition?.attributes ?? []) {
      const name = attribute.split(/[:：]/)[0].trim();
      if (!ownNames.has(name)) { result.push({ attribute, owner: parent }); ownNames.add(name); }
    }
    parent = definition?.parent;
  }
  return result;
}
