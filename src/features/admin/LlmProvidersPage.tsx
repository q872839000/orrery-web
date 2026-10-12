import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Check, CloudDownload, FlaskConical, Pencil, Plus, RefreshCw, Settings2, Trash2, X,
} from 'lucide-react';
import {
  aiCatalogService, llmProviderAdminService,
  type LlmProviderSaveRequest, type LlmProviderVO, type LlmRegistryView,
  type LlmTestConnectionVO,
} from '../../shared/services/ai.service';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';
import { useConfirm } from '../../shared/hooks/useConfirm';
import Badge from '../../shared/components/ui/Badge';
import Modal from '../../shared/components/ui/Modal';
import Select from '../../shared/components/ui/Select';
import Spinner from '../../shared/components/ui/Spinner';

/** 角色路由管理范围（其余角色键在服务端全量替换时原样合并保留） */
const MANAGED_ROLES = [
  { key: 'embedding', label: 'Embedding 路由' },
  { key: 'rerank', label: 'Rerank 路由' },
] as const;

/** 厂商接入模板：选择即预填 配置名/baseUrl/apiVersion/视觉声明，均可再改 */
const PROVIDER_TEMPLATES = [
  { key: 'custom', label: '自定义（OpenAI 兼容）', name: '', baseUrl: '', apiVersion: 'v1', vision: false },
  { key: 'openai', label: 'OpenAI', name: 'openai', baseUrl: 'https://api.openai.com', apiVersion: 'v1', vision: true },
  { key: 'deepseek', label: 'DeepSeek 深度求索', name: 'deepseek', baseUrl: 'https://api.deepseek.com', apiVersion: 'v1', vision: false },
  { key: 'glm', label: '智谱 GLM', name: 'glm', baseUrl: 'https://open.bigmodel.cn/api/paas', apiVersion: 'v4', vision: false },
  { key: 'kimi', label: 'Kimi（Moonshot 月之暗面）', name: 'kimi', baseUrl: 'https://api.moonshot.cn', apiVersion: 'v1', vision: false },
  { key: 'bailian', label: '阿里云百炼（DashScope 兼容模式）', name: 'bailian', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', apiVersion: 'v1', vision: true },
  { key: 'siliconflow', label: '硅基流动（SiliconFlow）', name: 'siliconflow', baseUrl: 'https://api.siliconflow.cn', apiVersion: 'v1', vision: true },
  { key: 'modelscope', label: 'ModelScope 魔搭', name: 'modelscope', baseUrl: 'https://api-inference.modelscope.cn', apiVersion: 'v1', vision: false },
  { key: 'vllm', label: '本地部署（vLLM / Ollama）', name: 'local', baseUrl: 'http://localhost:8000', apiVersion: 'v1', vision: false },
] as const;

type TemplateKey = (typeof PROVIDER_TEMPLATES)[number]['key'];

const emptyForm = (): LlmProviderSaveRequest => ({
  name: '', baseUrl: '', apiKey: '', apiVersion: '',
  chatEnabled: true, chatModel: '', visionEnabled: false, chatModels: [],
  embeddingEnabled: false, embeddingModel: '',
  rerankEnabled: false, rerankModel: '',
});

/** 大模型提供商管理页（共享注册：全平台热生效，无需重启） */
const LlmProvidersPage: React.FC = () => {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [view, setView] = useState<LlmRegistryView | null>(null);
  const [loading, setLoading] = useState(true);

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LlmProviderVO | null>(null);
  const [form, setForm] = useState<LlmProviderSaveRequest>(emptyForm());
  const [template, setTemplate] = useState<TemplateKey>('custom');
  /** 名称是否被手工改过（未改过时模板可联动预填） */
  const nameTouched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmTestConnectionVO | null>(null);
  // 拉取模型列表
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);

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

  // ─── 编辑弹窗 ──────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setTemplate('custom');
    nameTouched.current = false;
    setTestResult(null);
    setFetchedModels(null);
    setEditOpen(true);
  };

  const openEdit = (p: LlmProviderVO) => {
    setEditing(p);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl ?? '',
      apiKey: '',
      apiVersion: p.apiVersion ?? '',
      chatEnabled: p.chatEnabled ?? true,
      chatModel: p.chatModel ?? '',
      visionEnabled: p.visionEnabled ?? false,
      chatModels: p.chatModels ?? [],
      embeddingEnabled: p.embeddingEnabled ?? false,
      embeddingModel: p.embeddingModel ?? '',
      rerankEnabled: p.rerankEnabled ?? false,
      rerankModel: p.rerankModel ?? '',
    });
    setTemplate('custom');
    nameTouched.current = true; // 编辑态名称锁定，模板不联动
    setTestResult(null);
    setFetchedModels(null);
    setEditOpen(true);
  };

  const applyTemplate = (key: TemplateKey) => {
    setTemplate(key);
    const t = PROVIDER_TEMPLATES.find(x => x.key === key)!;
    setForm(f => ({
      ...f,
      name: nameTouched.current ? f.name : t.name,
      baseUrl: t.baseUrl || f.baseUrl,
      apiVersion: t.apiVersion,
      visionEnabled: t.vision,
    }));
    setFetchedModels(null);
  };

  const save = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.showError('配置名称与 base-url 不能为空');
      return;
    }
    if ((form.chatEnabled ?? true) && !form.chatModel?.trim()) {
      toast.showError('启用对话能力时请填写默认对话模型');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await llmProviderAdminService.update(editing.name, form);
        toast.showSuccess('提供商已更新（各服务热生效）');
      } else {
        await llmProviderAdminService.create(form);
        toast.showSuccess('提供商已新增（各服务热生效）');
      }
      setEditOpen(false);
      aiCatalogService.invalidate();
      load();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!form.baseUrl.trim() || !form.chatModel?.trim()) {
      toast.showError('测试前请填写 base-url 与默认对话模型');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await llmProviderAdminService.testConnection({
        name: editing?.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        apiVersion: form.apiVersion,
        chatModel: form.chatModel!,
      }));
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || '请求失败', latencyMs: null });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    if (!form.baseUrl.trim()) {
      toast.showError('先填写 base-url');
      return;
    }
    setFetchingModels(true);
    try {
      const ids = await llmProviderAdminService.listModels({
        name: editing?.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        apiVersion: form.apiVersion,
      });
      setFetchedModels(ids);
      if (ids.length === 0) toast.showError('端点返回了空的模型清单');
    } catch (e: any) {
      toast.showError(e.message || '拉取失败');
    } finally {
      setFetchingModels(false);
    }
  };

  const toggleChatModel = (id: string) => {
    setForm(f => {
      const current = f.chatModels ?? [];
      const next = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
      // 默认模型被取消勾选时清空（避免默认指向清单外模型）
      const chatModel = next.includes(f.chatModel ?? '') ? f.chatModel : (next.length === 1 ? next[0] : f.chatModel);
      return { ...f, chatModels: next, chatModel };
    });
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

  /** 模型名输入的建议列表（拉取清单 ∪ 已保存清单 ∪ 当前值） */
  const modelDatalist = useMemo(() => {
    const set = new Set<string>();
    (fetchedModels ?? []).forEach(m => set.add(m));
    (form.chatModels ?? []).forEach(m => set.add(m));
    return [...set];
  }, [fetchedModels, form.chatModels]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-neutral-900">大模型提供商</h2>
          <p className="mt-0.5 text-xs font-medium text-neutral-400">
            共享注册（Nacos 远程层）：变更写入后各接入服务热生效，无需重启；独立运行服务使用本地配置不受影响
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={THEME.button.secondary} onClick={load}>
            <RefreshCw size={13} className="mr-1 inline" /> 刷新
          </button>
          <button className={THEME.button.secondary} onClick={openSettings} disabled={!view}>
            <Settings2 size={13} className="mr-1 inline" /> 注册设置
          </button>
          <button className={THEME.button.primary} onClick={openCreate}>
            <Plus size={13} className="mr-1 inline" /> 新增提供商
          </button>
        </div>
      </div>

      {/* 注册信息 */}
      <div className={`${THEME.card} flex flex-wrap items-center gap-x-6 gap-y-2 p-4`}>
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

      {/* 提供商列表 */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : !view || view.providers.length === 0 ? (
        <div className={`${THEME.card} flex flex-col items-center gap-3 py-16`}>
          <Bot size={32} className="text-neutral-200" />
          <p className="text-sm font-medium text-neutral-400">共享注册中还没有提供商，点击「新增提供商」开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {view.providers.map(p => (
            <div key={p.name} className={`${THEME.card} flex items-center gap-4 p-4`}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
                <Bot size={17} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-neutral-900">{p.name}</span>
                  {p.defaultProvider && <Badge tone="black">默认</Badge>}
                  {p.chatEnabled === false && <Badge tone="warning">已停用</Badge>}
                  {p.visionEnabled && <Badge tone="success">视觉</Badge>}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-neutral-400">
                  {p.baseUrl}{p.apiKeyMasked ? ` · ${p.apiKeyMasked}` : ' · 未配置密钥'}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.chatEnabled !== false && (
                    <Badge tone="success">
                      对话{p.chatModel ? ` · ${p.chatModel}` : ''}
                      {p.chatModels && p.chatModels.length > 1 ? `（共 ${p.chatModels.length} 个模型）` : ''}
                    </Badge>
                  )}
                  {p.embeddingEnabled && p.embeddingModel && (
                    <Badge tone="neutral">向量 · {p.embeddingModel}</Badge>
                  )}
                  {p.rerankEnabled && p.rerankModel && (
                    <Badge tone="neutral">重排 · {p.rerankModel}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button className={THEME.buttonIcon} title="编辑" onClick={() => openEdit(p)}>
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
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗（宽版两列） */}
      <Modal
        open={editOpen}
        title={editing ? `编辑提供商 · ${editing.name}` : '新增提供商'}
        width="max-w-3xl"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button className={THEME.button.secondary} onClick={() => setEditOpen(false)}>取消</button>
            <button className={THEME.button.primary} onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* ① 接入点 */}
          <section className="rounded-2xl border border-neutral-100 p-4">
            <h4 className="mb-3 text-[13px] font-black text-neutral-800">接入点</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!editing && (
                <div className="min-w-0">
                  <label className={THEME.label}>厂商模板（预填，可再改）</label>
                  <Select
                    className="mt-1.5"
                    value={template}
                    onChange={v => applyTemplate(v as TemplateKey)}
                    options={PROVIDER_TEMPLATES.map(t => ({ value: t.key, label: t.label }))}
                  />
                </div>
              )}
              <div className="min-w-0">
                <label className={THEME.label}>配置名称（保存后不可改）</label>
                <input
                  className={`${THEME.input} mt-1.5 w-full`}
                  value={form.name}
                  disabled={!!editing}
                  placeholder="如 deepseek、local、glm"
                  onChange={e => {
                    nameTouched.current = true;
                    setForm(f => ({ ...f, name: e.target.value }));
                  }}
                />
                <p className="mt-1 break-words text-[11px] font-medium text-neutral-400">
                  各服务按此名路由（cy.ai.providers.&lt;名称&gt;），与下面的模型名是两回事
                </p>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <label className={THEME.label}>Base URL</label>
                    <input
                      className={`${THEME.input} mt-1.5 w-full`}
                      value={form.baseUrl}
                      placeholder="https://api.deepseek.com 或 http://localhost:8000"
                      onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    />
                  </div>
                  <div className="w-28 flex-shrink-0">
                    <label className={THEME.label}>API 版本前缀</label>
                    <input
                      className={`${THEME.input} mt-1.5 w-full`}
                      value={form.apiVersion ?? ''}
                      placeholder="v1"
                      onChange={e => setForm(f => ({ ...f, apiVersion: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className={THEME.label}>
                    API Key{editing ? '（留空 = 保持原值）' : '（本地服务可留空）'}
                  </label>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] font-bold text-violet-600 transition-colors hover:text-violet-800 disabled:opacity-40"
                    onClick={fetchModels}
                    disabled={fetchingModels}
                    title="按 base-url + key 调用 OpenAI 兼容 GET /models"
                  >
                    <CloudDownload size={12} /> {fetchingModels ? '拉取中…' : '拉取模型列表'}
                  </button>
                </div>
                <input
                  className={`${THEME.input} mt-1.5`}
                  type="password"
                  value={form.apiKey ?? ''}
                  placeholder={editing ? (editing.apiKeyMasked ?? '保持原值') : 'sk-…'}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                />
              </div>
            </div>

            {/* 拉取结果：勾选进可用清单 */}
            {fetchedModels !== null && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-neutral-500">
                    拉到 {fetchedModels.length} 个模型，勾选进入「可用对话模型清单」
                  </span>
                  <span className="flex gap-2 text-[11px] font-bold">
                    <button type="button" className="text-violet-600 hover:text-violet-800"
                      onClick={() => setForm(f => ({ ...f, chatModels: [...fetchedModels] }))}>全选</button>
                    <button type="button" className="text-neutral-400 hover:text-neutral-600"
                      onClick={() => setForm(f => ({ ...f, chatModels: [] }))}>清空</button>
                  </span>
                </div>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {fetchedModels.map(id => {
                    const checked = (form.chatModels ?? []).includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleChatModel(id)}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${
                          checked
                            ? 'border-black bg-black text-white'
                            : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        {id}
                      </button>
                    );
                  })}
                  {fetchedModels.length === 0 && (
                    <span className="text-[11px] text-neutral-400">（空）</span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ② 用途模型 */}
          <section className="rounded-2xl border border-neutral-100 p-4">
            <h4 className="mb-1 text-[13px] font-black text-neutral-800">用途模型</h4>
            <p className="mb-3 text-[11px] font-medium text-neutral-400">
              一个提供商 = 一套接入点；三种用途各填各的模型名，勾选并填模型名即启用该用途，互不干扰
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* 对话 */}
              <div className="rounded-xl bg-neutral-50/80 p-3">
                <label className="flex items-center gap-2 text-[12px] font-bold text-neutral-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-neutral-300 accent-black"
                    checked={form.chatEnabled ?? true}
                    onChange={e => setForm(f => ({ ...f, chatEnabled: e.target.checked }))}
                  />
                  对话（问答 / 生成）
                </label>
                {(form.chatEnabled ?? true) && (
                  <>
                    <input
                      className={`${THEME.input} mt-2`}
                      list="llm-model-datalist"
                      value={form.chatModel ?? ''}
                      placeholder="默认对话模型 *"
                      onChange={e => setForm(f => ({ ...f, chatModel: e.target.value }))}
                    />
                    <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-neutral-500">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-neutral-300 accent-black"
                        checked={form.visionEnabled ?? false}
                        onChange={e => setForm(f => ({ ...f, visionEnabled: e.target.checked }))}
                      />
                      支持视觉（图片输入）
                    </label>
                  </>
                )}
              </div>
              {/* Embedding */}
              <div className="rounded-xl bg-neutral-50/80 p-3">
                <label className="flex items-center gap-2 text-[12px] font-bold text-neutral-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-neutral-300 accent-black"
                    checked={form.embeddingEnabled ?? false}
                    onChange={e => setForm(f => ({ ...f, embeddingEnabled: e.target.checked }))}
                  />
                  向量（Embedding）
                </label>
                {form.embeddingEnabled && (
                  <input
                    className={`${THEME.input} mt-2`}
                    list="llm-model-datalist"
                    value={form.embeddingModel ?? ''}
                    placeholder="如 bge-m3"
                    onChange={e => setForm(f => ({ ...f, embeddingModel: e.target.value }))}
                  />
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">文档入库与检索的向量化</p>
              </div>
              {/* Rerank */}
              <div className="rounded-xl bg-neutral-50/80 p-3">
                <label className="flex items-center gap-2 text-[12px] font-bold text-neutral-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-neutral-300 accent-black"
                    checked={form.rerankEnabled ?? false}
                    onChange={e => setForm(f => ({ ...f, rerankEnabled: e.target.checked }))}
                  />
                  重排（Rerank）
                </label>
                {form.rerankEnabled && (
                  <input
                    className={`${THEME.input} mt-2`}
                    list="llm-model-datalist"
                    value={form.rerankModel ?? ''}
                    placeholder="如 bge-reranker-v2-m3"
                    onChange={e => setForm(f => ({ ...f, rerankModel: e.target.value }))}
                  />
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">检索结果二次精排</p>
              </div>
            </div>
            <datalist id="llm-model-datalist">
              {modelDatalist.map(m => <option key={m} value={m} />)}
            </datalist>
          </section>

          {/* 测试连接 */}
          <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-2.5">
            <button className={THEME.button.secondary} onClick={testConnection} disabled={testing}>
              <FlaskConical size={13} className="mr-1 inline" /> {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span className={`flex items-center gap-1 text-xs font-bold ${testResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                {testResult.success ? <Check size={13} /> : <X size={13} />}
                {testResult.message}
                {testResult.latencyMs != null && `（${testResult.latencyMs}ms）`}
              </span>
            )}
          </div>
        </div>
      </Modal>

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
