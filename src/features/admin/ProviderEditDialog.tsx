import React, { useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import {
  llmProviderAdminService,
  type LlmProviderSaveRequest, type LlmProviderVO,
} from '../../shared/services/ai.service';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';
import Modal from '../../shared/components/ui/Modal';
import Select from '../../shared/components/ui/Select';
import Checkbox from '../../shared/components/ui/Checkbox';
import ModelConfigTable, { type ModelConfigValue } from './ModelConfigTable';

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

/** 思考控制模式选项（与后端 ThinkingControlMode 枚举同步；'' = 清除配置回退无思考控制） */
const THINKING_MODE_OPTIONS = [
  { value: '', label: '无思考控制（默认）', desc: '对话页不显示思考开关，跟随模型默认行为' },
  { value: 'STANDARD_REASONING_EFFORT', label: '标准 · reasoning_effort（推荐）', desc: '网关（SiliconFlow 等）与 DeepSeek 官方；关=none，可调低/中/高强度' },
  { value: 'GLM_THINKING_TYPE', label: '智谱直连 · thinking.type', desc: 'GLM-4.5~4.7 直连智谱官方 API 时使用（不支持 reasoning_effort）' },
  { value: 'QWEN_ENABLE_THINKING', label: 'Qwen / vLLM · enable_thinking', desc: 'DashScope 直连或 vLLM 自部署时使用' },
];

const emptyForm = (): LlmProviderSaveRequest => ({
  name: '', baseUrl: '', apiKey: '', apiVersion: 'v1',
  chatEnabled: true, chatModel: '', visionEnabled: false, chatModels: [],
  embeddingEnabled: false, embeddingModel: '',
  rerankEnabled: false, rerankModel: '',
  thinkingControlMode: '',
});

/** VO → 保存请求（apiKey 留空 = 保持原值） */
export const toSaveRequest = (p: LlmProviderVO): LlmProviderSaveRequest => ({
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

/** 表单 ↔ 模型配置表编辑态 */
const toModelConfig = (f: LlmProviderSaveRequest): ModelConfigValue => ({
  chatModels: f.chatModels ?? [],
  chatModel: f.chatModel ?? '',
  embeddingModel: f.embeddingModel ?? '',
  rerankModel: f.rerankModel ?? '',
});

const fromModelConfig = (f: LlmProviderSaveRequest, v: ModelConfigValue): LlmProviderSaveRequest => ({
  ...f,
  chatModels: v.chatModels,
  chatModel: v.chatModel,
  embeddingEnabled: !!v.embeddingModel,
  embeddingModel: v.embeddingModel,
  rerankEnabled: !!v.rerankModel,
  rerankModel: v.rerankModel,
});

interface VerifyResult {
  success: boolean;
  count?: number;
  message?: string;
}

interface ProviderEditDialogProps {
  open: boolean;
  /** null = 新增 */
  editing: LlmProviderVO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 添加 / 编辑提供商弹窗（单屏不滚动：基本信息 + 统一模型配置表；仅挂载时初始化，父组件按 open 条件挂载） */
const ProviderEditDialog: React.FC<ProviderEditDialogProps> = ({ open, editing, onClose, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<LlmProviderSaveRequest>(() => editing
    ? { ...toSaveRequest(editing), thinkingControlMode: editing.thinkingControlMode ?? '' }
    : emptyForm());
  const [template, setTemplate] = useState<TemplateKey>('custom');
  /** 名称是否被手工改过（未改过时模板可联动预填） */
  const nameTouched = useRef(!!editing);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  /** 手工补充的自定义模型行 */
  const [extraModels, setExtraModels] = useState<string[]>([]);

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
    setVerifyResult(null);
    setFetchedModels(null);
  };

  /** 获取模型列表 = 调 OpenAI 兼容 GET /models：连通性 + 密钥 + 清单一并验证 */
  const fetchModels = async () => {
    if (!form.baseUrl.trim()) {
      toast.showError('先填写 Base URL');
      return;
    }
    setFetching(true);
    setVerifyResult(null);
    try {
      const ids = await llmProviderAdminService.listModels({
        name: editing?.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        apiVersion: form.apiVersion,
      });
      setFetchedModels(ids);
      setVerifyResult({ success: true, count: ids.length });
      if (!editing && ids.length > 0) {
        // 新建态自动勾选全部对话模型，默认模型取当前值（须在清单内）否则首个
        setForm(f => ({
          ...f,
          chatModels: ids,
          chatModel: f.chatModel && ids.includes(f.chatModel) ? f.chatModel : ids[0],
        }));
      }
    } catch (e: any) {
      setVerifyResult({ success: false, message: e.message || '获取失败' });
    } finally {
      setFetching(false);
    }
  };

  /** 弹窗模型表行：拉取清单 ∪ 已保存清单 ∪ 向量/重排 ∪ 自定义补充（去重保序） */
  const modelRows = useMemo(() => {
    const rows: string[] = [];
    const push = (m?: string | null) => { if (m && !rows.includes(m)) rows.push(m); };
    (fetchedModels ?? []).forEach(push);
    (form.chatModels ?? []).forEach(push);
    push(form.chatModel);
    push(form.embeddingModel);
    push(form.rerankModel);
    extraModels.forEach(push);
    return rows;
  }, [fetchedModels, form.chatModels, form.chatModel, form.embeddingModel, form.rerankModel, extraModels]);

  const addCustomModel = (name: string) => {
    setExtraModels(prev => prev.includes(name) ? prev : [...prev, name]);
    setForm(f => ({
      ...f,
      chatModels: (f.chatModels ?? []).includes(name) ? f.chatModels : [...(f.chatModels ?? []), name],
      chatModel: f.chatModel || name,
    }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.showError('配置名称与 Base URL 不能为空');
      return;
    }
    if ((form.chatEnabled ?? true) && !form.chatModel?.trim()) {
      toast.showError('请在模型表中选择一个默认对话模型');
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
      onSaved();
      onClose();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? `编辑提供商 · ${editing.name}` : '添加提供商'}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <button className={THEME.button.secondary} onClick={onClose}>取消</button>
          <button className={THEME.button.primary} onClick={save} disabled={saving}>
            {saving ? '保存中…' : editing ? '保存更改' : '保存提供商'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 基本信息 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editing && (
            <div className="min-w-0">
              <label className={THEME.label}>提供商平台（预填，可再改）</label>
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
              <div className="w-24 flex-shrink-0">
                <label className={THEME.label}>版本前缀</label>
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
            <label className={THEME.label}>
              API Key{editing ? '（留空 = 保持原值）' : '（本地服务可留空）'}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  className={`${THEME.input} w-full !pr-9`}
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey ?? ''}
                  placeholder={editing ? (editing.apiKeyMasked ?? '保持原值') : 'sk-…'}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-700"
                  title={showKey ? '隐藏密钥' : '显示密钥'}
                  onClick={() => setShowKey(v => !v)}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                className={THEME.button.secondary}
                onClick={fetchModels}
                disabled={fetching}
                title="按 Base URL + Key 调用 OpenAI 兼容 GET /models，连通性与密钥一并验证"
              >
                {fetching ? <RefreshCw size={13} className="animate-spin" /> : null}
                {fetching ? '获取中…' : '获取模型列表'}
              </button>
            </div>
            {verifyResult && (
              <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold ${verifyResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                {verifyResult.success ? <Check size={12} /> : <X size={12} />}
                {verifyResult.success
                  ? (verifyResult.count != null && verifyResult.count > 0
                      ? `连接成功，拉取到 ${verifyResult.count} 个模型`
                      : '连接成功，但端点返回了空的模型清单（可手动添加自定义模型）')
                  : verifyResult.message}
              </p>
            )}
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className={THEME.label}>思考控制模式</label>
            <Select
              className="mt-1.5"
              value={form.thinkingControlMode ?? ''}
              onChange={v => setForm(f => ({ ...f, thinkingControlMode: v }))}
              options={THINKING_MODE_OPTIONS}
            />
            <p className="mt-1 text-[11px] font-medium text-neutral-400">
              经 OpenAI 兼容网关（SiliconFlow 等）或 DeepSeek 官方接入选「标准」即可；智谱直连 GLM-4.5~4.7 选「智谱直连」
            </p>
          </div>
          <div className="flex items-center gap-5 sm:col-span-2">
            <Checkbox
              checked={form.chatEnabled ?? true}
              onChange={v => setForm(f => ({ ...f, chatEnabled: v }))}
              label="启用对话能力"
            />
            <Checkbox
              checked={form.visionEnabled ?? false}
              onChange={v => setForm(f => ({ ...f, visionEnabled: v }))}
              disabled={!(form.chatEnabled ?? true)}
              label="支持视觉（图片输入）"
              title="提供商级能力声明：勾选后图片输入可路由到该提供商"
            />
          </div>
        </div>

        {/* 模型选择与配置（对话/默认/向量/重排同表） */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-[13px] font-black text-neutral-800">模型选择与配置</h4>
            {!editing && fetchedModels !== null && fetchedModels.length > 0 && (
              <span className="text-[11px] font-medium text-neutral-400">已自动勾选全部模型</span>
            )}
          </div>
          <ModelConfigTable
            rows={modelRows}
            value={toModelConfig(form)}
            onChange={v => setForm(f => fromModelConfig(f, v))}
            onAddCustom={addCustomModel}
          />
          <p className="mt-1 text-[11px] font-medium text-neutral-400">
            勾选的对话模型出现在各对话页的选择器中；「默认」是未指定模型时的落点；向量/重排各选一个（再点取消）
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ProviderEditDialog;
