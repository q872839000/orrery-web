/**
 * 会话级模型选择器（模型 + 思考双胶囊，供输入区工具条布局）
 * <p>
 * 数据源为承载服务的 GET /ai/catalog（热更新即时可见）；
 * 选择即写入会话模型偏好（POST /conversation/session/model，provider + model + thinking 全量提交）。
 * 新会话尚无 sessionId 时暂存本地，会话创建后自动补写。
 * </p>
 * <p>
 * 两个胶囊：模型（弹层：provider 分组 + 默认标记 + 管理入口）与思考（弹层：档位，
 * 仅对目录中声明思考控制的 provider 显示；强度档位按 chatThinkingEffort 区分）。
 * 写入失败会提示并回滚选中态，回调只在写库成功后触发——
 * 绝不允许"界面显示已切换、实际从未生效"的自锁状态。
 * </p>
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BrainCircuit, Check, ChevronDown, ChevronRight, Loader2, Settings2 } from 'lucide-react';
import { aiCatalogService, conversationModelApi, type AiProviderItem } from '../services/ai.service';
import { useToast } from './ui/ToastManager';
import { THEME } from '../styles/theme';

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
   * 偏好解析完成回调（会话偏好读取完成 / 新会话暂存选择 / 用户变更写库成功后均触发）。
   * 供调用方推导能力门控（如视觉能力决定图片输入入口开关）与随请求携带的模型/思考覆盖。
   */
  onPreferenceResolved?: (provider: string | null, model: string | null, thinking: string | null) => void;
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

/** 思考档位选项：二元（开/关）与强度（低/中/高）两套，按 provider 能力选用 */
const THINKING_BINARY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '跟随默认' },
  { value: 'off', label: '关闭思考' },
  { value: 'on', label: '开启思考' },
];
const THINKING_EFFORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '跟随默认' },
  { value: 'off', label: '关闭思考' },
  { value: 'low', label: '低强度' },
  { value: 'medium', label: '中强度' },
  { value: 'high', label: '高强度' },
];

/** 思考档位 → 胶囊短文案（跟随 / 关 / 开 / 低 / 中 / 高） */
const thinkingShortLabel = (level: string) => {
  switch (level) {
    case 'off': return '关';
    case 'on': return '开';
    case 'low': return '低';
    case 'medium': return '中';
    case 'high': return '高';
    default: return '自动';
  }
};

const PANEL_WIDTH = 288;
const PANEL_MAX_H = 360;
const THINKING_PANEL_WIDTH = 180;
const PANEL_GAP = 6;

interface PanelPos {
  left: number;
  top?: number;
  bottom?: number;
}

/**
 * 锚定弹层定位：跟随触发元素，下方空间不足时向上展开；横向越界时收进视口。
 * 返回 [panelRef, pos]；open=false 时 pos 为 null 不渲染。
 */
const useAnchoredPanel = (
  rootRef: React.RefObject<HTMLElement | null>, open: boolean, width: number, maxHeight: number,
) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - PANEL_GAP;
      const openUp = spaceBelow < maxHeight && r.top - PANEL_GAP > spaceBelow;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        ...(openUp
          ? { bottom: window.innerHeight - r.top + PANEL_GAP }
          : { top: r.bottom + PANEL_GAP }),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, width, maxHeight, rootRef]);
  return { panelRef, pos };
};

/** 外部点击 / Escape 关闭（浮层在 portal 中，需一并判定） */
const useDismiss = (
  rootRef: React.RefObject<HTMLElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  open: boolean, onClose: () => void,
) => {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, rootRef, panelRef]);
};

const ModelPreferenceSelect: React.FC<ModelPreferenceSelectProps> = ({
  servicePrefix, sessionId, disabled, onApplied, onPreferenceResolved,
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [providers, setProviders] = useState<AiProviderItem[] | null>(null);
  /** 当前选中值（编码形态；'' = 平台默认） */
  const [selection, setSelection] = useState('');
  /** 当前思考档位（'' = 跟随默认；off/on/low/medium/high） */
  const [thinking, setThinking] = useState('');
  /** 新会话暂存的选择（undefined = 无暂存） */
  const [pending, setPending] = useState<{ provider: string | null; model: string | null; thinking: string | null } | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  /** 防止会话切换期间的旧请求覆盖新会话偏好 */
  const loadSeq = useRef(0);
  /** 最后一次写库成功（或会话加载）确认的偏好，写入失败时回滚到它 */
  const confirmedRef = useRef<{ selection: string; thinking: string }>({ selection: '', thinking: '' });
  const modelRootRef = useRef<HTMLDivElement>(null);
  const thinkingRootRef = useRef<HTMLDivElement>(null);
  const modelPanel = useAnchoredPanel(modelRootRef, modelOpen, PANEL_WIDTH, PANEL_MAX_H);
  const thinkingPanel = useAnchoredPanel(thinkingRootRef, thinkingOpen, THINKING_PANEL_WIDTH, 240);
  useDismiss(modelRootRef, modelPanel.panelRef, modelOpen, () => setModelOpen(false));
  useDismiss(thinkingRootRef, thinkingPanel.panelRef, thinkingOpen, () => setThinkingOpen(false));

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
        const nextSelection = pref.llmProvider ? encode(pref.llmProvider, pref.llmModel) : '';
        const nextThinking = pref.thinkingPref ?? '';
        setSelection(nextSelection);
        setThinking(nextThinking);
        confirmedRef.current = { selection: nextSelection, thinking: nextThinking };
        onPreferenceResolved?.(pref.llmProvider ?? null, pref.llmModel ?? null, pref.thinkingPref ?? null);
      })
      .catch(() => { /* 偏好读取失败保持当前选中，不阻断 */ });
  }, [servicePrefix, sessionId]);

  // 新会话创建后补写暂存选择
  useEffect(() => {
    if (!sessionId || pending === undefined) return;
    const { provider, model, thinking: pendingThinking } = pending;
    setPending(undefined);
    void apply(provider, model, pendingThinking);
  }, [sessionId, pending]);

  /**
   * 写入会话偏好（全量提交）。写库成功才更新确认态并触发回调；
   * 失败提示并回滚选中态——回调不触发，调用方随请求携带的覆盖保持旧值，前后端一致。
   */
  const apply = useCallback(async (provider: string | null, model: string | null, thinkingLevel: string | null): Promise<boolean> => {
    if (!sessionId) return false;
    setSaving(true);
    try {
      const ok = await conversationModelApi.updatePreference(servicePrefix, sessionId, provider, model, thinkingLevel);
      if (!ok) throw new Error('save rejected');
      confirmedRef.current = {
        selection: provider ? encode(provider, model) : '',
        thinking: thinkingLevel ?? '',
      };
      onApplied?.(provider);
      onPreferenceResolved?.(provider, model, thinkingLevel ?? null);
      return true;
    } catch {
      toast.showError('模型偏好保存失败，请重试');
      const confirmed = confirmedRef.current;
      setSelection(confirmed.selection);
      setThinking(confirmed.thinking);
      return false;
    } finally {
      setSaving(false);
    }
  }, [servicePrefix, sessionId, onApplied, onPreferenceResolved, toast]);

  const handlePick = (value: string) => {
    setSelection(value);
    setModelOpen(false);
    const { provider, model } = decode(value);
    if (sessionId) {
      void apply(provider, model, thinking || null);
    } else {
      setPending({ provider, model, thinking: thinking || null });
      // 新会话暂存选择即时生效于能力门控（如图片输入入口开关）
      onPreferenceResolved?.(provider, model, thinking || null);
    }
  };

  const handleThinkingPick = (value: string) => {
    setThinking(value);
    setThinkingOpen(false);
    const { provider, model } = decode(selection);
    if (sessionId) {
      void apply(provider, model, value || null);
    } else {
      setPending({ provider, model, thinking: value || null });
      onPreferenceResolved?.(provider, model, value || null);
    }
  };

  /** 触发按钮文案：平台默认 / provider · 模型 */
  const triggerLabel = useMemo(() => {
    if (!selection) return '平台默认';
    const { provider, model } = decode(selection);
    if (!provider) return '平台默认';
    const item = (providers ?? []).find(p => p.name === provider);
    return `${provider} · ${model ?? item?.chatModel ?? '默认模型'}`;
  }, [selection, providers]);

  /** 已失效的偏好（模型/提供商被移除）兜底项，避免选择器空白 */
  const stale = useMemo(() => {
    if (!selection) return null;
    const { provider, model } = decode(selection);
    const item = (providers ?? []).find(p => p.name === provider);
    const known = item && ((item.chatModels ?? []).includes(model ?? '') || (model == null));
    return known ? null : { provider, model };
  }, [selection, providers]);

  /** 当前选中 provider 的思考能力（目录未声明思考控制协议 = 不支持页面控制，不显示思考胶囊） */
  const thinkingCapability = useMemo(() => {
    const { provider } = decode(selection);
    const item = provider
      ? (providers ?? []).find(p => p.name === provider)
      : (providers ?? []).find(p => p.defaultProvider) ?? null;
    if (!item?.chatThinking) return null;
    // 强制思考判定：当前生效模型（显式选择或 provider 默认）命中强制清单时禁用「关闭」档
    const { model } = decode(selection);
    const effectiveModel = model ?? item.chatModel ?? '';
    const forced = (item.chatForcedModels ?? []).includes(effectiveModel);
    return { effort: !!item.chatThinkingEffort, forced };
  }, [selection, providers]);

  /** 思考胶囊图标色：关 = 灰、开 = 紫、跟随 = 中性 */
  const thinkingIconTone = thinking === 'off'
    ? 'text-neutral-400'
    : thinking ? 'text-violet-500' : 'text-neutral-500';

  const renderRow = (value: string, label: string, opts?: { desc?: string; isDefault?: boolean }) => {
    const active = selection === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => handlePick(value)}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors ${
          active ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {opts?.desc && (
            <span className={`block truncate text-[11px] ${active ? 'text-white/60' : 'text-neutral-400'}`}>{opts.desc}</span>
          )}
        </span>
        {opts?.isDefault && (
          <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black ${
            active ? 'bg-white/20 text-white/80' : 'bg-neutral-100 text-neutral-400'
          }`}>
            默认
          </span>
        )}
        {active && <Check size={13} className="flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {/* 模型胶囊 */}
      <div ref={modelRootRef} className="relative">
        <button
          type="button"
          disabled={disabled || saving || providers === null}
          onClick={() => { setModelOpen(v => !v); setThinkingOpen(false); }}
          title={providers === null ? '模型目录加载中…' : '选择本会话使用的模型'}
          className="flex min-w-[140px] items-center justify-between gap-2 rounded-lg border border-neutral-200/70 bg-white/88 px-2.5 py-1.5 text-left text-[12px] font-medium transition-all hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          {saving
            ? <Loader2 size={13} className="flex-shrink-0 animate-spin text-neutral-400" />
            : <ChevronDown size={14} className={`flex-shrink-0 text-neutral-400 transition-transform ${modelOpen ? 'rotate-180' : ''}`} />}
        </button>

        {modelOpen && modelPanel.pos && createPortal(
          <div
            ref={modelPanel.panelRef}
            style={{ position: 'fixed', left: modelPanel.pos.left, width: PANEL_WIDTH, top: modelPanel.pos.top, bottom: modelPanel.pos.bottom }}
            className={`${THEME.dropdown} z-[100] flex max-h-[360px] flex-col p-1.5`}
          >
            <div className={`min-h-0 flex-1 overflow-y-auto ${THEME.scrollbar}`}>
              {renderRow('', '平台默认', { desc: '跟随注册设置的默认提供商' })}
              {stale && renderRow(selection, stale.model ?? stale.provider ?? selection, { desc: '已不在目录中' })}

              {(providers ?? []).map(p => {
                const models = (p.chatModels ?? []).filter(m => !!m);
                return (
                  <div key={p.name}>
                    <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      {p.name} · {models.length > 0 ? `${models.length} 个模型` : '默认模型'}
                    </div>
                    {models.length === 0
                      ? renderRow(encode(p.name), p.chatModel ?? '默认模型', { desc: '提供商默认' })
                      : models.map(m => renderRow(encode(p.name, m), m, { isDefault: m === p.chatModel }))}
                  </div>
                );
              })}
              {providers !== null && providers.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-neutral-400">暂无可用提供商</div>
              )}
            </div>

            <div className="mt-1 flex-shrink-0 border-t border-neutral-100 pt-1">
              <button
                type="button"
                onClick={() => { setModelOpen(false); navigate('/system/llm-providers'); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-bold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black"
              >
                <Settings2 size={13} />
                <span className="flex-1">管理模型提供商</span>
                <ChevronRight size={12} className="text-neutral-300" />
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* 思考胶囊（目录声明思考控制的 provider 才显示） */}
      {thinkingCapability && (
        <div ref={thinkingRootRef} className="relative">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => { setThinkingOpen(v => !v); setModelOpen(false); }}
            title={`思考模式 · ${thinkingShortLabel(thinking)}（当前档位）`}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              thinking === 'off'
                ? 'border-neutral-200/70 bg-white/88 text-neutral-400 hover:border-neutral-300'
                : 'border-violet-200 bg-violet-50/60 text-violet-700 hover:border-violet-300'
            }`}
          >
            <BrainCircuit size={13} className={thinkingIconTone} />
            思考 {thinkingShortLabel(thinking)}
            <ChevronDown size={12} className={`text-neutral-400 transition-transform ${thinkingOpen ? 'rotate-180' : ''}`} />
          </button>

          {thinkingOpen && thinkingPanel.pos && createPortal(
            <div
              ref={thinkingPanel.panelRef}
              style={{ position: 'fixed', left: thinkingPanel.pos.left, width: THINKING_PANEL_WIDTH, top: thinkingPanel.pos.top, bottom: thinkingPanel.pos.bottom }}
              className={`${THEME.dropdown} z-[100] p-1.5`}
            >
              {(thinkingCapability.effort ? THINKING_EFFORT_OPTIONS : THINKING_BINARY_OPTIONS).map(opt => {
                const active = thinking === opt.value;
                // 强制思考模型（如 GLM-5.3 系列）不允许关闭，只能调强度
                const disabled = thinkingCapability.forced && opt.value === 'off';
                return (
                  <button
                    key={opt.value || 'auto'}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleThinkingPick(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                      active ? 'bg-black text-white'
                        : disabled ? 'cursor-not-allowed text-neutral-300'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {disabled
                      ? <span className="flex-shrink-0 text-[9px] font-bold text-neutral-300">模型强制</span>
                      : active && <Check size={12} className="flex-shrink-0" />}
                  </button>
                );
              })}
              {thinkingCapability.forced && (
                <p className="px-3 pb-1.5 pt-1 text-[10px] leading-relaxed text-neutral-400">
                  该模型不支持关闭思考，可调低强度
                </p>
              )}
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
};

export default ModelPreferenceSelect;
