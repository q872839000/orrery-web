import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, CircleHelp, Copy, GitBranch, History, Info, List, Network, Pencil, Plus, Save, Search, Send, Shapes, Sparkles, Trash2, X } from 'lucide-react';
import type { EntityTypeDef, KnowledgeApp, Ontology, OntologyOverview, OntologyVersion, RelationTypeDef } from '../../../../shared/types/knowledge';
import { roleAtLeast } from '../../../../shared/constants/knowledge';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import Modal from '../../../../shared/components/ui/Modal';
import Spinner from '../../../../shared/components/ui/Spinner';
import { formatDateTime } from '../../../../shared/utils/date';
import { THEME } from '../../../../shared/styles/theme';
import SchemaCanvas, { type SchemaSelection } from '../../graph/SchemaCanvas';
import { TypeIcon } from '../../graph/KnowledgeCanvas';
import { colorOfType } from '../../graph/graphPalette';
import { DEMO_GRAPH, ontologyApi } from '../../graph/studioMock';
import { validateOntology } from '../../graph/graphAlgorithms';
import { inheritedAttributes } from '../../graph/studioModel';
import '../../graph/knowledgeStudio.css';
import '../../graph/ontologyStudio.css';

type Draft = Pick<Ontology, 'entityTypes' | 'relationTypes' | 'synonymRules' | 'autoMergeAliases'>;
type Section = 'entity' | 'relation' | 'synonym';
type EditForm = { kind: Section; index: number | null; name: string; description: string; parent: string; attributes: string; sources: string[]; targets: string[]; aliases: string };
const draftOf = (ontology?: Ontology | null): Draft => structuredClone({
  entityTypes: ontology?.entityTypes ?? [], relationTypes: ontology?.relationTypes ?? [],
  synonymRules: ontology?.synonymRules ?? [], autoMergeAliases: ontology?.autoMergeAliases ?? false,
});
const splitValues = (text: string) => [...new Set(text.split(/[\n,，、]/).map(s => s.trim()).filter(Boolean))];

function TypeChoices({ names, values, onChange }: { names: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return <div className="flex flex-wrap gap-2">{names.map(name => <button type="button" key={name} aria-pressed={values.includes(name)} className="studio-type-chip" onClick={() => onChange(values.includes(name) ? values.filter(n => n !== name) : [...values, name])}>
    <i style={{ background: colorOfType(name) }} />{name}{values.includes(name) && <Check size={10} />}
  </button>)}{names.length === 0 && <small>请先添加实体类型。</small>}</div>;
}

export default function OntologyTab({ app, active = true }: { app: KnowledgeApp; active?: boolean }) {
  const toast = useToast();
  const [, setSearchParams] = useSearchParams();
  const api = useMemo(() => ontologyApi(app.id), [app.id]);
  const demo = app.id === 'demo';
  const canEdit = roleAtLeast(app.myRole, 'EDITOR');
  const canPublish = roleAtLeast(app.myRole, 'OWNER');
  const [overview, setOverview] = useState<OntologyOverview | null>(null);
  const [draft, setDraft] = useState<Draft>(draftOf());
  const [saved, setSaved] = useState(JSON.stringify(draftOf()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('entity');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SchemaSelection>(null);
  const [synonymIndex, setSynonymIndex] = useState<number | null>(null);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [versions, setVersions] = useState<OntologyVersion[] | null>(null);
  const [help, setHelp] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const dirty = JSON.stringify(draft) !== saved;
  const names = draft.entityTypes.map(t => t.name);
  const entity = selected?.kind === 'entity' ? draft.entityTypes[selected.index] : null;
  const relation = selected?.kind === 'relation' ? draft.relationTypes[selected.index] : null;
  const synonym = section === 'synonym' && synonymIndex !== null ? draft.synonymRules?.[synonymIndex] : null;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const overview = await api.overview(app.id);
      const next = draftOf(overview.draft ?? overview.active);
      setOverview(overview); setDraft(next); setSaved(JSON.stringify(next));
      setSelected(null);
    } catch (e: any) { setError(e.message || '本体加载失败'); }
    finally { setLoading(false); }
  }, [api, app.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const openEdit = (kind: Section, index: number | null) => {
    const item = index === null ? null : kind === 'entity' ? draft.entityTypes[index] : kind === 'relation' ? draft.relationTypes[index] : draft.synonymRules?.[index];
    const entity = item as EntityTypeDef | null;
    const relation = item as RelationTypeDef | null;
    setEdit({ kind, index, name: item && 'canonical' in item ? item.canonical : item && 'name' in item ? item.name : '',
      description: item && 'description' in item ? item.description ?? '' : '', parent: entity?.parent ?? '',
      attributes: (entity?.attributes ?? []).join('\n'), sources: relation?.sourceTypes ?? [], targets: relation?.targetTypes ?? [],
      aliases: item && 'aliases' in item ? item.aliases.join('\n') : '' });
    setEditError('');
  };
  const applyEdit = () => {
    if (!edit) return;
    const name = edit.name.trim();
    if (!name) { setEditError('请填写名称。'); return; }
    const next = structuredClone(draft);
    const index = edit.index;
    if (edit.kind === 'entity') {
      const item: EntityTypeDef = { name, description: edit.description.trim(), parent: edit.parent || null, attributes: splitValues(edit.attributes) };
      if (index === null) next.entityTypes.push(item);
      else {
        const oldName = next.entityTypes[index].name;
        next.entityTypes[index] = item;
        next.entityTypes.forEach(t => { if (t.parent === oldName) t.parent = name; });
        next.relationTypes.forEach(r => { r.sourceTypes = r.sourceTypes?.map(n => n === oldName ? name : n); r.targetTypes = r.targetTypes?.map(n => n === oldName ? name : n); });
      }
    } else if (edit.kind === 'relation') {
      const item: RelationTypeDef = { name, description: edit.description.trim(), sourceTypes: edit.sources, targetTypes: edit.targets };
      if (index === null) next.relationTypes.push(item); else next.relationTypes[index] = item;
    } else {
      const item = { canonical: name, aliases: splitValues(edit.aliases).filter(alias => alias !== name) };
      next.synonymRules ??= [];
      if (index === null) next.synonymRules.push(item); else next.synonymRules[index] = item;
    }
    const issue = validateOntology(next);
    if (issue) { setEditError(issue); return; }
    setDraft(next); setSection(edit.kind); setQuery('');
    if (edit.kind === 'synonym') { setSelected(null); setSynonymIndex(index ?? next.synonymRules!.length - 1); }
    else setSelected({ kind: edit.kind, index: index ?? (edit.kind === 'entity' ? next.entityTypes : next.relationTypes).length - 1 });
    setEdit(null);
  };
  const save = async () => {
    const issue = validateOntology(draft);
    if (issue) { toast.showError(issue); return false; }
    setBusy(true);
    try {
      const result = await api.saveDraft(app.id, draft);
      setSaved(JSON.stringify(draft)); setOverview(o => o ? { ...o, draft: result } : { configured: false, draft: result });
      toast.showSuccess(demo ? '草稿已保存到此浏览器' : '草稿已保存'); return true;
    } catch (e: any) { toast.showError(e.message || '保存失败'); return false; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    const issue = validateOntology(draft);
    if (issue) { toast.showError(issue); return; }
    setBusy(true);
    try {
      if (dirty || !overview?.draft) await api.saveDraft(app.id, draft);
      const version = await api.publish(app.id, changeNote.trim() || undefined);
      setOverview({ configured: true, active: { ...draft, status: 'ACTIVE', version }, draft: null });
      setSaved(JSON.stringify(draft)); setChangeNote(''); setPublishOpen(false);
      toast.showSuccess(demo ? `示例本体已发布为 v${version}，保存在此浏览器` : `本体已发布为 v${version}`);
    } catch (e: any) { toast.showError(e.message || '发布失败'); }
    finally { setBusy(false); }
  };
  const suggest = async () => {
    if (busy) return;
    setBusy(true); setSuggestError('');
    try {
      const result = await api.suggest(app.id);
      const next = draftOf(result);
      setDraft(next); setSaved(JSON.stringify(next));
      setOverview(o => ({ ...o, configured: o?.configured ?? false, draft: result }));
      setSelected(null); setSynonymIndex(null); setSection('entity'); setQuery('');
      setSuggestOpen(false);
      toast.showSuccess(demo ? '示例草稿已生成，可继续编辑' : '本体草稿已生成，请检查后发布');
    } catch (e: any) {
      setSuggestError(e.message || '本体草拟失败，请重试');
    } finally { setBusy(false); }
  };
  const remove = () => {
    const next = structuredClone(draft);
    if (synonymIndex !== null && section === 'synonym') next.synonymRules = next.synonymRules?.filter((_, i) => i !== synonymIndex);
    else if (selected?.kind === 'entity') {
      const name = next.entityTypes[selected.index].name;
      next.entityTypes.splice(selected.index, 1);
      next.entityTypes.forEach(t => { if (t.parent === name) t.parent = null; });
      next.relationTypes.forEach(r => { r.sourceTypes = r.sourceTypes?.filter(n => n !== name); r.targetTypes = r.targetTypes?.filter(n => n !== name); });
    } else if (selected?.kind === 'relation') next.relationTypes.splice(selected.index, 1);
    setDraft(next); setSelected(null); setSynonymIndex(null); setDeleteOpen(false);
  };
  const jumpGraph = (type?: string) => setSearchParams(p => { const next = new URLSearchParams(p); next.set('tab', 'graph'); if (type) next.set('type', type); else next.delete('type'); return next; });
  const select = useCallback((selection: SchemaSelection) => { setSelected(selection); setSynonymIndex(null); if (selection) { setSection(selection.kind); setQuery(''); } }, []);
  const filtered = (section === 'entity' ? draft.entityTypes : section === 'relation' ? draft.relationTypes : draft.synonymRules ?? [])
    .map((item, index) => ({ item, index })).filter(({ item }) => ('name' in item ? item.name : item.canonical).toLowerCase().includes(query.toLowerCase()));
  const currentName = synonym?.canonical ?? entity?.name ?? relation?.name;
  const inherited = useMemo(()=>selected?.kind==='entity'?inheritedAttributes(draft.entityTypes,selected.index):[],[draft.entityTypes,selected]);
  const mockExamples = useMemo(()=>demo?DEMO_GRAPH.edges.map(edge=>({source:DEMO_GRAPH.nodes.find(node=>node.id===edge.source)!.name,relation:edge.relation!,target:DEMO_GRAPH.nodes.find(node=>node.id===edge.target)!.name,sourceType:DEMO_GRAPH.nodes.find(node=>node.id===edge.source)!.type,targetType:DEMO_GRAPH.nodes.find(node=>node.id===edge.target)!.type})):[],[demo]);

  if (!active) return null;

  return <section className="knowledge-studio ontology-studio space-y-4" aria-label="本体工作区">
    <div className={THEME.pageHeader}>
      <p className={THEME.pageDesc}>管理实体类型、关系约束与同义词规则。</p>
      <div className="studio-heading-actions">
        {canEdit && <button className={`${THEME.button.secondary} studio-button`} onClick={() => { setSuggestError(''); setSuggestOpen(true); }} disabled={busy || loading || !!error}><Sparkles size={14} />LLM 草拟</button>}
        <button className={`${THEME.button.secondary} studio-button`} disabled={loading || busy} onClick={async () => { try { setVersions(await api.versions(app.id)); } catch (e: any) { toast.showError(e.message); } }}><History size={14} />版本历史</button>
        {canEdit && <button className={`${THEME.button.secondary} studio-button`} onClick={save} disabled={loading || busy || !!error || !dirty}><Save size={14} />保存草稿</button>}
        {canPublish && <button className={`${THEME.button.primary} studio-button`} onClick={() => setPublishOpen(true)} disabled={loading || busy || !!error || (!dirty && !overview?.draft)}><Send size={14} />发布本体</button>}
      </div>
    </div>
    <div className="studio-stats" aria-label="本体统计">
      <span className="studio-stat"><Shapes size={15} />实体类型 <strong>{loading ? '—' : draft.entityTypes.length}</strong></span>
      <span className="studio-stat"><GitBranch size={15} />关系规则 <strong>{loading ? '—' : draft.relationTypes.length}</strong></span>
      <span className="studio-stat"><Copy size={15} />同义词规则 <strong>{loading ? '—' : draft.synonymRules?.length ?? 0}</strong></span>
      <span className="studio-stat studio-stat-status"><i className={`studio-status-dot ${dirty ? 'is-dirty' : ''}`} />{loading ? '正在加载' : overview?.active ? `当前版本 v${overview.active.version}` : '尚未发布'}{!loading && <> · {dirty ? '有未保存修改' : overview?.draft ? '草稿已保存' : '无未保存修改'}</>}</span>
    </div>
    {error && <div className="studio-error"><Info size={14} />{error}<button className={`${THEME.button.secondary} studio-button is-small`} onClick={load}>重试</button></div>}
    {loading ? <div className="studio-loading"><Spinner size={18} />正在加载本体…</div> : <div className="studio-workspace">
      <div className="studio-workspace-toolbar">
        <div className="studio-segment"><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Network size={14} />关系图</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} />清单视图</button></div>
        <span className="studio-muted">选择类型或关系查看详细定义</span>
      </div>
      <div className="studio-body">
        <aside className={`${THEME.card} studio-library`}><div className="studio-library-title">知识词汇<span className="studio-small-count">{draft.entityTypes.length + draft.relationTypes.length}</span></div>
          <div className="studio-search"><Search size={13} /><input aria-label="搜索类型或关系" placeholder="搜索类型或关系…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="studio-icon-button" aria-label="清空词汇搜索" onClick={() => setQuery('')}><X size={10} /></button>}</div>
          <div className="studio-segment">{([['entity', '类型'], ['relation', '关系'], ['synonym', '同义词']] as const).map(([key, label]) => <button key={key} aria-pressed={section === key} onClick={() => { setSection(key); setQuery(''); setSelected(null); setSynonymIndex(key === 'synonym' && draft.synonymRules?.length ? 0 : null); }}>{label}</button>)}</div>
          <div className="studio-library-scroll">{filtered.map(({ item, index }) => {
            const name = 'name' in item ? item.name : item.canonical;
            const active = section === 'synonym' ? synonymIndex === index : selected?.kind === section && selected.index === index;
            return <button key={`${section}-${index}`} className={`studio-library-item ${active ? 'is-active' : ''}`} onClick={() => section === 'synonym' ? (setSynonymIndex(index), setSelected(null)) : select({ kind: section, index })}>
              <span className="studio-type-icon" style={{ '--node-color': section === 'entity' ? colorOfType(name) : '#648f89' } as React.CSSProperties}>{section === 'entity' ? <TypeIcon type={name} size={14} /> : section === 'relation' ? <GitBranch size={14} /> : <Copy size={14} />}</span>
              <div><strong>{name}</strong><small>{section === 'entity' ? `${(item as EntityTypeDef).attributes?.length ?? 0} 个属性${(item as EntityTypeDef).parent ? ` · ${(item as EntityTypeDef).parent}的子类` : ''}` : section === 'relation' ? `${(item as RelationTypeDef).sourceTypes?.join(' / ') || '任意类型'} → ${(item as RelationTypeDef).targetTypes?.join(' / ') || '任意类型'}` : 'aliases' in item ? item.aliases.join(' / ') : ''}</small></div><ChevronRight size={11} />
            </button>;
          })}{!filtered.length && <div className="studio-empty-list">{query ? '没有匹配的词汇' : '还没有定义，点击下方添加'}</div>}</div>
          <div className="studio-library-footer">{canEdit && <button className={`${THEME.button.secondary} studio-button`} onClick={() => openEdit(section, null)}><Plus size={12} />添加{section === 'entity' ? '类型' : section === 'relation' ? '关系' : '同义词'}</button>}<div className="studio-library-note"><Info size={12} /><span>点击类型查看属性<br />点击关系查看起点与目标</span></div></div>
        </aside>
        <div className={`${THEME.card} studio-main`}>{(section === 'synonym' || view === 'list') && <div className="studio-main-heading"><Info size={14}/><span>{section === 'synonym' ? '将不同名称映射到同一个规范名称' : '类型描述对象，关系规定对象之间的连接方式'}</span></div>}
          {section === 'synonym' ? <div className="studio-table-wrap"><div className="mb-5 flex items-center justify-between"><h3 className="text-xs font-medium">让不同名称指向同一个实体</h3><label className="flex items-center gap-2 text-xs text-neutral-400"><input type="checkbox" aria-label="别名自动归并" checked={draft.autoMergeAliases} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, autoMergeAliases: e.target.checked }))} className="h-3.5 w-3.5 rounded accent-black" />自动归并</label></div>
            {(draft.synonymRules ?? []).map((rule, i) => <div key={i} className="studio-synonym-card"><div><strong>{rule.canonical}</strong><button className="studio-icon-button" aria-label={`查看同义词 ${rule.canonical}`} onClick={() => setSynonymIndex(i)}><ChevronRight size={13} /></button></div><div className="flex flex-wrap gap-1.5">{rule.aliases.map(alias => <span key={alias} className="studio-tag">{alias}</span>)}{!rule.aliases.length && <span className="studio-muted">尚未添加别名</span>}</div></div>)}
          </div> : view === 'graph' ? <SchemaCanvas entityTypes={draft.entityTypes} relationTypes={draft.relationTypes} selected={selected} onSelect={select} examples={mockExamples} /> : <div className="studio-table-wrap"><table className="studio-table"><thead><tr><th>名称</th><th>{section === 'entity' ? '父类型' : '连接规则'}</th><th>{section === 'entity' ? '属性数' : '说明'}</th></tr></thead><tbody>{(section === 'entity' ? draft.entityTypes : draft.relationTypes).map((item, i) => <tr key={i} onClick={() => select({ kind: section, index: i })}><td><button onClick={() => select({ kind: section, index: i })}>{item.name}</button></td><td>{section === 'entity' ? (item as EntityTypeDef).parent || '顶级类型' : `${(item as RelationTypeDef).sourceTypes?.join(' / ') || '任意类型'} → ${(item as RelationTypeDef).targetTypes?.join(' / ') || '任意类型'}`}</td><td>{section === 'entity' ? (item as EntityTypeDef).attributes?.length ?? 0 : item.description || '—'}</td></tr>)}</tbody></table></div>}
        </div>
        <aside className={`${THEME.card} studio-inspector`}><div className="studio-inspector-heading"><span><Info size={14} />{synonym ? '同义词详情' : entity ? '类型详情' : relation ? '关系详情' : '使用指南'}</span>{currentName && <button className="studio-icon-button" aria-label="关闭本体详情" onClick={() => { setSelected(null); setSynonymIndex(null); }}><X size={14} /></button>}</div>
          <div className="studio-inspector-content">{currentName ? <>
            <span className="studio-type-icon studio-detail-icon" style={{ '--node-color': entity ? colorOfType(entity.name) : '#648f89' } as React.CSSProperties}>{entity ? <TypeIcon type={entity.name} size={20} /> : relation ? <GitBranch size={20} /> : <Copy size={20} />}</span>
            <h3 className="studio-detail-name">{currentName}</h3><div className="studio-detail-kind"><span className="studio-tag">{entity ? '实体类型' : relation ? '关系规则' : '规范名称'}</span>{entity?.parent && <span>{entity.parent}的子类</span>}</div>
            <p className="studio-detail-description">{entity?.description || relation?.description || (synonym ? '以下别名会被识别为同一个规范名称。' : '添加说明，帮助团队理解这条定义。')}</p>
            {entity && <><div className="studio-detail-section"><h4>自有属性<span className="studio-small-count">{entity.attributes?.length ?? 0}</span></h4>{(entity.attributes ?? []).map(attr => <div className="studio-property" key={attr}><span>{attr.split(/[:：]/)[0]}</span><code className="studio-property-type">{attr.split(/[:：]/)[1]?.trim() || 'string'}</code></div>)}{!entity.attributes?.length && <p className="studio-muted text-xs">此类型还没有专属属性</p>}</div>
              {inherited.length>0&&<div className="studio-detail-section"><h4>继承属性<span className="studio-small-count">{inherited.length}</span></h4>{inherited.map(({attribute,owner})=><div className="studio-property ontology-inherited-property" key={attribute}><span>{attribute.split(/[:：]/)[0]}<small>继承自「{owner}」</small></span><code className="studio-property-type">{attribute.split(/[:：]/)[1]?.trim()||'string'}</code></div>)}</div>}
              <div className="studio-detail-section"><h4>相关关系</h4>{draft.relationTypes.map((r, i) => ({ r, i })).filter(({ r }) => !r.sourceTypes?.length || !r.targetTypes?.length || [...r.sourceTypes, ...r.targetTypes].includes(entity.name)).map(({ r, i }) => <button key={i} className="studio-related-item" onClick={() => select({ kind: 'relation', index: i })}><GitBranch size={12} /><div><strong>{r.name}</strong><small>{r.sourceTypes?.join(' / ') || '任意类型'} → {r.targetTypes?.join(' / ') || '任意类型'}</small></div><ChevronRight size={11} /></button>)}</div>
              <div className="studio-callout"><strong>一个类型，多个实例</strong>「{entity.name}」定义共性；知识图谱中的具体对象是它的实例。</div></>}
            {relation && <><div className="studio-detail-section"><h4>从哪些类型出发</h4><div className="flex flex-wrap gap-1">{(relation.sourceTypes?.length ? relation.sourceTypes : ['任意类型']).map(n => <span className="studio-tag" key={n}>{n}</span>)}</div></div><div className="studio-detail-section"><h4>指向哪些类型</h4><div className="flex flex-wrap gap-1">{(relation.targetTypes?.length ? relation.targetTypes : ['任意类型']).map(n => <span className="studio-tag" key={n}>{n}</span>)}</div></div><div className="studio-callout"><strong>按箭头方向阅读</strong>{relation.sourceTypes?.join(' / ') || '任意类型'}<span className="mx-1">→ {relation.name} →</span>{relation.targetTypes?.join(' / ') || '任意类型'}</div></>}
            {synonym && <div className="studio-detail-section"><h4>别名<span className="studio-small-count">{synonym.aliases.length}</span></h4><div className="flex flex-wrap gap-1.5">{synonym.aliases.map(alias => <span className="studio-tag" key={alias}>{alias}</span>)}</div></div>}
          </> : <><span className="studio-type-icon studio-detail-icon"><Network size={20} /></span><h3 className="studio-detail-name">查看模型定义</h3><p className="studio-detail-description mt-3">选择画布中的类型或关系，在这里查看和编辑详细定义。</p><div className="studio-help-steps">{[['类型与属性', '点击类型卡片，查看自有属性和从父类型继承的属性。'], ['关系与方向', '沿实线箭头阅读关系，点击名称查看允许的起点与目标。'], ['父子类型', '虚线从子类型指向父类型，表示属性继承。']].map(([title, text], i) => <div className="studio-help-step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}</div></>}
          </div>
          <div className="studio-detail-actions">{currentName && canEdit ? <><button className={`${THEME.button.secondary} studio-button`} onClick={() => openEdit(synonym ? 'synonym' : selected!.kind, synonym ? synonymIndex : selected!.index)}><Pencil size={12} />编辑定义</button><button className="studio-icon-button" aria-label={`删除定义 ${currentName}`} onClick={() => setDeleteOpen(true)}><Trash2 size={13} /></button></> : <button className={`${THEME.button.secondary} studio-button`} onClick={() => setHelp(true)}><CircleHelp size={12} />快速入门</button>}{entity && <button className="studio-icon-button" title="查看该类型的实体" aria-label="查看该类型的实体" onClick={() => jumpGraph(entity.name)}><Network size={14} /></button>}</div>
        </aside>
      </div><div className="studio-footer"><span><i className={`studio-status-dot ${dirty ? 'is-dirty' : ''}`} />{demo ? '示例模式 · 保存与发布仅作用于此浏览器' : canEdit ? '编辑草稿不会影响已发布的本体' : '当前为只读模式'}</span><button className="studio-help-link" onClick={() => setHelp(true)}><CircleHelp size={11} />如何使用本体</button></div>
    </div>}
    <div className="studio-guide-strip"><a href="#" onClick={e => { e.preventDefault(); jumpGraph(); }}>探索知识图谱<ArrowRight size={14} /></a></div>

    <Modal open={!!edit} title={`${edit?.index === null ? '添加' : '编辑'}${edit?.kind === 'entity' ? '实体类型' : edit?.kind === 'relation' ? '关系规则' : '同义词规则'}`} onClose={() => setEdit(null)} footer={<><button className={`${THEME.button.secondary} studio-button`} onClick={() => setEdit(null)}>取消</button><button className={`${THEME.button.primary} studio-button`} onClick={applyEdit}>应用到草稿</button></>}>
      {edit && <div className="knowledge-studio studio-form"><label><span>{edit.kind === 'synonym' ? '规范名称' : '名称'} *</span><input aria-label="定义名称" autoFocus value={edit.name} maxLength={80} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder={edit.kind === 'entity' ? '例如：项目' : edit.kind === 'relation' ? '例如：负责' : '例如：知识图谱'} /></label>
        {edit.kind !== 'synonym' && <label><span>说明</span><textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} placeholder="用一句话说明这个定义的含义" maxLength={1000} /></label>}
        {edit.kind === 'entity' && <><label><span>父类型（可选）</span><select aria-label="父类型" value={edit.parent} onChange={e => setEdit({ ...edit, parent: e.target.value })}><option value="">无 · 顶级类型</option>{names.filter(n => n !== draft.entityTypes[edit.index ?? -1]?.name).map(n => <option key={n}>{n}</option>)}</select><small>子类型继承父类型的属性定义，例如“数据库”是“技术”的子类型。</small></label><label><span>属性 · 每行一个</span><textarea aria-label="属性定义" value={edit.attributes} onChange={e => setEdit({ ...edit, attributes: e.target.value })} placeholder={'项目状态: string\n启动日期: date'} /><small>格式为“属性名称: 数据类型”，也可以只填名称。</small></label></>}
        {edit.kind === 'relation' && <><fieldset className="studio-type-choice-field"><legend>从哪些类型出发（可多选）</legend><TypeChoices names={names} values={edit.sources} onChange={v => setEdit({ ...edit, sources: v })} /></fieldset><fieldset className="studio-type-choice-field"><legend>指向哪些类型（可多选）</legend><TypeChoices names={names} values={edit.targets} onChange={v => setEdit({ ...edit, targets: v })} /><small>不选择表示不限制类型，画布中会连接到“任意类型”。</small></fieldset></>}
        {edit.kind === 'synonym' && <label><span>别名 · 每行一个</span><textarea aria-label="同义词别名" value={edit.aliases} onChange={e => setEdit({ ...edit, aliases: e.target.value })} placeholder={'Knowledge Graph\nKG'} /></label>}{editError && <div role="alert" className="studio-error">{editError}</div>}
      </div>}
    </Modal>
    <Modal open={publishOpen} title={demo ? '发布示例本体' : '发布本体'} onClose={() => { if (!busy) setPublishOpen(false); }} footer={<><button className={`${THEME.button.secondary} studio-button`} disabled={busy} onClick={() => setPublishOpen(false)}>取消</button><button className={`${THEME.button.primary} studio-button`} disabled={busy} onClick={publish}>{busy ? '发布中…' : `发布为 v${(overview?.active?.version ?? 0) + 1}`}</button></>}><div className="knowledge-studio studio-form"><p className="studio-detail-description">{demo ? '此操作仅在当前浏览器中保存新版本，演示图谱数据保持固定。' : '发布后，新摄入的文档将使用新版本的类型与关系规则。'}</p><label><span>变更说明（可选）</span><input aria-label="变更说明" value={changeNote} onChange={e => setChangeNote(e.target.value)} placeholder="简要记录这次更新的内容" maxLength={1024} /></label></div></Modal>
    <Modal open={versions !== null} title="本体版本历史" onClose={() => setVersions(null)}><div className="knowledge-studio">{versions?.map(v => <div className="studio-versions-item" key={v.version}><span>v{v.version}</span><div><p>{v.changeNote || '更新本体定义'}</p><small>{formatDateTime(v.createTime)}</small></div></div>)}{!versions?.length && <div className="studio-empty-list">暂无历史版本</div>}</div></Modal>
    <Modal open={deleteOpen} title={`删除「${currentName}」`} onClose={() => setDeleteOpen(false)} footer={<><button className={`${THEME.button.secondary} studio-button`} onClick={() => setDeleteOpen(false)}>取消</button><button className={`${THEME.button.danger} studio-button`} onClick={remove}>从草稿删除</button></>}><p className="studio-detail-description">{entity ? '此类型将从草稿移除。子类型将改为顶级类型，相关关系规则中的类型引用将被清除。' : '这条定义将从草稿移除。'}保存并发布前，已发布版本不受影响。</p></Modal>
    <Modal open={suggestOpen} title="LLM 草拟本体" onClose={() => { if (!busy) setSuggestOpen(false); }} footer={<><button className={`${THEME.button.secondary} studio-button`} disabled={busy} onClick={() => setSuggestOpen(false)}>取消</button><button className={`${THEME.button.primary} studio-button`} disabled={busy} onClick={suggest}>{busy ? <><Spinner size={14} />草拟中…</> : <><Sparkles size={14} />开始草拟</>}</button></>}>
      <div className="knowledge-studio space-y-4" aria-busy={busy}>
        <p className="studio-detail-description">根据知识库中的文档，使用大语言模型草拟实体类型、属性和关系规则。生成后可继续编辑，检查完成后再发布。</p>
        {demo && <p className="studio-callout">当前为演示模式，使用示例数据模拟草拟结果。</p>}
        <p className="studio-detail-description">{dirty ? '当前草稿包含未保存修改，草拟后将被替换。' : '草拟结果将替换当前草稿。'}已发布的本体不受影响。</p>
        {suggestError && <div className="studio-error" role="alert">{suggestError}</div>}
      </div>
    </Modal>
    <Modal open={help} title="三步读懂本体" onClose={() => setHelp(false)}><div className="knowledge-studio studio-help-steps">{[['类型描述“是什么”', '项目、人员和技术都是类型；“Atlas 知识平台”“林悦”是具体实例。'], ['关系描述“如何连接”', '“林悦 → 负责 → Atlas 知识平台”，对应“人员 → 负责 → 项目”的规则。'], ['草稿用于编辑，发布用于生效', '先添加定义并保存草稿，检查结构后再发布。同义词用于统一不同名称。']].map(([title, text], i) => <div className="studio-help-step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}</div></Modal>
  </section>;
}





