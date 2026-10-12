/**
 * 会话级模型选择器（provider → 模型 分组）
 * <p>
 * 数据源为承载服务的 GET /ai/catalog（热更新即时可见）；
 * 选择即写入会话模型偏好（POST /conversation/session/model，provider + model 双写）。
 * 新会话尚无 sessionId 时暂存本地，会话创建后自动补写。
 * </p>
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiCatalogService, conversationModelApi, type AiProviderItem } from '../services/ai.service';
import Select from './ui/Select';

interface ModelPreferenceSelectProps {
  /** 承载服务前缀（Nacos 服务 ID，如 orrery-butler-service / cy-knowledge-repository） */
  servicePrefix: string;
  /** 当前会话 ID（null = 新会话，选择暂存待会话创建后补写） */
  sessionId: string | null;
  /** 禁用（如流式进行中） */
  disabled?: boolean;
  /** 偏好生效后回调 */
  onApplied?: (provider: string | null) => void;
  /**
   * 偏好解析完成回调（会话偏好读取完成 / 新会话暂存选择 / 用户变更后均触发）。
   * 供调用方推导能力门控（如视觉能力决定图片输入入口开关）——能力为 provider 级声明。
   */
  onPreferenceResolved?: (provider: string | null) => void;
}

/** 选项值编码：'provider::model'（model 空 = provider 默认模型）；'' = 平台默认 */
const encode = (provider: string, model?: string | null) => `${provider}::${model ?? ''}`;
const decode = (value: string): { provider: string | null; model: string | null } => {
  if (!value) return { provider: null, model: null };
  const idx = value.indexOf('::');
  return {
    provider: idx < 0 ? value : value.slice(0, idx),
    model: idx < 0 ? null : (value.slice(idx + 2) || null),
  };
};

const ModelPreferenceSelect: React.FC<ModelPreferenceSelectProps> = ({
  servicePrefix, sessionId, disabled, onApplied, onPreferenceResolved,
}) => {
  const [providers, setProviders] = useState<AiProviderItem[] | null>(null);
  /** 当前选中值（编码形态；'' = 平台默认） */
  const [selection, setSelection] = useState('');
  /** 新会话暂存的选择（undefined = 无暂存） */
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /** 防止会话切换期间的旧请求覆盖新会话偏好 */
  const loadSeq = useRef(0);

  // 目录加载（服务级缓存去重）
  useEffect(() => {
    let alive = true;
    aiCatalogService.catalog(servicePrefix)
      .then(vo => { if (alive) setProviders(vo.providers ?? []); })
      .catch(() => { if (alive) setProviders([]); });
    return () => { alive = false; };
  }, [servicePrefix]);

  // 会话切换 → 读取既有偏好
  useEffect(() => {
    if (!sessionId) return;
    const seq = ++loadSeq.current;
    conversationModelApi.getPreference(servicePrefix, sessionId)
      .then(pref => {
        if (loadSeq.current !== seq) return;
        setSelection(pref.llmProvider ? encode(pref.llmProvider, pref.llmModel) : '');
        onPreferenceResolved?.(pref.llmProvider ?? null);
      })
      .catch(() => { /* 偏好读取失败保持当前选中，不阻断 */ });
  }, [servicePrefix, sessionId]);

  // 新会话创建后补写暂存选择
  useEffect(() => {
    if (!sessionId || pending === undefined) return;
    const { provider, model } = decode(pending);
    setPending(undefined);
    void apply(provider, model);
  }, [sessionId, pending]);

  const apply = useCallback(async (provider: string | null, model: string | null) => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await conversationModelApi.updatePreference(servicePrefix, sessionId, provider, model);
      onApplied?.(provider);
      onPreferenceResolved?.(provider);
    } catch { /* 写入失败由调用方下次读取自愈；不打断对话 */ }
    finally { setSaving(false); }
  }, [servicePrefix, sessionId, onApplied, onPreferenceResolved]);

  const handleChange = (value: string) => {
    setSelection(value);
    const { provider, model } = decode(value);
    if (sessionId) {
      void apply(provider, model);
    } else {
      setPending(value);
      // 新会话暂存选择即时生效于能力门控（如图片输入入口开关）
      onPreferenceResolved?.(provider);
    }
  };

  /** provider → 模型 分组选项（无清单的 provider 落单项"默认模型"） */
  const options = useMemo(() => {
    const list: { value: string; label: string; desc?: string; group?: string }[] = [
      { value: '', label: '平台默认' },
    ];
    for (const p of providers ?? []) {
      const models = (p.chatModels ?? []).filter(m => !!m);
      if (models.length === 0) {
        list.push({
          value: encode(p.name),
          label: p.chatModel ?? '默认模型',
          desc: '提供商默认',
          group: p.name,
        });
        continue;
      }
      for (const m of models) {
        list.push({
          value: encode(p.name, m),
          label: m,
          desc: m === p.chatModel ? '提供商默认' : undefined,
          group: p.name,
        });
      }
    }
    // 已失效的偏好（模型/提供商被移除）兜底显示，避免选择器空白
    if (selection && !list.some(o => o.value === selection)) {
      const { provider, model } = decode(selection);
      list.push({ value: selection, label: model ?? provider ?? selection, desc: '已不在目录中', group: provider ?? undefined });
    }
    return list;
  }, [providers, selection]);

  return (
    <Select
      compact
      className="min-w-[140px]"
      value={selection}
      onChange={handleChange}
      disabled={disabled || saving || providers === null}
      placeholder="平台默认"
      options={options}
    />
  );
};

export default ModelPreferenceSelect;
