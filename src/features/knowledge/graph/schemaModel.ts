import dagre from '@dagrejs/dagre';
import type { EntityTypeDef, RelationTypeDef } from '../../../shared/types/knowledge';

export const SCHEMA_NODE_SIZE = { width: 160, height: 96 };
export const ANY_TYPE_ID = 'schema:any';
export const schemaTypeId = (name: string) => `schema:type:${name}`;

export interface SchemaLink {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: 'relation' | 'inheritance';
  relationIndex?: number;
  entityIndex?: number;
}

export interface SchemaBox { id: string; x: number; y: number; width: number; height: number }
type Point = { x: number; y: number };

/** Orthogonal routes avoid intermediate cards, including long and backward connections. */
export function routeSchemaRelation(source: Point, target: Point, boxes: SchemaBox[] = [], sourceId: string, targetId: string, lane = 0) {
  const obstacles = boxes.filter(box => box.id !== sourceId && box.id !== targetId);
  const clear = (points: Point[]) => points.slice(1).every((end, index) => {
    const start = points[index];
    return !obstacles.some(box => {
      const left = box.x - 12, right = box.x + box.width + 12, top = box.y - 12, bottom = box.y + box.height + 12;
      return start.y === end.y
        ? start.y > top && start.y < bottom && Math.max(start.x, end.x) > left && Math.min(start.x, end.x) < right
        : start.x > left && start.x < right && Math.max(start.y, end.y) > top && Math.min(start.y, end.y) < bottom;
    });
  });
  const candidates: Point[][] = [];
  let detoured = false;
  if (target.x > source.x + 50 && lane === 0) {
    const mid = (source.x + target.x) / 2 + lane * 16;
    for (const x of [mid, source.x + 28 + lane * 14, target.x - 28 - lane * 14]) {
      const points = [source, { x, y: source.y }, { x, y: target.y }, target];
      if (clear(points)) candidates.push(points);
    }
  }
  if (!candidates.length) {
    detoured = true;
    const relevant = boxes.filter(box => box.id === sourceId || box.id === targetId || box.x < Math.max(source.x, target.x) && box.x + box.width > Math.min(source.x, target.x));
    const top = Math.min(source.y, target.y, ...relevant.map(box => box.y)) - 32 - lane * 34;
    const bottom = Math.max(source.y, target.y, ...relevant.map(box => box.y + box.height)) + 32 + lane * 34;
    for (const y of [top, bottom]) for (const offset of [28, 44, 20]) {
      const points = [source, { x: source.x + offset, y: source.y }, { x: source.x + offset, y }, { x: target.x - offset, y }, { x: target.x - offset, y: target.y }, target];
      if (clear(points)) candidates.push(points);
    }
  }
  const length = (points: Point[]) => points.slice(1).reduce((sum, end, index) => sum + Math.abs(end.x - points[index].x) + Math.abs(end.y - points[index].y), 0);
  const distinct = (candidates.sort((a, b) => length(a) - length(b))[0] ?? [source, { x: (source.x + target.x) / 2, y: source.y }, { x: (source.x + target.x) / 2, y: target.y }, target]).filter((point, index, values) => !index || point.x !== values[index - 1].x || point.y !== values[index - 1].y);
  const points = distinct.filter((point, index) => {
    const before = distinct[index - 1], after = distinct[index + 1];
    return !before || !after || !(before.x === point.x && point.x === after.x || before.y === point.y && point.y === after.y);
  });
  if (points.length < 2) return { path: `M${source.x},${source.y}`, points, labelX: source.x, labelY: source.y };
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1], point = points[index], after = points[index + 1];
    const incoming = Math.hypot(point.x - before.x, point.y - before.y), outgoing = Math.hypot(after.x - point.x, after.y - point.y);
    const radius = Math.min(12, incoming / 2, outgoing / 2);
    path += ` L${point.x - (point.x - before.x) / incoming * radius},${point.y - (point.y - before.y) / incoming * radius} Q${point.x},${point.y} ${point.x + (after.x - point.x) / outgoing * radius},${point.y + (after.y - point.y) / outgoing * radius}`;
  }
  path += ` L${target.x},${target.y}`;
  const segments = points.slice(1).map((end, index) => ({ start: points[index], end }));
  const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  const distance = (segment: typeof segments[number]) => Math.abs((segment.start.x + segment.end.x) / 2 - center.x) + Math.abs((segment.start.y + segment.end.y) / 2 - center.y);
  const across = detoured ? segments.find((segment, index) => index > 0 && index < segments.length - 1 && segment.start.y === segment.end.y) : null;
  const segment = across ?? segments.sort((a, b) => distance(a) - distance(b))[0];
  return { path, points, labelX: (segment.start.x + segment.end.x) / 2, labelY: (segment.start.y + segment.end.y) / 2 };
}

/** Expand every allowed source/target pair; unrestricted ends retain a visible wildcard. */
export function schemaLinks(types: EntityTypeDef[], relations: RelationTypeDef[]): SchemaLink[] {
  const names = new Set(types.map(type => type.name));
  const links: SchemaLink[] = [];
  relations.forEach((relation, relationIndex) => {
    const sources = relation.sourceTypes?.length ? relation.sourceTypes.filter(name => names.has(name)).map(schemaTypeId) : [ANY_TYPE_ID];
    const targets = relation.targetTypes?.length ? relation.targetTypes.filter(name => names.has(name)).map(schemaTypeId) : [ANY_TYPE_ID];
    for (const source of sources) for (const target of targets) {
      links.push({ id: `schema:rule:${relationIndex}:${source}:${target}`, source, target, label: relation.name, kind: 'relation', relationIndex });
    }
  });
  types.forEach((type, entityIndex) => {
    if (type.parent && names.has(type.parent)) {
      links.push({ id: `schema:inherit:${entityIndex}`, source: schemaTypeId(type.name), target: schemaTypeId(type.parent), label: '继承', kind: 'inheritance', entityIndex });
    }
  });
  return links;
}

/** Arrange roots by business direction; descendants stay grouped with their real parent. */
export function layoutSchema(types: EntityTypeDef[], links: SchemaLink[]) {
  const definitions = new Map(types.map(type => [schemaTypeId(type.name), type]));
  const rootOf = (id: string) => {
    const seen = new Set<string>();
    let root = id;
    while (!seen.has(root)) {
      seen.add(root);
      const parent = definitions.get(root)?.parent;
      if (!parent || !definitions.has(schemaTypeId(parent))) break;
      root = schemaTypeId(parent);
    }
    return root;
  };
  const groups = new Map<string, string[]>();
  for (const id of definitions.keys()) {
    const root = rootOf(id);
    groups.set(root, [...groups.get(root) ?? [], id]);
  }
  if (links.some(link => link.source === ANY_TYPE_ID || link.target === ANY_TYPE_ID)) groups.set(ANY_TYPE_ID, [ANY_TYPE_ID]);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', ranksep: 96, nodesep: 65, marginx: 48, marginy: 76 });
  graph.setDefaultEdgeLabel(() => ({}));
  groups.forEach((ids, root) => {
    ids.sort((a, b) => Number(b === root) - Number(a === root));
    graph.setNode(root, { width: SCHEMA_NODE_SIZE.width, height: ids.length * (SCHEMA_NODE_SIZE.height + 44) - 44 });
  });
  links.filter(link => link.kind === 'relation').forEach(link => {
    const source = rootOf(link.source), target = rootOf(link.target);
    if (source !== target && graph.hasNode(source) && graph.hasNode(target)) graph.setEdge(source, target);
  });
  dagre.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  groups.forEach((ids, root) => {
    const group = graph.node(root);
    ids.forEach((id, index) => positions.set(id, { x: group.x - SCHEMA_NODE_SIZE.width / 2, y: group.y - group.height / 2 + index * (SCHEMA_NODE_SIZE.height + 44) }));
  });
  return positions;
}
