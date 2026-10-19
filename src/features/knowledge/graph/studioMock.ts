import type {
  GraphEntity, GraphEntityDetail, GraphStats, GraphSubgraph, KnowledgeApp,
  Ontology, OntologyOverview, OntologyVersion, PageResult,
} from '../../../shared/types/knowledge';
import { graphService, ontologyService } from '../../../shared/services/knowledge';
import { neighbourhood } from './graphAlgorithms';

export const DEMO_APP: KnowledgeApp = {
  id: 'demo', name: 'Atlas · 企业知识库', mode: 'TEAM', myRole: 'OWNER',
  graphEnabled: true, docCount: 4, remark: '将项目、团队与技术连接起来，让每一条知识都能找到来处。',
};

export const DEMO_ONTOLOGY: Ontology = {
  version: 3, status: 'ACTIVE', autoMergeAliases: true,
  entityTypes: [
    { name: '项目', description: '有明确目标、参与团队和交付成果的工作项目。', attributes: ['项目状态: string', '负责人: string', '启动日期: date'] },
    { name: '人员', description: '参与项目、负责技术或编写文档的团队成员。', attributes: ['职位: string', '专业方向: string'] },
    { name: '组织', description: '开展协作的部门、团队与研究机构。', attributes: ['团队规模: number', '职能: string'] },
    { name: '技术', description: '项目采用的方法、工具与技术体系。', attributes: ['技术领域: string', '成熟度: string'] },
    { name: '文档', description: '记录设计、规范和评估结果的知识载体。', attributes: ['文档格式: string', '版本: string', '更新日期: date'] },
    { name: '地点', description: '团队办公与项目协作所在的空间。', attributes: ['城市: string', '地址: string'] },
    { name: '数据库', parent: '技术', description: '用于存储、管理与查询数据的技术。', attributes: ['数据模型: string'] },
    { name: '算法', parent: '技术', description: '用于分析数据、抽取实体与检索信息的方法。', attributes: ['任务类型: string'] },
  ],
  relationTypes: [
    { name: '负责', sourceTypes: ['人员'], targetTypes: ['项目'], description: '团队成员对项目交付承担责任。' },
    { name: '参与', sourceTypes: ['组织'], targetTypes: ['项目'], description: '团队参与项目的设计或实施。' },
    { name: '采用', sourceTypes: ['项目'], targetTypes: ['技术', '数据库', '算法'], description: '项目使用的技术、数据库或算法。' },
    { name: '属于', sourceTypes: ['人员'], targetTypes: ['组织'], description: '成员所在的团队。' },
    { name: '记录', sourceTypes: ['文档'], targetTypes: ['项目'], description: '文档记录项目的设计与成果。' },
    { name: '位于', sourceTypes: ['组织'], targetTypes: ['地点'], description: '团队所在的办公地点。' },
    { name: '包含', sourceTypes: ['项目'], targetTypes: ['项目'], description: '平台项目包含的子项目。' },
  ],
  synonymRules: [
    { canonical: '知识图谱', aliases: ['Knowledge Graph', 'KG'] },
    { canonical: '实体识别', aliases: ['命名实体识别', 'NER'] },
    { canonical: '向量检索', aliases: ['语义检索', 'Vector Search'] },
  ],
};

const rows = [
  ['atlas', 'Atlas 知识平台', '项目', '连接分散的企业知识，支持语义检索、知识问答与图谱探索。'],
  ['search', '知识检索服务', '项目', '融合关键词和向量检索，为知识问答提供相关证据。'],
  ['explorer', '图谱探索器', '项目', '以交互式网络连接项目、团队和技术，发现隐含关联。'],
  ['parser', '文档解析服务', '项目', '将 PDF、Word 等非结构化文档转换为可检索的知识。'],
  ['lin', '林悦', '人员', '产品负责人，负责知识平台的体验设计和项目交付。'],
  ['chen', '陈默', '人员', '知识工程师，负责图谱建模与实体关系抽取。'],
  ['zhou', '周宁', '人员', '搜索工程师，负责混合检索与效果评估。'],
  ['su', '苏青', '人员', '数据工程师，负责文档解析与数据质量。'],
  ['product', '智能产品组', '组织', '负责知识平台的产品规划、设计和研发协作。'],
  ['engineering', '知识工程组', '组织', '负责本体建模、知识抽取与检索技术。'],
  ['kg', '知识图谱', '技术', '通过实体与关系组织知识，使信息之间的联系可被发现。'],
  ['hybrid', '混合检索', '技术', '结合关键词匹配与语义相似度，提高检索覆盖率。'],
  ['rag', '检索增强生成', '技术', '先检索相关知识，再基于证据生成回答。'],
  ['ner', '实体识别', '算法', '从文档中识别人名、机构、项目与技术等实体。'],
  ['vector', '向量检索', '算法', '将文本映射到向量空间，查找语义相似的内容。'],
  ['neo4j', 'Neo4j', '数据库', '存储和查询实体及其关系的图数据库。'],
  ['postgres', 'PostgreSQL', '数据库', '存储文档元信息与结构化业务数据。'],
  ['design', '平台设计方案', '文档', '描述 Atlas 知识平台的目标、架构与实施计划。'],
  ['guide', '图谱接入指南', '文档', '记录图谱建模、数据映射与接入流程。'],
  ['report', '检索评估报告', '文档', '记录检索服务的实验设置、指标与评估结果。'],
  ['spec', '文档解析规范', '文档', '说明文档解析流程、格式支持与质量要求。'],
  ['hangzhou', '杭州研发中心', '地点', '智能产品组的主要办公地点。'],
  ['shanghai', '上海协作空间', '地点', '知识工程组的协作办公地点。'],
];

export const DEMO_ENTITIES: GraphEntity[] = rows.map(([entityId, name, entityType, summary]) => ({
  entityId, name, entityType, summary,
  aliases: DEMO_ONTOLOGY.synonymRules?.find(rule => rule.canonical === name)?.aliases ?? [],
}));

const facts = [
  ['atlas', 'search', '包含'], ['atlas', 'explorer', '包含'], ['atlas', 'parser', '包含'],
  ['lin', 'atlas', '负责'], ['chen', 'explorer', '负责'], ['zhou', 'search', '负责'], ['su', 'parser', '负责'],
  ['product', 'atlas', '参与'], ['engineering', 'atlas', '参与'], ['engineering', 'explorer', '参与'],
  ['engineering', 'search', '参与'], ['product', 'parser', '参与'],
  ['lin', 'product', '属于'], ['chen', 'engineering', '属于'], ['zhou', 'engineering', '属于'], ['su', 'product', '属于'],
  ['atlas', 'kg', '采用'], ['atlas', 'rag', '采用'], ['atlas', 'postgres', '采用'],
  ['explorer', 'kg', '采用'], ['explorer', 'neo4j', '采用'], ['explorer', 'ner', '采用'],
  ['search', 'hybrid', '采用'], ['search', 'vector', '采用'], ['search', 'rag', '采用'],
  ['parser', 'ner', '采用'], ['parser', 'postgres', '采用'],
  ['design', 'atlas', '记录'], ['guide', 'explorer', '记录'], ['report', 'search', '记录'], ['spec', 'parser', '记录'],
  ['product', 'hangzhou', '位于'], ['engineering', 'shanghai', '位于'],
];

export const DEMO_GRAPH: GraphSubgraph = {
  nodes: DEMO_ENTITIES.map(e => ({ id: e.entityId, name: e.name, type: e.entityType })),
  edges: facts.map(([source, target, relation], i) => ({
    source, target, relation, weight: Number((0.88 + (i % 7) * 0.017).toFixed(2)),
    sourceDocId: ['design', 'guide', 'report', 'spec'][i % 4],
    description: `${DEMO_ENTITIES.find(e => e.entityId === source)!.name} ${relation} ${DEMO_ENTITIES.find(e => e.entityId === target)!.name}。`,
  })),
};

export const DEMO_STATS: GraphStats = {
  entityCount: DEMO_GRAPH.nodes.length, relationCount: DEMO_GRAPH.edges.length,
  typeDistribution: DEMO_ENTITIES.reduce((counts, e) => ({ ...counts, [e.entityType!]: (counts[e.entityType!] ?? 0) + 1 }), {} as Record<string, number>),
  lastExtractTime: Date.UTC(2026, 9, 12, 8),
};

const STORAGE_KEY = 'orrery-knowledge-studio-demo-v1';
type DemoState = { active: Ontology; draft: Ontology | null; versions: OntologyVersion[] };
function readState(): DemoState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw?.active?.entityTypes && Array.isArray(raw.versions)) return raw;
  } catch { /* localStorage 不可用时仍可探索数据。 */ }
  return { active: structuredClone(DEMO_ONTOLOGY), draft: null, versions: [
    { version: 3, changeNote: '补充技术子类与文档来源关系', createTime: Date.UTC(2026, 9, 12, 8), affectedTypes: ['数据库', '算法'] },
    { version: 2, changeNote: '建立项目、团队与技术的关系规则', createTime: Date.UTC(2026, 9, 9, 6) },
    { version: 1, changeNote: '创建企业知识的基础类型', createTime: Date.UTC(2026, 9, 1, 9) },
  ] };
}
function persist(state: DemoState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function graphApi(appId: string): typeof graphService {
  if (appId !== DEMO_APP.id) return graphService;
  return {
    stats: async () => structuredClone(DEMO_STATS),
    entities: async ({ q = '', type = '', page = 1, size = 20 }) => {
      const records = DEMO_ENTITIES.filter(e => (!type || e.entityType === type) &&
        [e.name, ...(e.aliases ?? [])].some(name => name.toLowerCase().includes(q.toLowerCase())));
      return { records: structuredClone(records.slice((page - 1) * size, page * size)), totalRow: records.length,
        pageNumber: page, pageSize: size, totalPage: Math.ceil(records.length / size) } satisfies PageResult<GraphEntity>;
    },
    subgraph: async (_, id, depth) => structuredClone(neighbourhood(DEMO_GRAPH, id, depth)),
    entityDetail: async id => {
      const entity = DEMO_ENTITIES.find(e => e.entityId === id);
      if (!entity) throw new Error('示例实体不存在');
      const edges = DEMO_GRAPH.edges.filter(e => e.source === id || e.target === id);
      const properties = entity.entityType === '项目' ? { 项目状态: '进行中', 启动日期: '2026-09-01' }
        : entity.entityType === '人员' ? { 职位: entity.summary?.split('，')[0], 专业方向: '企业知识工程' }
        : entity.entityType === '文档' ? { 文档格式: 'PDF', 版本: 'v1.2', 更新日期: '2026-10-12' }
        : entity.entityType === '地点' ? { 城市: entity.name.startsWith('杭州') ? '杭州' : '上海' }
        : entity.entityType === '组织' ? { 团队规模: id === 'product' ? 8 : 6, 职能: entity.summary }
        : { 技术领域: '知识工程', 成熟度: '生产可用' };
      return structuredClone({ entity, properties, relations: edges.map(e => {
        const target = DEMO_ENTITIES.find(n => n.entityId === (e.source === id ? e.target : e.source))!;
        return { relationType: e.relation!, direction: e.source === id ? 'out' : 'in', targetEntityId: target.entityId,
          targetName: target.name, targetType: target.entityType, weight: e.weight, description: e.description, sourceDocId: e.sourceDocId };
      }), sourceChunks: edges.slice(0, 3).map((e, i) => ({ chunkId: `demo-${id}-${i}`, docId: e.sourceDocId!,
        docName: `${DEMO_ENTITIES.find(n => n.entityId === e.sourceDocId)?.name}.pdf`, pageNo: i + 2,
        snippet: `【示例原文】${e.description}该关联由项目资料中的明确描述整理，供界面演示使用。` })) } satisfies GraphEntityDetail);
    },
  };
}

export function ontologyApi(appId: string): typeof ontologyService {
  if (appId !== DEMO_APP.id) return ontologyService;
  return {
    overview: async () => {
      const state = readState();
      return structuredClone({ active: state.active, draft: state.draft, configured: true } satisfies OntologyOverview);
    },
    saveDraft: async (_, draft) => {
      const state = readState();
      state.draft = { ...structuredClone(draft), version: (state.active.version ?? 0) + 1, status: 'DRAFT', updateTime: Date.now() };
      persist(state);
      return state.draft;
    },
    publish: async (_, changeNote) => {
      const state = readState();
      const version = (state.active.version ?? 0) + 1;
      state.active = { ...(state.draft ?? state.active), version, status: 'ACTIVE', updateTime: Date.now() };
      state.draft = null;
      state.versions.unshift({ version, changeNote: changeNote || '更新本体定义', createTime: Date.now() });
      persist(state);
      return version;
    },
    versions: async () => structuredClone(readState().versions),
    suggest: async () => {
      const state = readState();
      state.draft = { ...structuredClone(DEMO_ONTOLOGY), status: 'DRAFT', version: (state.active.version ?? 0) + 1 };
      persist(state);
      return state.draft;
    },
  };
}
