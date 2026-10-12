import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, Trash2, UserPlus } from 'lucide-react';
import { knowledgeAppService, ontologyService } from '../../../../shared/services/knowledge';
import { aiCatalogService, type AiProviderItem } from '../../../../shared/services/ai.service';
import type { ChannelWeights, KnowledgeApp, KnowledgeMember } from '../../../../shared/types/knowledge';
import {
  CHANNEL_META, CHANNEL_ORDER, KB_MODES, KB_MODE_LABELS, ROLE_LABELS, roleAtLeast,
  type KnowledgeMode,
} from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { avatarLetter, avatarTone } from '../../../../shared/utils/avatar';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import { useConfirm } from '../../../../shared/hooks/useConfirm';
import Badge from '../../../../shared/components/ui/Badge';
import Select from '../../../../shared/components/ui/Select';
import Spinner from '../../../../shared/components/ui/Spinner';
import MemberManageModal from '../components/MemberManageModal';

interface SettingsTabProps {
  app: KnowledgeApp;
  /** 设置变更后回传最新详情（页头数据同步） */
  onChanged: () => void;
}

/** 设置 tab：基本信息 / 召回策略 / 图谱开关 / 成员管理 / 危险操作（OWNER 限定） */
const SettingsTab: React.FC<SettingsTabProps> = ({ app, onChanged }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const canManage = roleAtLeast(app.myRole, 'OWNER');

  // 基本信息
  const [name, setName] = useState(app.name);
  const [remark, setRemark] = useState(app.remark ?? '');
  const [mode, setMode] = useState<KnowledgeMode>(app.mode);

  // 召回策略
  const [weights, setWeights] = useState<ChannelWeights>({
    wiki: app.channelWeights?.wiki ?? CHANNEL_META.wiki.defaultWeight,
    dense: app.channelWeights?.dense ?? CHANNEL_META.dense.defaultWeight,
    sparse: app.channelWeights?.sparse ?? CHANNEL_META.sparse.defaultWeight,
    graph: app.channelWeights?.graph ?? CHANNEL_META.graph.defaultWeight,
  });
  const [rerankEnabled, setRerankEnabled] = useState(app.rerankEnabled ?? true);

  // 模型配置（知识库服务模型目录）
  const [modelProviders, setModelProviders] = useState<AiProviderItem[]>([]);
  const [chatProvider, setChatProvider] = useState(app.chatProvider ?? '');
  const [chatModel, setChatModel] = useState(app.chatModel ?? '');
  const [embeddingProvider, setEmbeddingProvider] = useState(app.embeddingProvider ?? '');
  const [embeddingModel, setEmbeddingModel] = useState(app.embeddingModel ?? '');
  const embeddingLocked = app.embeddingLocked ?? false;

  useEffect(() => {
    aiCatalogService.catalog('cy-knowledge-repository')
      .then(vo => setModelProviders(vo.providers ?? []))
      .catch(() => setModelProviders([]));
  }, []);

  // 成员（展示态；增删改在 MemberManageModal 中批量完成）
  const [members, setMembers] = useState<KnowledgeMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      setMembers(await knowledgeAppService.listMembers(app.id));
    } catch (e: any) {
      toast.showError(e.message || '加载成员失败');
    } finally {
      setMembersLoading(false);
    }
  }, [app.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const saveBasic = async () => {
    try {
      await knowledgeAppService.update(app.id, { name: name.trim(), remark, mode });
      toast.showSuccess('基本信息已保存');
      onChanged();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    }
  };

  const saveRetrieval = async () => {
    try {
      await knowledgeAppService.updateRetrieval(app.id, { channelWeights: weights, rerankEnabled });
      toast.showSuccess('召回策略已生效');
      onChanged();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    }
  };

  const saveModelConfig = async () => {
    try {
      await knowledgeAppService.updateModelConfig(app.id, {
        chatProvider: chatProvider || null,
        chatModel: chatModel.trim() || null,
        embeddingProvider: embeddingProvider || null,
        embeddingModel: embeddingModel.trim() || null,
      });
      toast.showSuccess('模型配置已生效');
      onChanged();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    }
  };

  const toggleGraph = async () => {
    const target = !app.graphEnabled;
    if (target) {
      // 开启前检查本体：无本体 = 自由抽取，提示质量风险
      let hasOntology = false;
      try {
        hasOntology = (await ontologyService.overview(app.id)).configured;
      } catch { /* 检查失败不阻断，提示里说明 */ }
      const ok = await confirm({
        title: '开启图谱',
        message: hasOntology
          ? '开启后新摄入的文档将按本体词表约束抽取实体与关系。确认开启？'
          : '该知识库尚未配置本体，将按通用词表自由抽取（类型噪声自担，建议先在「本体」页发布词表）。确认开启？',
        type: hasOntology ? 'info' : 'warning',
        confirmText: '开启图谱',
      });
      if (!ok) return;
    }
    try {
      await knowledgeAppService.toggleGraph(app.id, target);
      toast.showSuccess(target ? '图谱已开启' : '图谱已关闭');
      onChanged();
    } catch (e: any) {
      toast.showError(e.message || '操作失败');
    }
  };

  const toggleDisabled = async () => {
    const ok = await confirm({
      title: app.disabled ? '启用知识库' : '停用知识库',
      message: app.disabled ? '启用后恢复检索与上传。确认启用？' : '停用后不可检索、不可上传。确认停用？',
      type: 'warning',
      confirmText: app.disabled ? '启用' : '停用',
    });
    if (!ok) return;
    try {
      await knowledgeAppService.toggle(app.id);
      toast.showSuccess(app.disabled ? '已启用' : '已停用');
      onChanged();
    } catch (e: any) {
      toast.showError(e.message || '操作失败');
    }
  };

  const removeApp = async () => {
    const ok = await confirm({
      title: '删除知识库',
      message: `删除「${app.name}」将级联删除全部文档、本体、Wiki 与成员配置，且不可恢复。确认删除？`,
      type: 'error',
      confirmText: '确认删除',
    });
    if (!ok) return;
    try {
      await knowledgeAppService.remove(app.id);
      toast.showSuccess('已删除');
      navigate('/knowledge');
    } catch (e: any) {
      toast.showError(e.message || '删除失败');
    }
  };

  if (!canManage) {
    // 非 OWNER 只展示只读概要
    return (
      <div className={`${THEME.card} p-5`}>
        <div className={THEME.label}>可见性</div>
        <div className="mt-1 text-sm font-bold text-neutral-800">{KB_MODE_LABELS[app.mode]}</div>
        <div className="mt-4 text-xs font-medium text-neutral-400">只有所有者可以修改知识库设置。</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className={`${THEME.card} p-5`}>
        <h3 className="mb-3 text-sm font-black text-neutral-800">基本信息</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={THEME.label}>名称</label>
            <input className={`${THEME.input} mt-1.5 w-full`} value={name} onChange={e => setName(e.target.value)} maxLength={128} />
          </div>
          <div>
            <label className={THEME.label}>可见性</label>
            <Select
              className="mt-1.5"
              value={mode}
              onChange={v => setMode(v as KnowledgeMode)}
              options={KB_MODES.map(m => ({ value: m.value as string, label: `${m.label} — ${m.desc}` }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={THEME.label}>描述</label>
            <textarea className={`${THEME.input} mt-1.5 min-h-[64px] w-full`} value={remark} onChange={e => setRemark(e.target.value)} maxLength={512} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button className={THEME.button.primary} onClick={saveBasic}>保存基本信息</button>
        </div>
      </div>

      {/* 召回策略 */}
      <div className={`${THEME.card} p-5`}>
        <h3 className="mb-1 text-sm font-black text-neutral-800">召回策略</h3>
        <p className="mb-3 text-xs font-medium text-neutral-400">四路召回通道在 RRF 融合中的权重，以及是否启用 rerank 精排。</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CHANNEL_ORDER.map(ch => (
            <div key={ch} className="rounded-2xl border border-neutral-100 p-3">
              <div className="flex items-center gap-1.5">
                <Badge tone={CHANNEL_META[ch].tone}>{CHANNEL_META[ch].label}</Badge>
                <span className="text-[10px] text-neutral-300">缺省 {CHANNEL_META[ch].defaultWeight}</span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0"
                className={`${THEME.input} mt-2 w-full`}
                value={weights[ch] ?? ''}
                onChange={e => setWeights(w => ({ ...w, [ch]: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
              <div className="mt-1 text-[10px] font-medium text-neutral-400">{CHANNEL_META[ch].desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] font-bold text-neutral-600">
            <input type="checkbox" className="h-4 w-4 rounded border-neutral-300 accent-black" checked={rerankEnabled} onChange={e => setRerankEnabled(e.target.checked)} />
            启用 rerank 精排（多一次模型调用，结果更准）
          </label>
          <button className={THEME.button.primary} onClick={saveRetrieval}>保存召回策略</button>
        </div>
      </div>

      {/* 模型配置 */}
      <div className={`${THEME.card} p-5`}>
        <h3 className="mb-1 text-sm font-black text-neutral-800">模型配置</h3>
        <p className="mb-3 text-xs font-medium text-neutral-400">
          库级模型选择（null = 跟随平台默认/角色路由）。对话问答即时生效；向量化维度与库内已有向量绑定。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={THEME.label}>对话生成提供商</label>
            <Select
              className="mt-1.5"
              value={chatProvider}
              onChange={setChatProvider}
              options={[
                { value: '', label: '跟随平台默认' },
                ...modelProviders.map(p => ({ value: p.name, label: `${p.name}${p.chatModel ? ` · ${p.chatModel}` : ''}` })),
              ]}
            />
          </div>
          <div>
            <label className={THEME.label}>对话模型覆盖（可选）</label>
            <input
              className={`${THEME.input} mt-1.5 w-full`}
              value={chatModel}
              placeholder="留空 = 提供商默认模型"
              onChange={e => setChatModel(e.target.value)}
            />
          </div>
          <div>
            <label className={THEME.label}>向量化提供商</label>
            <Select
              className="mt-1.5"
              value={embeddingProvider}
              disabled={embeddingLocked}
              onChange={setEmbeddingProvider}
              options={[
                { value: '', label: '跟随全局路由' },
                ...modelProviders.filter(p => p.embeddingModel).map(p => ({ value: p.name, label: `${p.name}${p.embeddingModel ? ` · ${p.embeddingModel}` : ''}` })),
              ]}
            />
          </div>
          <div>
            <label className={THEME.label}>向量化模型（可选）</label>
            <input
              className={`${THEME.input} mt-1.5 w-full`}
              value={embeddingModel}
              disabled={embeddingLocked}
              placeholder="留空 = 提供商默认"
              onChange={e => setEmbeddingModel(e.target.value)}
            />
          </div>
        </div>
        {embeddingLocked && (
          <p className="mt-2 text-[11px] font-bold text-amber-600">
            向量化模型已锁定：库内已有文档数据，如需更换请先清空文档或重建知识库（服务端 21024 强制拦截）
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <button className={THEME.button.primary} onClick={saveModelConfig}>保存模型配置</button>
        </div>
      </div>

      {/* 图谱开关 */}
      <div className={`${THEME.card} flex items-center justify-between p-5`}>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-neutral-800">
            <Network size={15} /> 知识图谱
            <Badge tone={app.graphEnabled ? 'success' : 'neutral'}>{app.graphEnabled ? '已开启' : '未开启'}</Badge>
          </h3>
          <p className="mt-1 text-xs font-medium text-neutral-400">开启后新摄入文档将进行实体关系抽取，检索增加 graph 通道。</p>
        </div>
        <button className={app.graphEnabled ? THEME.button.secondary : THEME.button.primary} onClick={toggleGraph}>
          {app.graphEnabled ? '关闭图谱' : '开启图谱'}
        </button>
      </div>

      {/* 成员管理（只读概览；增删改在弹窗中批量完成） */}
      <div className={`${THEME.card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-neutral-800">成员（{members.length}）</h3>
          <button className={THEME.button.secondary} onClick={() => setManageOpen(true)}>
            <UserPlus size={13} className="mr-1 inline" /> 管理成员
          </button>
        </div>
        {membersLoading ? (
          <div className="flex justify-center py-8"><Spinner size={20} /></div>
        ) : members.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">暂无成员</div>
        ) : (
          <div className="space-y-1.5">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 px-4 py-2.5">
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-black ${avatarTone(m.userId)}`}>
                  {avatarLetter(m.userName || m.userId)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-700">
                  {m.userName || m.userId}
                </span>
                <Badge tone={m.role === 'OWNER' ? 'black' : 'neutral'}>{ROLE_LABELS[m.role]}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 危险区 */}
      <div className={`${THEME.card} border-red-100 p-5`}>
        <h3 className="mb-3 text-sm font-black text-red-600">危险操作</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button className={THEME.button.secondary} onClick={toggleDisabled}>
            {app.disabled ? '启用知识库' : '停用知识库'}
          </button>
          <button className={THEME.button.danger} onClick={removeApp}>
            <Trash2 size={13} className="mr-1 inline" /> 删除知识库
          </button>
        </div>
      </div>

      {/* 成员管理弹窗：编辑表格一体（增 / 改角色 / 删除，保存时按 diff 批量提交） */}
      <MemberManageModal
        appId={app.id}
        members={members}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onSaved={loadMembers}
      />

      {ConfirmDialog}
    </div>
  );
};

export default SettingsTab;
