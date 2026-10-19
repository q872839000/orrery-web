import type { GraphSubgraph, Ontology } from '../../../shared/types/knowledge';

export const edgeKey = (edge: GraphSubgraph['edges'][number]) =>
  JSON.stringify([edge.source, edge.target, edge.relation ?? '关联']);

export function mergeSubgraphs(a: GraphSubgraph, b: GraphSubgraph): GraphSubgraph {
  return {
    nodes: [...new Map([...a.nodes, ...b.nodes].map(node => [node.id, node])).values()],
    edges: [...new Map([...a.edges, ...b.edges].map(edge => [edgeKey(edge), edge])).values()],
  };
}

/** 无向关联距离；返回原始有向边，展示时仍保留事实的方向。 */
export function shortestPath(graph: GraphSubgraph, start: string, end: string): GraphSubgraph | null {
  if (!graph.nodes.some(n => n.id === start) || !graph.nodes.some(n => n.id === end)) return null;
  const previous = new Map<string, { id: string; edge: GraphSubgraph['edges'][number] }>();
  const queue = [start];
  const visited = new Set(queue);
  for (let i = 0; i < queue.length && !visited.has(end); i++) {
    for (const edge of graph.edges) {
      const next = edge.source === queue[i] ? edge.target : edge.target === queue[i] ? edge.source : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        previous.set(next, { id: queue[i], edge });
        queue.push(next);
      }
    }
  }
  if (!visited.has(end)) return null;
  const ids = [end];
  const edges: GraphSubgraph['edges'] = [];
  while (ids[ids.length - 1] !== start) {
    const step = previous.get(ids[ids.length - 1])!;
    ids.push(step.id);
    edges.unshift(step.edge);
  }
  return { nodes: ids.reverse().map(id => graph.nodes.find(n => n.id === id)!), edges };
}

export function neighbourhood(graph: GraphSubgraph, root: string, depth: number): GraphSubgraph {
  const ids = new Set([root]);
  for (let i = 0; i < depth; i++) {
    const before = new Set(ids);
    graph.edges.forEach(edge => {
      if (before.has(edge.source)) ids.add(edge.target);
      if (before.has(edge.target)) ids.add(edge.source);
    });
  }
  return {
    nodes: graph.nodes.filter(node => ids.has(node.id)),
    edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)),
  };
}

export function validateOntology(draft: Pick<Ontology, 'entityTypes' | 'relationTypes' | 'synonymRules'>): string | null {
  const names = draft.entityTypes.map(t => t.name.trim());
  if (names.some(n => !n)) return '请为所有类型填写名称。';
  if (new Set(names).size !== names.length) return '类型名称不能重复。';
  const relations = draft.relationTypes.map(r => r.name.trim());
  if (relations.some(n => !n)) return '请为所有关系填写名称。';
  if (new Set(relations).size !== relations.length) return '关系名称不能重复。';
  for (const type of draft.entityTypes) {
    const visited = new Set([type.name]);
    let parent = type.parent;
    while (parent) {
      if (!names.includes(parent)) return `「${type.name}」的父类型不存在。`;
      if (visited.has(parent)) return '类型继承不能形成循环。';
      visited.add(parent);
      parent = draft.entityTypes.find(t => t.name === parent)?.parent;
    }
  }
  for (const relation of draft.relationTypes) {
    if ([...(relation.sourceTypes ?? []), ...(relation.targetTypes ?? [])].some(n => !names.includes(n))) {
      return `「${relation.name}」引用了不存在的类型。`;
    }
  }
  const canonicals = (draft.synonymRules ?? []).map(rule => rule.canonical.trim());
  if (canonicals.some(name => !name)) return '请填写同义词的规范名称。';
  if (new Set(canonicals).size !== canonicals.length) return '同义词的规范名称不能重复。';
  return null;
}
