import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, ListPlus, Pencil, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-react';
import {
  aiCatalogService, llmProviderAdminService,
  type LlmProviderVO, type LlmRegistryView,
} from '../../shared/services/ai.service';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';
import { useConfirm } from '../../shared/hooks/useConfirm';
import { Button } from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import Modal from '../../shared/components/ui/Modal';
import Select from '../../shared/components/ui/Select';
import Spinner from '../../shared/components/ui/Spinner';
import Switch from '../../shared/components/ui/Switch';
import ProviderEditDialog, { toSaveRequest } from './ProviderEditDialog';
import ProviderModelsDialog from './ProviderModelsDialog';

/** 角色路由管理范围（其余角色键在服务端全量替换时原样合并保留） */
const MANAGED_ROLES = [
  { key: 'embedding', label: 'Embedding 路由' },
  { key: 'rerank', label: 'Rerank 路由' },
] as const;

/** 提供商头像渐变池（按名称哈希稳定取色） */
const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600', 'from-sky-500 to-blue-600', 'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600', 'from-rose-500 to-pink-600', 'from-indigo-500 to-violet-600',
];
const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % AVATAR_GRADIENTS.length];

/** 思考控制模式 → 卡片徽标短名（null/空 = 未配置不显示） */
const thinkingModeBadge = (mode?: string | null): string | null => {
  switch (mode) {
    case 'STANDARD_REASONING_EFFORT': return '思考 · 标准';
    case 'GLM_THINKING_TYPE': return '思考 · 智谱';
    case 'QWEN_ENABLE_THINKING': return '思考 · Qwen';
    case 'DEEPSEEK_THINKING_TYPE': return '思考 · 标准(旧)';
    default: return null;
  }
};

/** 大模型提供商管理页（共享注册：全平台热生效，无需重启） */
const LlmProvidersPage: React.FC = () => {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [view, setView] = useState<LlmRegistryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** 行内模型开关保存中标记（provider::model） */
  const [rowSaving, setRowSaving] = useState<string | null>(null);
  /**
   * 本次会话内被关掉（移出可用清单）的模型：以"关"态行继续展示，可一键加回。
   * 注册表只存启用清单，"已知但停用"无持久化字段，故仅留存于页面会话。
   */
  const [removedModels, setRemovedModels] = useState<Record<string, string[]>>({});

  // 弹窗挂载态（条件挂载保证每次打开都是全新表单）
  const [editTarget, setEditTarget] = useState<LlmProviderVO | null | 'new'>(null);
  const [modelsTarget, setModelsTarget] = useState<LlmProviderVO | null>(null);

  // 注册设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState('');
  const [roleRoutes, setRoleRoutes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await llmProviderAdminService.registry());
    } catch (e: any) {
      toast.showError(e.message || '加载注册表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = view?.providers ?? [];
    if (!q) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(q)
      || (p.baseUrl ?? '').toLowerCase().includes(q)
      || (p.chatModels ?? []).some(m => m.toLowerCase().includes(q))
      || (p.chatModel ?? '').toLowerCase().includes(q));
  }, [view, search]);

  // ─── 卡片行内模型开关（立即生效） ──────────────────────────

  const toggleModelOnCard = async (p: LlmProviderVO, modelId: string) => {
    const current = p.chatModels ?? [];
    const next = current.includes(modelId) ? current.filter(m => m !== modelId) : [...current, modelId];
    // 默认模型一致性：关掉默认模型则回退到剩余首个；启用首个模型且尚无默认时补默认
    let chatModel = p.chatModel ?? '';
    if (current.includes(modelId) && chatModel === modelId) chatModel = next[0] ?? '';
    if (!current.includes(modelId) && !chatModel) chatModel = modelId;

    const key = `${p.name}::${modelId}`;
    setRowSaving(key);
    // 乐观更新，失败回读还原
    setView(v => v && {
      ...v,
      providers: v.providers.map(x => x.name === p.name ? { ...x, chatModels: next, chatModel } : x),
    });
    try {
      await llmProviderAdminService.update(p.name, { ...toSaveRequest(p), chatModels: next, chatModel });
      aiCatalogService.invalidate();
      // 关掉的模型留"关"态行可一键加回；加回的模型从停用行移除
      setRemovedModels(prev => {
        const list = prev[p.name] ?? [];
        const updated = current.includes(modelId)
          ? (list.includes(modelId) ? list : [...list, modelId])
          : list.filter(m => m !== modelId);
        return { ...prev, [p.name]: updated };
      });
    } catch (e: any) {
      toast.showError(e.message || '模型开关保存失败');
      void load();
    } finally {
      setRowSaving(null);
    }
  };

  // ─── 删除 ──────────────────────────────────────────────────

  const remove = async (p: LlmProviderVO) => {
    const ok = await confirm({
      title: '删除提供商',
      message: `删除「${p.name}」后所有服务将不再能按名路由到它（本地兜底配置不受影响）。确认删除？`,
      type: 'warning',
      confirmText: '删除',
    });
    if (!ok) return;
    try {
      await llmProviderAdminService.remove(p.name);
      toast.showSuccess('已删除');
      aiCatalogService.invalidate();
      load();
    } catch (e: any) {
      toast.showError(e.message || '删除失败');
    }
  };

  // ─── 注册设置 ──────────────────────────────────────────────

  const openSettings = () => {
    setDefaultProvider(view?.defaultProvider ?? '');
    setRoleRoutes({ ...(view?.roles ?? {}) });
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    // roles 为服务端全量替换语义：未管理的角色键原样合并保留，仅覆盖受管项
    const roles: Record<string, string> = { ...(view?.roles ?? {}) };
    MANAGED_ROLES.forEach(({ key }) => {
      const v = roleRoutes[key];
      if (v) roles[key] = v;
      else delete roles[key];
    });
    try {
      await llmProviderAdminService.updateSettings({
        defaultProvider: defaultProvider || null,
        roles,
      });
      toast.showSuccess('注册设置已生效');
      setSettingsOpen(false);
      aiCatalogService.invalidate();
      load();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    }
  };

  const providerNames = (view?.providers ?? []).map(p => p.name);
  const roleEntries = Object.entries(view?.roles ?? {});

  // ─── 渲染 ──────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 sm:space-y-8">
      {/* 页头（与成员管理等管理页同款式样） */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-0">
        <div>
          <h1 className="text-xl font-black tracking-tighter text-black sm:text-2xl">大模型提供商</h1>
          <p className="mt-1 text-xs font-medium text-neutral-400 sm:mt-1.5 sm:text-sm">
            共享注册（Nacos 远程层）：变更写入后各接入服务热生效，无需重启
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`w-52 ${THEME.searchWrapper}`}>
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 w-3.5 h-3.5 -translate-y-1/2 text-neutral-300" />
            <input
              className={`${THEME.searchInput} !pl-9`}
              placeholder="检索名称 / 模型"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className={THEME.buttonIcon} title="刷新" onClick={load}>
            <RefreshCw size={15} />
          </button>
          <button className={THEME.buttonIcon} title="注册设置（默认提供商 / 角色路由）" onClick={openSettings} disabled={!view}>
            <Settings2 size={15} />
          </button>
          <Button size="md" onClick={() => setEditTarget('new')}>
            <Plus size={16} className="mr-2" /> 添加提供商
          </Button>
        </div>
      </div>

      {/* 注册信息（紧凑条） */}
      <div className={`${THEME.card} flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3`}>
        <div className="flex items-center gap-2 text-[13px]">
          <span className={THEME.label}>默认提供商</span>
          <span className="font-black text-neutral-800">{view?.defaultProvider ?? '（未设置）'}</span>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <span className={THEME.label}>角色路由</span>
          {roleEntries.length === 0 ? (
            <span className="font-medium text-neutral-400">（未配置，按能力自动探测）</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {roleEntries.map(([role, target]) => (
                <Badge key={role} tone="neutral">{role} → {target}</Badge>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* 提供商卡片网格 */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : !view || view.providers.length === 0 ? (
        <div className={THEME.empty}>
          <div className={THEME.emptyIcon}><Bot size={26} /></div>
          <p className={THEME.emptyTitle}>共享注册中还没有提供商</p>
          <p className={THEME.emptyDesc}>点击「添加提供商」开始接入</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProviders.map(p => {
            const enabled = p.chatEnabled !== false;
            const models = p.chatModels ?? [];
            const offRows = (removedModels[p.name] ?? []).filter(m => !models.includes(m));
            return (
              <div key={p.name} className={`${THEME.card} flex flex-col overflow-hidden`}>
                {/* 卡片头：头像 / 名称 / 状态 / 操作 */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGradient(p.name)} text-sm font-black text-white shadow-sm`}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-neutral-900">{p.name}</span>
                      {p.defaultProvider && <Badge tone="black">默认</Badge>}
                      {p.visionEnabled && <Badge tone="success">视觉</Badge>}
                      {thinkingModeBadge(p.thinkingControlMode) && (
                        <Badge tone="neutral">{thinkingModeBadge(p.thinkingControlMode)}</Badge>
                      )}
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 text-[11px] font-bold ${enabled ? 'text-emerald-600' : 'text-neutral-400'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                      {enabled ? '已启用' : '已禁用'}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-400" title={p.baseUrl ?? ''}>
                      {p.baseUrl}{p.apiKeyMasked ? ` · ${p.apiKeyMasked}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      className={THEME.buttonIcon}
                      title="获取模型列表（按已存配置拉取远程清单）"
                      onClick={() => setModelsTarget(p)}
                    >
                      <ListPlus size={14} />
                    </button>
                    <button className={THEME.buttonIcon} title="编辑" onClick={() => setEditTarget(p)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      className={`${THEME.buttonIcon} hover:!bg-red-50 hover:!text-red-600`}
                      title="删除"
                      onClick={() => remove(p)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 包含模型清单（开关即时生效） */}
                <div className="border-t border-neutral-100 px-4 py-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    包含模型（{models.length}）
                  </div>
                  {models.length === 0 && offRows.length === 0 ? (
                    <p className="py-1 text-[11px] font-medium text-neutral-400">
                      暂无模型清单 — 点上方 <ListPlus size={11} className="inline -translate-y-px" /> 获取模型列表后勾选
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {models.map(m => (
                        <div key={m} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-neutral-50">
                          <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-neutral-700" title={m}>
                            {m}
                          </span>
                          {m === p.chatModel && (
                            <span className="flex-shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-black text-neutral-400">
                              默认
                            </span>
                          )}
                          {rowSaving === `${p.name}::${m}`
                            ? <RefreshCw size={13} className="flex-shrink-0 animate-spin text-neutral-300" />
                            : <Switch on disabled={!enabled || rowSaving !== null} title="从可用清单移除" onChange={() => toggleModelOnCard(p, m)} />}
                        </div>
                      ))}
                      {offRows.map(m => (
                        <div key={m} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-neutral-50">
                          <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-neutral-400" title={m}>
                            {m}
                          </span>
                          {rowSaving === `${p.name}::${m}`
                            ? <RefreshCw size={13} className="flex-shrink-0 animate-spin text-neutral-300" />
                            : <Switch on={false} disabled={!enabled || rowSaving !== null} title="加回可用清单" onChange={() => toggleModelOnCard(p, m)} />}
                        </div>
                      ))}
                    </div>
                  )}
                  {(p.embeddingEnabled && p.embeddingModel) || (p.rerankEnabled && p.rerankModel) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed border-neutral-100 pt-2">
                      {p.embeddingEnabled && p.embeddingModel && <Badge tone="neutral">向量 · {p.embeddingModel}</Badge>}
                      {p.rerankEnabled && p.rerankModel && <Badge tone="neutral">重排 · {p.rerankModel}</Badge>}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* 虚线添加卡 */}
          <button
            type="button"
            onClick={() => setEditTarget('new')}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 text-neutral-400 transition-all hover:border-violet-300 hover:text-violet-600 hover:shadow-sm"
          >
            <Plus size={22} strokeWidth={1.5} />
            <span className="text-xs font-bold">添加新提供商</span>
          </button>
        </div>
      )}
      {!loading && view && view.providers.length > 0 && filteredProviders.length === 0 && (
        <div className={`${THEME.card} py-10 text-center text-xs font-medium text-neutral-400`}>
          没有匹配「{search}」的提供商
        </div>
      )}

      {/* 添加 / 编辑弹窗（条件挂载：每次打开全新表单） */}
      {editTarget !== null && (
        <ProviderEditDialog
          open
          editing={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { aiCatalogService.invalidate(); load(); }}
        />
      )}

      {/* 获取模型列表弹窗 */}
      {modelsTarget && (
        <ProviderModelsDialog
          provider={modelsTarget}
          onClose={() => setModelsTarget(null)}
          onSaved={() => { aiCatalogService.invalidate(); load(); }}
        />
      )}

      {/* 注册设置弹窗 */}
      <Modal
        open={settingsOpen}
        title="注册设置"
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <button className={THEME.button.secondary} onClick={() => setSettingsOpen(false)}>取消</button>
            <button className={THEME.button.primary} onClick={saveSettings}>保存</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className={THEME.label}>默认提供商</label>
            <Select
              className="mt-1.5"
              value={defaultProvider}
              onChange={setDefaultProvider}
              options={[{ value: '', label: '（不设置）' },
                ...providerNames.map(n => ({ value: n, label: n }))]}
            />
            <p className="mt-1 text-[11px] font-medium text-neutral-400">
              各服务未显式指定 provider 的对话调用走此默认值
            </p>
          </div>
          {MANAGED_ROLES.map(({ key, label }) => (
            <div key={key}>
              <label className={THEME.label}>{label}</label>
              <Select
                className="mt-1.5"
                value={roleRoutes[key] ?? ''}
                onChange={v => setRoleRoutes(r => ({ ...r, [key]: v }))}
                options={[{ value: '', label: '（不路由，按能力自动探测）' },
                  ...providerNames.map(n => ({ value: n, label: n }))]}
              />
            </div>
          ))}
        </div>
      </Modal>

      {ConfirmDialog}
    </div>
  );
};

export default LlmProvidersPage;
