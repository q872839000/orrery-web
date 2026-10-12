import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Braces, History, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { ontologyService } from '../../../../shared/services/knowledge';
import type {
  EntityTypeDef, KnowledgeApp, Ontology, OntologyOverview, OntologyVersion, RelationTypeDef, SynonymRule,
} from '../../../../shared/types/knowledge';
import { roleAtLeast } from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import { useConfirm } from '../../../../shared/hooks/useConfirm';
import Badge from '../../../../shared/components/ui/Badge';
import EmptyState from '../../../../shared/components/ui/EmptyState';
import Spinner from '../../../../shared/components/ui/Spinner';
import Modal from '../../../../shared/components/ui/Modal';
import Select from '../../../../shared/components/ui/Select';
import { formatDateTime } from '../../../../shared/utils/date';

/** 编辑器草稿（允许字段为空，发布前由服务端校验） */
type Draft = { entityTypes: EntityTypeDef[]; relationTypes: RelationTypeDef[]; synonymRules: SynonymRule[]; autoMergeAliases: boolean };

const EMPTY_DRAFT: Draft = { entityTypes: [], relationTypes: [], synonymRules: [], autoMergeAliases: false };

const draftOf = (ontology?: Ontology | null): Draft => ontology
  ? {
      entityTypes: ontology.entityTypes ?? [],
      relationTypes: ontology.relationTypes ?? [],
      synonymRules: ontology.synonymRules ?? [],
      autoMergeAliases: ontology.autoMergeAliases ?? false,
    }
  : { ...EMPTY_DRAFT };

/** 标签文本输入（别名、属性清单；回车/逗号/顿号确认，失焦提交） */
const ChipsInput: React.FC<{ values: string[]; onChange: (values: string[]) => void; placeholder?: string }> = ({ values, onChange, placeholder }) => {
  const [text, setText] = useState('');
  const commit = () => {
    const parts = text.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) onChange([...values, ...parts.filter(p => !values.includes(p))]);
    setText('');
  };
  return (
    <div className="flex w-full flex-wrap items-center gap-1 rounded-xl border border-neutral-200/70 bg-white/88 px-2 py-1.5 shadow-sm transition-all focus-within:border-neutral-300 focus-within:ring-2 focus-within:ring-black/8">
      {values.map(v => (
        <span key={v} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
          {v}
          <button type="button" className="text-neutral-400 transition-colors hover:text-red-500" onClick={() => onChange(values.filter(x => x !== v))}>×</button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[12px] outline-none"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        onBlur={commit}
      />
    </div>
  );
};

/** 从既有实体类型中点选（关系类型的源/目标约束） */
const TypeToggleChips: React.FC<{ values: string[]; candidates: string[]; onChange: (values: string[]) => void }> = ({ values, candidates, onChange }) => {
  const all = useMemo(() => [...new Set([...candidates, ...values])].filter(Boolean), [candidates, values]);
  if (all.length === 0) {
    return <div className="py-1 text-[11px] font-medium text-neutral-400">先在上方定义实体类型</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {all.map(name => {
        const on = values.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(on ? values.filter(v => v !== name) : [...values, name])}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
              on ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white/80 text-neutral-500 hover:border-neutral-400'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
};

/** 分区标题 */
const SectionTitle: React.FC<{ title: string; count: number; desc: string }> = ({ title, count, desc }) => (
  <div className="flex items-baseline gap-2">
    <h3 className="text-sm font-black text-neutral-800">{title}</h3>
    <Badge tone="neutral">{count}</Badge>
    <span className="text-[11px] font-medium text-neutral-400">{desc}</span>
  </div>
);

interface OntologyTabProps {
  app: KnowledgeApp;
}

/** 本体管理 tab：概览 + 卡片式结构化编辑 + 发布/版本/LLM 草拟 */
const OntologyTab: React.FC<OntologyTabProps> = ({ app }) => {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const canEdit = roleAtLeast(app.myRole, 'EDITOR');
  const canManage = roleAtLeast(app.myRole, 'OWNER');

  const [overview, setOverview] = useState<OntologyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<OntologyVersion[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await ontologyService.overview(app.id);
      setOverview(ov);
      // 草稿优先，其次线上版本作为编辑起点
      setDraft(draftOf(ov.draft ?? ov.active));
      setDirty(false);
    } catch (e: any) {
      toast.showError(e.message || '加载本体失败');
    } finally {
      setLoading(false);
    }
  }, [app.id]);

  useEffect(() => { load(); }, [load]);

  const entityTypeNames = useMemo(() => draft.entityTypes.map(t => t.name).filter(Boolean), [draft.entityTypes]);

  const patch = (partial: Partial<Draft>) => {
    setDraft(d => ({ ...d, ...partial }));
    setDirty(true);
  };

  const patchEntity = (i: number, partial: Partial<EntityTypeDef>) =>
    patch({ entityTypes: draft.entityTypes.map((x, j) => j === i ? { ...x, ...partial } : x) });

  const patchRelation = (i: number, partial: Partial<RelationTypeDef>) =>
    patch({ relationTypes: draft.relationTypes.map((x, j) => j === i ? { ...x, ...partial } : x) });

  const patchSynonym = (i: number, partial: Partial<SynonymRule>) =>
    patch({ synonymRules: draft.synonymRules.map((x, j) => j === i ? { ...x, ...partial } : x) });

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await ontologyService.saveDraft(app.id, draft);
      toast.showSuccess('草稿已保存');
      setDirty(false);
      load();
      return true;
    } catch (e: any) {
      toast.showError(e.message || '保存草稿失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    setPublishOpen(false);
    // 有未保存修改先落草稿
    if (dirty && !(await save())) return;
    try {
      const version = await ontologyService.publish(app.id, changeNote || undefined);
      toast.showSuccess(`已发布为 v${version}`);
      setChangeNote('');
      load();
    } catch (e: any) {
      toast.showError(e.message || '发布失败');
    }
  };

  const doSuggest = async () => {
    const ok = await confirm({
      title: 'LLM 草拟本体',
      message: '将抽样库内文档，由模型建议一套类型体系并写入草稿（不直接影响线上）。继续？',
      type: 'info',
      confirmText: '开始草拟',
    });
    if (!ok) return;
    setSuggesting(true);
    try {
      await ontologyService.suggest(app.id);
      toast.showSuccess('草拟完成，已写入草稿');
      load();
    } catch (e: any) {
      toast.showError(e.message || '草拟失败');
    } finally {
      setSuggesting(false);
    }
  };

  const openVersions = async () => {
    try {
      setVersions(await ontologyService.versions(app.id));
      setVersionsOpen(true);
    } catch (e: any) {
      toast.showError(e.message || '加载版本历史失败');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size={24} /></div>;
  }

  const empty = !overview?.configured && !dirty && draft.entityTypes.length === 0;

  return (
    <div className="space-y-4 pb-20">
      {/* 状态概览 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>线上版本</div>
          <div className="mt-1.5 flex items-center gap-2">
            {overview?.active
              ? <><span className="text-lg font-black text-neutral-900">v{overview.active.version}</span><Badge tone="success">已发布</Badge></>
              : <span className="text-[13px] font-bold text-neutral-400">未发布</span>}
          </div>
        </div>
        <div className={`${THEME.card} p-4`}>
          <div className={THEME.label}>草稿</div>
          <div className="mt-1.5 flex items-center gap-2">
            {overview?.draft || dirty
              ? <Badge tone={dirty ? 'warning' : 'info'}>{dirty ? '有未保存修改' : '草稿已保存'}</Badge>
              : <span className="text-[13px] font-bold text-neutral-400">无草稿</span>}
          </div>
        </div>
        <div className={`${THEME.card} flex items-center justify-end gap-2 p-4`}>
          <button className={THEME.button.secondary} onClick={openVersions} disabled={!overview?.configured}>
            <History size={13} /> 版本历史
          </button>
          {canEdit && (
            <button className={THEME.button.secondary} onClick={doSuggest} disabled={suggesting}>
              {suggesting ? <Spinner size={13} /> : <Sparkles size={13} />} LLM 草拟
            </button>
          )}
        </div>
      </div>

      {!overview?.configured && (
        <div className={`${THEME.card} border-amber-200 bg-amber-50/60 p-4 text-[13px] font-medium text-amber-700`}>
          {overview?.guidance || '本体是图谱的"图纸"：定义实体/关系类型词表，约束 LLM 抽取。未配置时图谱仍可开启（自由抽取，类型噪声自担）。'}
        </div>
      )}

      {empty ? (
        <EmptyState
          icon={<Braces size={24} />}
          title="从第一份类型定义开始"
          desc="先定义实体类型（如 装备/地点/机构），再定义它们之间的关系类型，发布后新摄入的文档即按词表受控抽取。"
          action={canEdit && (
            <button className={THEME.button.primary} onClick={() => patch({ entityTypes: [{ name: '', parent: null, description: '', attributes: [] }] })}>
              <Plus size={14} strokeWidth={3} /> 添加第一个实体类型
            </button>
          )}
        />
      ) : (
        <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-70">
          {/* 实体类型 */}
          <div className={`${THEME.card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle title="实体类型" count={draft.entityTypes.length} desc="可层级（父类型指向词表内另一类型）" />
              {canEdit && (
                <button className={THEME.button.secondary} onClick={() => patch({ entityTypes: [...draft.entityTypes, { name: '', parent: null, description: '', attributes: [] }] })}>
                  <Plus size={13} /> 添加类型
                </button>
              )}
            </div>
            <div className="space-y-2">
              {draft.entityTypes.map((t, i) => (
                <div key={i} className="rounded-2xl border border-neutral-100 bg-white/60 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      className={`${THEME.input} w-44 min-w-0 font-bold`}
                      placeholder="类型名，如 装备"
                      value={t.name}
                      onChange={e => patchEntity(i, { name: e.target.value })}
                    />
                    <Select
                      className="w-40"
                      compact
                      value={t.parent ?? ''}
                      onChange={v => patchEntity(i, { parent: v || null })}
                      placeholder="（顶级）"
                      options={entityTypeNames.filter(n => n && n !== t.name).map(n => ({ value: n, label: n }))}
                    />
                    {canEdit && (
                      <button className={`${THEME.buttonIcon} ml-auto hover:!bg-red-50 hover:!text-red-600`} title="删除类型" onClick={() => patch({ entityTypes: draft.entityTypes.filter((_, j) => j !== i) })}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <input
                    className={`${THEME.input} mt-2 w-full`}
                    placeholder="类型描述（会注入抽取提示词）"
                    value={t.description ?? ''}
                    onChange={e => patchEntity(i, { description: e.target.value })}
                  />
                  <div className="mt-2">
                    <ChipsInput
                      values={t.attributes ?? []}
                      onChange={attrs => patchEntity(i, { attributes: attrs })}
                      placeholder="属性定义，回车确认，如 工作频段: string"
                    />
                  </div>
                </div>
              ))}
              {draft.entityTypes.length === 0 && <div className="py-4 text-center text-xs text-neutral-400">暂无实体类型</div>}
            </div>
          </div>

          {/* 关系类型 */}
          <div className={`${THEME.card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle title="关系类型" count={draft.relationTypes.length} desc="源/目标类型须为词表内实体类型（点选）" />
              {canEdit && (
                <button
                  className={THEME.button.secondary}
                  onClick={() => patch({ relationTypes: [...draft.relationTypes, { name: '', sourceTypes: [], targetTypes: [], description: '' }] })}
                >
                  <Plus size={13} /> 添加关系
                </button>
              )}
            </div>
            <div className="space-y-2">
              {draft.relationTypes.map((r, i) => (
                <div key={i} className="rounded-2xl border border-neutral-100 bg-white/60 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      className={`${THEME.input} w-44 min-w-0 font-bold`}
                      placeholder="关系名，如 部署于"
                      value={r.name}
                      onChange={e => patchRelation(i, { name: e.target.value })}
                    />
                    <input
                      className={`${THEME.input} flex-1`}
                      placeholder="关系描述"
                      value={r.description ?? ''}
                      onChange={e => patchRelation(i, { description: e.target.value })}
                    />
                    {canEdit && (
                      <button className={`${THEME.buttonIcon} hover:!bg-red-50 hover:!text-red-600`} title="删除关系" onClick={() => patch({ relationTypes: draft.relationTypes.filter((_, j) => j !== i) })}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-xl bg-neutral-50/80 px-3 py-2">
                      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-400">源类型</div>
                      <TypeToggleChips values={r.sourceTypes ?? []} candidates={entityTypeNames} onChange={v => patchRelation(i, { sourceTypes: v })} />
                    </div>
                    <div className="rounded-xl bg-neutral-50/80 px-3 py-2">
                      <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-400">目标类型</div>
                      <TypeToggleChips values={r.targetTypes ?? []} candidates={entityTypeNames} onChange={v => patchRelation(i, { targetTypes: v })} />
                    </div>
                  </div>
                </div>
              ))}
              {draft.relationTypes.length === 0 && <div className="py-4 text-center text-xs text-neutral-400">暂无关系类型</div>}
            </div>
          </div>

          {/* 同义词规则 + 归并开关 */}
          <div className={`${THEME.card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle title="同义词规则" count={draft.synonymRules.length} desc="辅助实体归一与 Wiki 互链解析" />
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-neutral-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300 accent-black"
                    checked={draft.autoMergeAliases}
                    onChange={e => patch({ autoMergeAliases: e.target.checked })}
                  />
                  别名自动归并
                </label>
                {canEdit && (
                  <button className={THEME.button.secondary} onClick={() => patch({ synonymRules: [...draft.synonymRules, { canonical: '', aliases: [] }] })}>
                    <Plus size={13} /> 添加规则
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {draft.synonymRules.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-white/60 p-3">
                  <input
                    className={`${THEME.input} w-44 min-w-0 font-bold`}
                    placeholder="规范名"
                    value={s.canonical}
                    onChange={e => patchSynonym(i, { canonical: e.target.value })}
                  />
                  <div className="min-w-0 flex-1">
                    <ChipsInput values={s.aliases} onChange={v => patchSynonym(i, { aliases: v })} placeholder="别名，回车确认" />
                  </div>
                  {canEdit && (
                    <button className={`${THEME.buttonIcon} hover:!bg-red-50 hover:!text-red-600`} title="删除规则" onClick={() => patch({ synonymRules: draft.synonymRules.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {draft.synonymRules.length === 0 && <div className="py-4 text-center text-xs text-neutral-400">暂无同义词规则</div>}
            </div>
          </div>
        </fieldset>
      )}

      {/* 粘性操作条：有修改或存在草稿时出现 */}
      {canEdit && (dirty || overview?.draft) && (
        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-2xl border border-white/50 bg-white/85 px-4 py-3 shadow-2xl backdrop-blur-xl">
          {dirty && <span className="mr-auto text-[12px] font-bold text-amber-600">● 有未保存修改</span>}
          <button className={THEME.button.secondary} onClick={save} disabled={saving || !dirty}>
            {saving ? '保存中…' : '保存草稿'}
          </button>
          {canManage && (
            <button className={THEME.button.primary} onClick={() => setPublishOpen(true)}>
              <Send size={13} /> 发布本体
            </button>
          )}
        </div>
      )}

      <Modal
        open={publishOpen}
        title="发布本体"
        onClose={() => setPublishOpen(false)}
        footer={
          <>
            <button className={THEME.button.secondary} onClick={() => setPublishOpen(false)}>取消</button>
            <button className={THEME.button.primary} onClick={doPublish}>发布</button>
          </>
        }
      >
        <p className="mb-3 text-[13px] font-medium text-neutral-500">
          发布后版本号 +1 并记入历史；新摄入的文档将使用新版本词表。类型改名/合并会使存量实体进入待重抽队列。
        </p>
        <input className={`${THEME.input} w-full`} placeholder="变更说明（可选）" value={changeNote} onChange={e => setChangeNote(e.target.value)} maxLength={1024} />
      </Modal>

      <Modal open={versionsOpen} title="本体版本历史" onClose={() => setVersionsOpen(false)}>
        {versions.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">暂无历史版本</div>
        ) : (
          <div className="space-y-2">
            {versions.map(v => (
              <div key={v.version} className="rounded-xl border border-neutral-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black">v{v.version}</span>
                  <span className="text-[11px] text-neutral-400">{formatDateTime(v.createTime)}</span>
                </div>
                {v.changeNote && <div className="mt-1 text-[12px] font-medium text-neutral-500">{v.changeNote}</div>}
                {(v.affectedTypes?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.affectedTypes!.map(t => <Badge key={t} tone="warning">{t}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {ConfirmDialog}
    </div>
  );
};

export default OntologyTab;
