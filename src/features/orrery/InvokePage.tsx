import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  invokeButlerStream,
  subscribeTaskEvents,
  butlerService,
  conversationService,
  taskService,
  AgentEntry,
  TaskArtifact,
  ButlerSession,
} from '../../shared/services/orrery.service';
import { GATEWAY_BASE } from '../../shared/services/request';
import config from '../../shared/config';
import {
  Send, Bot, User, Loader2, ChevronDown, ChevronRight, ChevronUp, Cpu, Trash2,
  Brain, Wrench, CheckCircle2, Sparkles, AlertCircle, Clock, Check, XCircle,
  Download, FileText, ExternalLink, MessageSquarePlus, MessageSquare, MoreHorizontal,
  Edit3, ListChecks, Square, Lightbulb, Zap, GitBranch, X, Maximize2, Minimize2,
  ImagePlus,
} from 'lucide-react';
import { THEME } from '../../shared/styles/theme';
import Select from '../../shared/components/ui/Select';
import ModelPreferenceSelect from '../../shared/components/ModelPreferenceSelect';
import { aiCatalogService, type AiCatalogVO } from '../../shared/services/ai.service';
import { fileToImageDataUrl, MAX_IMAGES } from '../../shared/utils/image';
import TaskRunGraph from './TaskRunGraph';
import type { PlanStep } from '../../shared/services/orrery.service';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConfirm } from '../../shared/hooks/useConfirm';
import { useToast } from '../../shared/components/ui/ToastManager';

// ─── 协议 v1 事件的视图模型 ─────────────────────────────────────

type EventKind =
  | 'stage' | 'progress' | 'milestone' | 'tool_start' | 'tool_done'
  | 'llm' | 'trace' | 'step' | 'error';

interface TimelineItem {
  kind: EventKind;
  label: string;
  detail?: string;
  /** 调试频道（引擎轮次 / LLM 汇总 / 系统追踪）：默认折叠，不进用户时间线 */
  debug?: boolean;
}

/** 流式思考块（协议 BlockType=REASONING） */
interface ReasoningBlock {
  id: string;
  label?: string | null;
  text: string;
}

/** 流式正文块（按推理轮相位区分：commentary=过程叙述 / final=正式答复） */
interface TextBlock {
  step: number;
  phase: 'commentary' | 'final';
  text: string;
}

/** 运行过程快照（v1，随助手消息落库；历史回看据此重建执行过程视图） */
interface ProcessSnapshot {
  v?: number;
  events?: TimelineItem[];
  reasonings?: ReasoningBlock[];
  textBlocks?: TextBlock[];
  artifacts?: TaskArtifact[];
  meta?: { model?: string; totalTokens?: number; durationMs?: number };
}

/** 解析过程快照 JSON（脏数据兜底为空）。 */
const parseBlocks = (raw?: string | null): ProcessSnapshot | undefined => {
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj as ProcessSnapshot : undefined;
  } catch { return undefined; }
};

interface ApprovalState {
  approvalId: string;
  summary: string;
  state: 'pending' | 'processing' | 'approved' | 'rejected' | 'error';
  errorMsg?: string;
  /** 确认语义来源：plan=计划确认（PLAN_CONFIRMATION 事件合成）；空=工具审批 */
  kind?: string;
}

/** 一次调用的活体视图（协议 v1 事件聚合） */
interface LiveAssistant {
  taskId?: string;
  events: TimelineItem[];
  reasonings: ReasoningBlock[];
  content: string;
  /** 正文分块（相位分流：commentary 进过程叙述，final 作正式答复；content 为全量拼接的兜底） */
  textBlocks?: TextBlock[];
  artifacts: TaskArtifact[];
  approval?: ApprovalState;
  clarification?: { question: string; suggestions: string[] };
  /** Final.stop（INPUT_REQUIRED 表示挂起等待确认） */
  stop?: string;
  terminal?: 'final' | 'failed' | 'cancelled';
  errorMsg?: string;
  /** 续跑轮询中（confirm 后等待异步终态） */
  resuming?: boolean;
  meta?: { model?: string; totalTokens?: number; durationMs?: number };
  /** 执行计划（butler.plan 里程碑建立，节点 Progress 事件增量更新状态） */
  plan?: PlanStep[];
}

type Msg =
  | { id: string; role: 'user'; content: string; /** 图片附件（data URI / URL，多模态输入） */ images?: string[] }
  | { id: string; role: 'assistant'; source: 'history'; content: string; reasoning?: string; model?: string; tokens?: number; createTime?: number; plan?: PlanStep[]; artifacts?: TaskArtifact[]; blocks?: ProcessSnapshot }
  | { id: string; role: 'assistant'; source: 'live'; live: LiveAssistant };

/** 解析历史消息的附件列（JSON 数组字符串 → 图片地址列表；脏数据兜底为空）。 */
const parseAttachments = (raw?: string | null): string[] | undefined => {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr.filter(x => typeof x === 'string') : undefined;
  } catch { return undefined; }
};

type Cfg = { text: string; Icon: React.ComponentType<{ size?: number; className?: string }> };
const EV: Record<EventKind, Cfg> = {
  stage:      { text: 'text-purple-600', Icon: Sparkles },
  progress:   { text: 'text-neutral-500', Icon: Zap },
  milestone:  { text: 'text-amber-600',   Icon: ListChecks },
  tool_start: { text: 'text-blue-600',    Icon: Wrench },
  tool_done:  { text: 'text-emerald-600', Icon: Check },
  llm:        { text: 'text-neutral-500', Icon: Cpu },
  trace:      { text: 'text-neutral-400', Icon: Clock },
  step:       { text: 'text-neutral-500', Icon: Zap },
  error:      { text: 'text-red-600',     Icon: AlertCircle },
};

/** 审批等待过程提示的匹配模式（历史脏数据识别：任务待确认时由 live 审批卡取代） */
const APPROVAL_WAITING_TIP = /人工审批|人工确认|等待确认|审批通过后/;

const fmtJson = (v: any): string => {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } })();
  return s;
};

// ─── 展示子组件 ────────────────────────────────────────────────

const ToolDetail: React.FC<{ detail: string }> = ({ detail }) => {
  const [open, setOpen] = useState(false);
  let fmt = detail;
  try { fmt = JSON.stringify(JSON.parse(detail), null, 2); } catch {}
  const long = fmt.length > 200 || fmt.split('\n').length > 5;
  return (
    <div className="mt-1.5">
      <div className={`relative bg-[#f8f9fa] border border-neutral-200/60 rounded-xl px-3 py-2.5 font-mono text-[11px] text-neutral-600 transition-all duration-300 ${long && !open ? 'max-h-24 overflow-hidden' : 'overflow-x-auto'}`}>
        <pre className="whitespace-pre-wrap break-all">{fmt}</pre>
        {long && !open && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#f8f9fa] to-transparent pointer-events-none" />
        )}
      </div>
      {long && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-1.5 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 flex items-center gap-1 transition-colors"
        >
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {open ? '收起详情' : '展开详情'}
        </button>
      )}
    </div>
  );
};

const TimelineEvent: React.FC<{ ev: TimelineItem }> = ({ ev }) => {
  const c = EV[ev.kind] || EV.progress;
  const Icon = c.Icon;
  return (
    <div className="relative">
      <div className="absolute -left-6 top-0 w-6 h-5 bg-white flex items-center justify-center">
        <Icon size={13} className={c.text} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-neutral-500 leading-snug">{ev.label}</p>
        {ev.detail && <ToolDetail detail={ev.detail} />}
      </div>
    </div>
  );
};

/** 过程时间线：用户频道事件直接展示；调试频道（引擎轮次/LLM/追踪）折叠进「调试信息」。
 *  文字统一 12px 中性灰，与 14px 正文形成层级区分。 */
const Timeline: React.FC<{ events: TimelineItem[]; streaming: boolean }> = ({ events, streaming }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (streaming) setIsOpen(true);
  }, [streaming]);

  const userEvents = events.filter(e => !e.debug);
  const debugEvents = events.filter(e => e.debug);

  if (events.length === 0 && !streaming) return null;
  const summary = streaming && userEvents.length === 0
    ? '管家正在处理...'
    : streaming ? '引擎执行中...'
    : `执行了 ${userEvents.length} 个步骤`;

  return (
    <div className="w-full mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-neutral-400 hover:text-neutral-600 transition-colors py-1 group"
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center group-hover:bg-neutral-100 transition-colors">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <span className="text-[12.5px]">{summary}</span>
        {streaming && <Loader2 size={12} className="animate-spin ml-1 text-neutral-400" />}
      </button>

      {isOpen && (
        <div className="mt-2 relative pl-6">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-neutral-100" />
          <div className="space-y-3 py-1">
            {userEvents.map((ev, i) => <TimelineEvent key={i} ev={ev} />)}
            {streaming && (
              <div className="relative">
                <div className="absolute -left-6 top-0 w-6 h-5 bg-white flex items-center justify-center">
                  <Loader2 size={13} className="text-neutral-400 animate-spin" />
                </div>
                <p className="text-[12px] text-neutral-400 leading-snug">思考中...</p>
              </div>
            )}
          </div>

          {debugEvents.length > 0 && (
            <div className="relative mt-1">
              <div className="absolute -left-6 top-0 w-6 h-5 bg-white flex items-center justify-center">
                <Cpu size={12} className="text-neutral-300" />
              </div>
              <button
                onClick={() => setDebugOpen(!debugOpen)}
                className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                调试信息（{debugEvents.length}）
                {debugOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {debugOpen && (
                <div className="mt-2 ml-1 space-y-1.5 border-l border-dashed border-neutral-200 pl-3">
                  {debugEvents.map((ev, i) => (
                    <div key={i}>
                      <p className="text-[11px] font-mono text-neutral-400 leading-snug">{ev.label}</p>
                      {ev.detail && <ToolDetail detail={ev.detail} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ReasoningSection: React.FC<{ blocks: ReasoningBlock[]; streaming: boolean }> = ({ blocks, streaming }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  if (blocks.length === 0) return null;
  const text = blocks.map(b => (b.label ? `【${b.label}】\n` : '') + b.text).join('\n\n');
  const last = blocks[blocks.length - 1];

  return (
    <div className="w-full mb-3 rounded-2xl border border-neutral-200/70 bg-neutral-50/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-100/60 transition-colors"
      >
        <Brain size={14} className="text-violet-500 flex-shrink-0" />
        <span className="text-[12px] font-bold text-neutral-600 flex-1">
          {last.label || '思考过程'}
          <span className="ml-2 font-mono text-[10px] text-neutral-400">
            {text.length} 字{streaming ? ' · 生成中' : ''}
          </span>
        </span>
        {streaming
          ? <Loader2 size={12} className="text-neutral-400 animate-spin" />
          : open ? <ChevronDown size={13} className="text-neutral-400" /> : <ChevronRight size={13} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-64 overflow-y-auto">
          <pre className="text-[12px] leading-relaxed text-neutral-500 whitespace-pre-wrap">{text}</pre>
        </div>
      )}
    </div>
  );
};

/** 过程叙述（commentary 相位正文块）：流式期展开、终态默认折叠——与正式答复视觉分层。 */
const ProcessNarrative: React.FC<{ blocks: TextBlock[]; streaming: boolean }> = ({ blocks, streaming }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  if (blocks.length === 0) return null;
  const text = blocks.map(b => b.text).join('\n');

  return (
    <div className="w-full mb-3 rounded-2xl border border-neutral-200/60 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors"
      >
        <FileText size={13} className="text-neutral-400 flex-shrink-0" />
        <span className="text-[12px] font-bold text-neutral-500 flex-1">
          过程叙述
          <span className="ml-2 font-mono text-[10px] font-normal text-neutral-400">
            {text.length} 字{streaming ? ' · 生成中' : ''}
          </span>
        </span>
        {streaming
          ? <Loader2 size={12} className="text-neutral-400 animate-spin" />
          : open ? <ChevronDown size={13} className="text-neutral-400" /> : <ChevronRight size={13} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-72 overflow-y-auto border-t border-neutral-100">
          <MdContent text={text} />
        </div>
      )}
    </div>
  );
};

/** 追加正文增量：全量 content 与分块 textBlocks 同步维护（分块驱动相位分流渲染）。 */
const appendTextDelta = (live: LiveAssistant, stepIndex: number, delta: string): LiveAssistant => {
  const blocks = [...(live.textBlocks ?? [])];
  const last = blocks[blocks.length - 1];
  if (last && last.step === stepIndex) {
    blocks[blocks.length - 1] = { ...last, text: last.text + delta };
  } else {
    blocks.push({ step: stepIndex, phase: 'commentary', text: delta });
  }
  return { ...live, content: live.content + delta, textBlocks: blocks };
};

/** 轮次相位结算：StepFinished(terminalPhase) 回写分块相位。 */
const markBlockPhase = (live: LiveAssistant, stepIndex: number, phase: string): LiveAssistant => {
  if (!live.textBlocks) return live;
  const blocks = live.textBlocks.map(b =>
    b.step === stepIndex ? { ...b, phase: phase === 'final' ? 'final' as const : 'commentary' as const } : b);
  return { ...live, textBlocks: blocks };
};

/**
 * 终态相位兜底：无任何 final 块时把最后一个正文块抬为 final——
 * 对应引擎"无工具调用轮即终轮"语义（含 L0 直答无 step 事件、终态整段补发两种形态）。
 */
const settleFinalPhase = (live: LiveAssistant): LiveAssistant => {
  const blocks = live.textBlocks;
  if (!blocks || blocks.length === 0 || blocks.some(b => b.phase === 'final')) return live;
  const next = [...blocks];
  next[next.length - 1] = { ...next[next.length - 1], phase: 'final' };
  return { ...live, textBlocks: next };
};

/** 相位分流：commentary 进过程叙述，final 作正式答复（无分块信息时 content 全量兜底为答复）。 */
const splitPhases = (blocks: TextBlock[] | undefined, content: string): { narrative: TextBlock[]; answer: string } => {
  if (!blocks || blocks.length === 0) {
    return { narrative: [], answer: content };
  }
  const narrative = blocks.filter(b => b.phase === 'commentary');
  const answer = blocks.filter(b => b.phase === 'final').map(b => b.text).join('\n');
  return { narrative, answer: answer || content };
};

const buildDownloadUrl = (partUrl: string): string => {
  if (partUrl.startsWith('http://') || partUrl.startsWith('https://')) return partUrl;
  const base = GATEWAY_BASE.endsWith('/') ? GATEWAY_BASE.slice(0, -1) : GATEWAY_BASE;
  const svc = config.SERVICE_BUTLER;
  const path = partUrl.startsWith('/') ? partUrl : `/${partUrl}`;
  return `${base}/${svc}${path}`;
};

const ArtifactCard: React.FC<{ artifact: TaskArtifact; onPreview: () => void }> = ({ artifact, onPreview }) => {
  const filePart = artifact.parts.find(p => p.url);
  const textPart = artifact.parts.find(p => p.text);

  const handleDownload = () => {
    if (!filePart?.url) return;
    const url = buildDownloadUrl(filePart.url);
    const token = localStorage.getItem('token');
    fetch(url, { headers: { 'Authorization': token || '' } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filePart.filename || artifact.name || 'download';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => console.error('Download failed:', e));
  };

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
          <FileText size={16} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-800 truncate">{artifact.name}</p>
          {artifact.description && <p className="text-[11px] text-neutral-400 truncate">{artifact.description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(textPart?.text || filePart?.url) && (
            <button
              onClick={onPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-neutral-200 text-neutral-600 text-xs font-bold hover:border-violet-300 hover:text-violet-600 transition-all"
              title="预览内容"
            >
              <ExternalLink size={12} />
              预览
            </button>
          )}
          {filePart?.url && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-all shadow-sm"
            >
              <Download size={12} />
              下载
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MdContent: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-[14px] leading-[1.7] text-neutral-800">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        h1: ({ children }) => <h1 className="text-lg font-black mt-5 mb-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-black mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[15px] font-bold mt-3 mb-2">{children}</h3>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-4 rounded-xl border border-neutral-200 shadow-sm">
            <table className="w-full text-left text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-neutral-50">{children}</thead>,
        th: ({ children }) => <th className="px-4 py-3 font-bold border-b border-neutral-200 text-neutral-700">{children}</th>,
        td: ({ children }) => <td className="px-4 py-3 border-b border-neutral-100 last:border-0 text-neutral-700">{children}</td>,
        code: ({ className, children, ...props }: any) => {
          if (String(children).includes('\n')) {
            return <pre className="bg-[#1e1e1e] text-neutral-100 rounded-xl px-4 py-3 my-3 text-[12px] font-mono overflow-x-auto leading-relaxed shadow-sm"><code>{children}</code></pre>;
          }
          return <code className="bg-neutral-100 text-pink-600 px-1.5 py-0.5 rounded-md font-mono text-[0.85em]" {...props}>{children}</code>;
        },
        blockquote: ({ children }) => <blockquote className="border-l-4 border-neutral-200 pl-4 py-0.5 text-neutral-500 my-3">{children}</blockquote>,
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
);

/** 产物预览类型分流（mediaType 优先，文件名后缀兜底） */
const previewKindOf = (mediaType?: string | null, filename?: string | null):
  'markdown' | 'text' | 'image' | 'pdf' | 'binary' => {
  const mt = (mediaType || '').toLowerCase();
  const fn = (filename || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt === 'application/pdf' || fn.endsWith('.pdf')) return 'pdf';
  if (mt === 'text/markdown' || fn.endsWith('.md')) return 'markdown';
  if (mt.startsWith('text/') || mt.includes('json') || mt.includes('xml') || mt.includes('javascript')
      || /\.(txt|csv|json|xml|html?|py|java|js|ts|tsx|yml|yaml|log|sql)$/.test(fn)) return 'text';
  return 'binary';
};

/** 产物预览抽屉（与任务规划抽屉同构）：多产物 Tab 切换，markdown 渲染 / 文本等宽 / 图片直显 / PDF 内嵌 */
const ArtifactPreviewDrawer: React.FC<{
  artifacts: TaskArtifact[];
  index: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}> = ({ artifacts, index, onSelect, onClose }) => {
  const artifact = artifacts[index];
  const textPart = artifact?.parts.find(p => p.text);
  const filePart = artifact?.parts.find(p => p.url);
  const kind = previewKindOf(textPart?.mediaType ?? filePart?.mediaType, filePart?.filename ?? artifact?.name);
  const [remote, setRemote] = useState<{ text?: string; objectUrl?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // 无 text part 时按类型拉取远端内容：文本类读全文，图片/PDF 用 blob URL 内嵌
  useEffect(() => {
    if (!artifact || textPart || !filePart?.url || kind === 'binary') {
      setRemote(null);
      return;
    }
    let objectUrl: string | null = null;
    let stale = false;
    setLoading(true);
    setRemote(null);
    fetch(buildDownloadUrl(filePart.url), { headers: { Authorization: localStorage.getItem('token') || '' } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(async blob => {
        if (stale) return;
        if (kind === 'image' || kind === 'pdf') {
          objectUrl = URL.createObjectURL(blob);
          setRemote({ objectUrl });
        } else {
          setRemote({ text: await blob.text() });
        }
      })
      .catch(e => !stale && setRemote({ error: e.message }))
      .finally(() => !stale && setLoading(false));
    return () => { stale = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.artifactId]);

  if (!artifact) return null;
  const text = textPart?.text ?? remote?.text;
  const objectUrl = remote?.objectUrl;

  const handleDownload = () => {
    if (!filePart?.url) return;
    const token = localStorage.getItem('token');
    fetch(buildDownloadUrl(filePart.url), { headers: { 'Authorization': token || '' } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filePart.filename || artifact.name || 'download';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => showToast('error', '下载失败：' + e.message));
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full w-[680px] max-w-[94vw] bg-white shadow-2xl flex flex-col"
        style={{ animation: 'plan-drawer-in .22s ease-out' }}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-100 shrink-0">
          <FileText size={15} className="text-neutral-500 shrink-0" />
          <p className="text-sm font-black text-neutral-800 truncate">{artifact.name}</p>
          {artifact.description && (
            <span className="text-[11px] text-neutral-400 truncate">{artifact.description}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {text != null && (
              <button
                onClick={() => { void navigator.clipboard.writeText(text); showToast('success', '已复制全文'); }}
                className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 text-[11px] font-bold transition-colors"
              >
                复制全文
              </button>
            )}
            {filePart?.url && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 transition-colors"
              >
                <Download size={12} /> 下载
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {artifacts.length > 1 && (
          <div className="flex gap-1.5 px-5 py-2.5 border-b border-neutral-100 overflow-x-auto shrink-0">
            {artifacts.map((a, i) => (
              <button
                key={a.artifactId}
                onClick={() => onSelect(i)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  i === index ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm py-16">
              <Loader2 size={14} className="animate-spin" /> 加载预览...
            </div>
          )}
          {!loading && remote?.error && (
            <p className="text-[13px] text-red-500 py-8 text-center">预览加载失败：{remote.error}</p>
          )}
          {!loading && !remote?.error && (
            <>
              {kind === 'markdown' && text != null && <MdContent text={text} />}
              {kind === 'text' && text != null && (
                <pre className="text-[12px] leading-relaxed font-mono text-neutral-700 whitespace-pre-wrap break-all bg-neutral-50 rounded-xl p-4">{text}</pre>
              )}
              {kind === 'image' && objectUrl && (
                <img src={objectUrl} alt={artifact.name} className="max-w-full rounded-xl border border-neutral-100" />
              )}
              {kind === 'pdf' && objectUrl && (
                <iframe src={objectUrl} title={artifact.name} className="w-full h-full min-h-[60vh] rounded-xl border border-neutral-100" />
              )}
              {(kind === 'binary' || (text == null && !objectUrl)) && (
                <div className="flex flex-col items-center gap-3 py-16 text-neutral-400">
                  <FileText size={32} strokeWidth={1.5} />
                  <p className="text-[12px]">该文件类型暂不支持内嵌预览{filePart?.url ? '，请下载查看' : ''}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** 审批 / 等待确认卡片：仅在待决时显示；点击后卡片消失，进度转入思维链时间线 */
const WaitingCard: React.FC<{
  live: LiveAssistant;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ live, onConfirm, onCancel }) => {
  const approval = live.approval;
  if (!approval || approval.state !== 'pending') return null;
  // 工具审批摘要格式为"标题：命令全文"，拆开分行展示，命令用等宽块突出
  const splitAt = approval.summary.indexOf('：');
  const summaryHead = splitAt > 0 ? approval.summary.slice(0, splitAt) : approval.summary;
  const summaryDetail = splitAt > 0 ? approval.summary.slice(splitAt + 1) : null;
  const planSteps = approval.kind === 'plan' ? (live.plan ?? []) : [];
  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
      <div className="flex items-center gap-2 text-[13px] font-bold text-amber-700">
        <AlertCircle size={14} />
        {approval.kind === 'plan' ? '需要计划确认' : '需要人工审批'}
      </div>
      <div className="mt-1.5 text-[13px] text-neutral-700 leading-relaxed whitespace-pre-wrap">{summaryHead}</div>
      {summaryDetail && (
        <pre className="mt-2 px-3 py-2 rounded-xl bg-neutral-900 text-neutral-100 text-[12px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">{summaryDetail}</pre>
      )}
      {planSteps.length > 0 && (
        <ol className="mt-2 space-y-1 text-[12px] text-neutral-600 list-decimal list-inside">
          {planSteps.slice(0, 8).map(s => (
            <li key={s.stepId} className="leading-relaxed">
              {s.description ?? s.targetName ?? s.stepId}
              {s.confirmRequired && <span className="ml-1 text-amber-600 font-bold">（需确认）</span>}
            </li>
          ))}
          {planSteps.length > 8 && <li className="text-neutral-400">…共 {planSteps.length} 步</li>}
        </ol>
      )}
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={onConfirm}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm"
        >
          确认继续
        </button>
        <button
          onClick={onCancel}
          className="px-3.5 py-1.5 rounded-xl bg-white border border-neutral-200 hover:border-red-300 hover:text-red-600 text-neutral-600 text-xs font-bold transition-all"
        >
          取消任务
        </button>
      </div>
    </div>
  );
};

/** 任务规划入口按钮：聊天内嵌的紧凑进度条，点击打开右侧规划抽屉 */
const PlanLauncher: React.FC<{ steps: PlanStep[]; onOpen: () => void }> = ({ steps, onOpen }) => {
  const done = steps.filter(s => ['SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELED'].includes(s.status ?? '')).length;
  const failed = steps.filter(s => s.status === 'FAILED').length;
  const running = steps.some(s => s.status === 'RUNNING');
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <button
      onClick={onOpen}
      className="mb-2 flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:border-violet-300 hover:shadow-sm transition-all text-left"
    >
      <GitBranch size={13} className="text-neutral-400 shrink-0" />
      <span className="text-xs font-bold text-neutral-700 shrink-0">任务规划</span>
      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
        {done}/{steps.length}{failed > 0 ? ` · ${failed} 失败` : ''}
      </span>
      <span className="w-16 h-1 rounded-full bg-neutral-100 overflow-hidden shrink-0">
        <span
          className={`block h-full rounded-full transition-all duration-500 ${failed > 0 && done === steps.length ? 'bg-red-400' : 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      {running && <Loader2 size={11} className="animate-spin text-blue-500 shrink-0" />}
      <ChevronRight size={12} className="text-neutral-300 shrink-0" />
    </button>
  );
};

/** 任务规划右侧抽屉（Trae / Claude Desktop 式）：完整 DAG 图与步骤列表，支持放大到居中大屏 */
const PlanDrawer: React.FC<{ steps: PlanStep[]; onClose: () => void }> = ({ steps, onClose }) => {
  const [zoomed, setZoomed] = useState(false);
  const done = steps.filter(s => ['SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELED'].includes(s.status ?? '')).length;
  const failed = steps.filter(s => s.status === 'FAILED').length;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className={zoomed
          ? 'absolute inset-x-[4vw] top-[4vh] bottom-[4vh] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden'
          : 'absolute right-0 top-0 h-full w-[620px] max-w-[94vw] bg-white shadow-2xl flex flex-col'}
        style={{ animation: 'plan-drawer-in .22s ease-out' }}
      >
        <style>{`@keyframes plan-drawer-in { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-100 shrink-0">
          <GitBranch size={15} className="text-neutral-500" />
          <p className="text-sm font-black text-neutral-800">任务规划</p>
          <span className="text-[11px] font-mono text-neutral-400">
            {done}/{steps.length} 完成{failed > 0 ? ` · ${failed} 失败` : ''}
          </span>
          <button
            onClick={() => setZoomed(z => !z)}
            title={zoomed ? '还原为侧栏' : '放大查看'}
            className="ml-auto p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            {zoomed ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {/* 抽屉头部已承担标题/进度，图表内嵌折叠头隐藏，避免双层重复 */}
          <TaskRunGraph steps={steps} height={zoomed ? Math.round(window.innerHeight * 0.72) : 460} hideHeader />
        </div>
      </div>
    </div>
  );
};

const ClarificationCard: React.FC<{
  question: string;
  suggestions: string[];
  onPick: (text: string) => void;
}> = ({ question, suggestions, onPick }) => (
  <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3.5">
    <div className="flex items-center gap-2 text-[13px] font-bold text-sky-700">
      <Lightbulb size={14} />
      需要补充信息
    </div>
    <div className="mt-1.5 text-[13px] text-neutral-700 leading-relaxed whitespace-pre-wrap">{question}</div>
    {suggestions.length > 0 ? (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s)}
            className="px-3 py-1.5 rounded-xl bg-white border border-sky-200 hover:border-sky-400 hover:bg-sky-100/60 text-sky-700 text-xs font-medium transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-[11px] text-neutral-400">在下方输入框补充信息后继续对话</p>
    )}
  </div>
);

// ─── 会话侧栏 ─────────────────────────────────────────────────

const getSessionGroup = (ts?: number) => {
  if (!ts) return '更早';
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = diff / (1000 * 3600 * 24);
  if (days < 1 && now.getDate() === date.getDate()) return '今天';
  if (days < 2) return '昨天';
  if (days < 7) return '过去7天';
  return '更早';
};

interface SessionSidebarProps {
  sessions: ButlerSession[];
  currentSessionId: string | null;
  loading: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions, currentSessionId, loading, onNewChat, onSelect, onRename, onDelete,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const g: Record<string, ButlerSession[]> = { '今天': [], '昨天': [], '过去7天': [], '更早': [] };
    const sorted = [...sessions].sort((a, b) => (b.updateTime ?? b.createTime ?? 0) - (a.updateTime ?? a.createTime ?? 0));
    sorted.forEach(s => {
      const key = getSessionGroup(s.updateTime ?? s.createTime);
      (g[key] ?? g['更早']).push(s);
    });
    return g;
  }, [sessions]);

  const submitEdit = () => {
    if (editingId && editTitle.trim().length >= 2) onRename(editingId, editTitle.trim());
    setEditingId(null);
  };

  return (
    <div className="w-[248px] h-full flex flex-col flex-shrink-0 bg-[#F7F7F9] border-r border-neutral-100 pt-3 pb-3 px-2">
      <button
        onClick={onNewChat}
        className="flex items-center justify-center gap-2 bg-black text-white rounded-2xl py-2.5 mx-1.5 mb-4 shadow-sm hover:bg-neutral-800 transition-all active:scale-95"
      >
        <MessageSquarePlus size={16} />
        <span className="text-xs font-black">开启新会话</span>
      </button>

      <div className={`flex-1 overflow-y-auto ${THEME.scrollbar} px-1.5 space-y-4`}>
        {loading ? (
          <div className="text-center py-10 text-[11px] text-neutral-400 font-bold animate-pulse">加载会话...</div>
        ) : (
          <>
            {Object.entries(groups).map(([groupName, list]) => list.length > 0 && (
              <div key={groupName} className="space-y-1">
                <div className="px-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1.5">{groupName}</div>
                {list.map(s => {
                  const isActive = currentSessionId === s.id;
                  const isEditing = editingId === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => !isEditing && onSelect(s.id)}
                      className={`group relative flex items-center px-3 py-2.5 rounded-2xl cursor-pointer transition-all ${
                        isActive ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:bg-white/70 hover:text-black'
                      }`}
                    >
                      <MessageSquare size={15} className={`flex-shrink-0 mr-2.5 ${isActive ? 'text-black' : 'text-neutral-400'}`} />
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onBlur={submitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') submitEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 bg-transparent border-b border-black outline-none text-xs font-bold min-w-0"
                        />
                      ) : (
                        <div className="flex-1 min-w-0 pr-5">
                          <p className="text-xs font-bold truncate">{s.title || '未命名会话'}</p>
                          {s.messageCount != null && s.messageCount > 0 && (
                            <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{s.messageCount} 条消息</p>
                          )}
                        </div>
                      )}
                      {!isEditing && (
                        <div className={`absolute right-2 opacity-0 group-hover:opacity-100 ${menuOpenId === s.id ? 'opacity-100' : ''} transition-opacity`}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === s.id ? null : s.id);
                            }}
                            className="p-1 hover:bg-neutral-200 rounded-lg text-neutral-500"
                          >
                            <MoreHorizontal size={13} />
                          </button>
                          {menuOpenId === s.id && (
                            <div className={`absolute right-0 top-full mt-1 z-50 flex w-24 flex-col overflow-hidden py-1 ${THEME.dropdown}`}>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  setEditingId(s.id);
                                  setEditTitle(s.title || '');
                                }}
                                className="flex items-center px-3 py-1.5 text-[10px] font-bold text-neutral-600 hover:bg-neutral-50 hover:text-black text-left"
                              >
                                <Edit3 size={11} className="mr-2" /> 重命名
                              </button>
                              <div className="h-px bg-neutral-100 my-1" />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  onDelete(s.id);
                                }}
                                className="flex items-center px-3 py-1.5 text-[10px] font-bold text-red-500 hover:bg-red-50 text-left"
                              >
                                <Trash2 size={11} className="mr-2" /> 删除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-center py-16 opacity-40">
                <MessageSquare size={36} className="mx-auto mb-2 text-neutral-400" />
                <p className="text-xs font-black text-neutral-400">暂无历史会话</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── 主页面 ───────────────────────────────────────────────────

const InvokePage: React.FC = () => {
  const { confirm, ConfirmDialog } = useConfirm();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<ButlerSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [selectedAgent, setAgent] = useState('');
  /** 审批模式（ASK 每次询问 / AUTO 自动执行），localStorage 持久化 */
  const [approvalMode, setApprovalMode] = useState<string>(
    () => localStorage.getItem('butler.approvalMode') || 'ASK');
  const changeApprovalMode = useCallback((v: string) => {
    setApprovalMode(v);
    localStorage.setItem('butler.approvalMode', v);
  }, []);
  const [loadingHistory, setLoadingHistory] = useState(false);
  /** 规划抽屉当前查看的消息 ID（null=关闭；步骤数据实时取自该消息） */
  const [planDrawerFor, setPlanDrawerFor] = useState<string | null>(null);
  /** 产物预览抽屉（null=关闭；artifacts 为当前消息的产物全集，支持 Tab 切换） */
  const [preview, setPreview] = useState<{ artifacts: TaskArtifact[]; index: number } | null>(null);

  // ─── 多模态图片输入 ──────────────────────────────────────────
  /** 待发送图片（data URI 列表，预览缩略图直接以此为 src） */
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  /** 模型目录（视觉能力门控数据源） */
  const [catalog, setCatalog] = useState<AiCatalogVO | null>(null);
  /** 会话模型偏好解析出的 provider（null/'' = 平台默认） */
  const [resolvedProvider, setResolvedProvider] = useState<string | null>(null);
  /** 会话模型偏好解析出的模型覆盖（null = provider 默认模型） */
  const [resolvedModel, setResolvedModel] = useState<string | null>(null);
  /** 会话模型偏好解析出的思考档位（null = 跟随 provider 全局配置） */
  const [resolvedThinking, setResolvedThinking] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiCatalogService.catalog(config.SERVICE_BUTLER)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  /** 当前生效 provider 是否具备视觉能力（目录缺失时按不具备处理，能力门控 fail-closed） */
  const visionSupported = useMemo(() => {
    if (!catalog) return false;
    const target = (resolvedProvider && resolvedProvider !== '')
      ? resolvedProvider : catalog.defaultProvider;
    return catalog.providers?.some(p => p.name === target && p.chatVision === true) ?? false;
  }, [catalog, resolvedProvider]);

  /** 追加图片（统一走缩放 / 压缩管线；超上限与能力缺失分流提示） */
  const addImages = useCallback(async (files: Iterable<File>) => {
    if (!visionSupported) {
      showToast('warning', '当前模型不支持图片输入，请先切换具备视觉能力的模型');
      return;
    }
    const list = [...files];
    if (list.length === 0) return;
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      showToast('warning', `一条消息最多附带 ${MAX_IMAGES} 张图片`);
      return;
    }
    const accepted = list.slice(0, room);
    if (list.length > room) {
      showToast('warning', `一条消息最多附带 ${MAX_IMAGES} 张图片，超出的已忽略`);
    }
    for (const f of accepted) {
      try {
        const dataUrl = await fileToImageDataUrl(f);
        setPendingImages(prev => prev.length >= MAX_IMAGES ? prev : [...prev, dataUrl]);
      } catch (e: any) {
        showToast('error', e.message || '图片处理失败');
      }
    }
  }, [visionSupported, pendingImages.length, showToast]);

  /** 输入框粘贴事件：剪贴板中的图片直接进待发送列表（同时含文字时文字照常粘贴） */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      const hasText = items.some(i => i.kind === 'string' && i.type === 'text/plain');
      if (!hasText) e.preventDefault();
      void addImages(files);
    }
  }, [addImages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 任务事件订阅流的 abort 控制器（msgId → controller） */
  const taskStreamRef = useRef<Map<string, AbortController>>(new Map());
  /** pollTaskAndReload 前向引用（subscribeTaskStream 声明在前，断流回退经 ref 调用） */
  const pollTaskAndReloadRef = useRef<(msgId: string) => Promise<void>>(async () => {});
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await conversationService.listSessions());
    } catch { /* 网关未就绪等场景静默 */ } finally {
      setSessionsLoading(false);
    }
  }, []);

  /** 终态后的延迟补刷：智能命名走服务端异步 LLM 管线（秒级），即时刷新常只拿到占位标题 */
  const refreshSessionsLater = useCallback(() => {
    window.setTimeout(() => void refreshSessions(), 3500);
    window.setTimeout(() => void refreshSessions(), 9000);
  }, [refreshSessions]);

  const loadHistory = useCallback(async (id: string) => {
    setLoadingHistory(true);
    try {
      const [list, tasks] = await Promise.all([
        conversationService.listMessages(id),
        taskService.listBySession(id).catch(() => []),
      ]);
      // 执行步骤挂在任务账本而非消息体：按创建时间把带计划的 Task 对齐到其后第一条 assistant 答复
      const plannedTasks = [...tasks]
        .filter(t => t.steps && t.steps.length > 0)
        .sort((a, b) => Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? ''));
      let taskPtr = 0;
      setMessages(list
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          if (m.role === 'user') return { id: `h-${m.id}`, role: 'user' as const, content: m.content, images: parseAttachments(m.attachments) };
          let plan: PlanStep[] | undefined;
          let artifacts: TaskArtifact[] | undefined;
          const t = plannedTasks[taskPtr];
          if (t && (!m.createTime || Date.parse(t.createdAt ?? '') <= m.createTime + 5000)) {
            plan = t.steps!.map(s => ({ ...s, status: s.status ?? 'PENDING' as PlanStep['status'] }));
            artifacts = t.artifacts && t.artifacts.length > 0 ? t.artifacts : undefined;
            taskPtr += 1;
          }
          return {
            id: `h-${m.id}`, role: 'assistant' as const, source: 'history' as const,
            content: m.content, reasoning: m.reasoningContent ?? undefined,
            model: m.model, tokens: m.tokens, createTime: m.createTime, plan, artifacts,
            blocks: parseBlocks(m.blocksJson),
          };
        }));
    } catch (e: any) {
      showToast('error', '历史消息加载失败：' + e.message);
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [showToast]);

  useEffect(() => {
    butlerService.listAgents().then(setAgents).catch(() => {});
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const updateLive = useCallback((id: string, fn: (live: LiveAssistant) => LiveAssistant) => {
    setMessages(prev => prev.map(m =>
      m.id === id && m.role === 'assistant' && m.source === 'live' ? { ...m, live: fn(m.live) } : m
    ));
  }, []);

  /**
   * 应用任务计划快照（轮询 / 恢复视图共用）：
   * - 节点状态跳变 diff 成思维链时间线文案（开始 / 完成 / 失败 / 跳过），
   *   审批后续跑没有 SSE 流，靠轮询也能看到逐步流转；
   * - 文件产物（TaskPlan.artifacts）去重合并进活体视图。
   */
  const applyPlanSnapshot = useCallback((msgId: string, steps: PlanStep[], artifacts?: TaskArtifact[]) => {
    updateLive(msgId, live => {
      const prev = new Map((live.plan ?? []).map(s => [s.stepId, s.status ?? 'PENDING']));
      const events = [...live.events];
      for (const s of steps) {
        const before = prev.get(s.stepId);
        const now = s.status ?? 'PENDING';
        if (before === undefined || before === now) continue;
        const label = s.description ?? s.targetName ?? s.stepId;
        if (now === 'RUNNING') events.push({ kind: 'progress', label: `开始执行：${label}` });
        else if (now === 'SUCCEEDED') events.push({ kind: 'tool_done', label: `完成：${label}` });
        else if (now === 'FAILED') events.push({ kind: 'error', label: `失败：${label}${s.errorMessage ? ' — ' + s.errorMessage : ''}` });
        else if (now === 'SKIPPED' || now === 'CANCELED') events.push({ kind: 'progress', label: `已跳过：${label}` });
      }
      const merged = [...live.artifacts];
      for (const a of artifacts ?? []) {
        if (!merged.some(x => x.artifactId === a.artifactId)) merged.push(a);
      }
      return { ...live, plan: steps, events, artifacts: merged };
    });
  }, [updateLive]);

  /** 节点进度事件（phase=node "N1 RUNNING · 描述"）→ 更新 DAG 节点状态 + 思维链文案 */
  const applyNodeEvent = useCallback((msgId: string, stepId: string, status: string, desc?: string) => {
    updateLive(msgId, live => {
      const plan = (live.plan ?? []).map(s =>
        s.stepId === stepId ? { ...s, status: status as PlanStep['status'] } : s);
      const label = desc || plan.find(s => s.stepId === stepId)?.description || stepId;
      let ev: TimelineItem | null = null;
      if (status === 'RUNNING') ev = { kind: 'progress', label: `开始执行：${label}` };
      else if (status === 'SUCCEEDED') ev = { kind: 'tool_done', label: `完成：${label}` };
      else if (status === 'FAILED') ev = { kind: 'error', label: `失败：${label}` };
      else if (status === 'SKIPPED' || status === 'CANCELED') ev = { kind: 'progress', label: `已跳过：${label}` };
      return { ...live, plan, events: ev ? [...live.events, ev] : live.events };
    });
  }, [updateLive]);

  /** 订阅任务事件流（SSE）：确认续跑 / 回到运行中会话时接收节点进度、产物、挂起与终态 */
  const subscribeTaskStream = useCallback((msgId: string, taskId: string, sid: string | null) => {
    taskStreamRef.current.get(msgId)?.abort();
    const ctrl = new AbortController();
    taskStreamRef.current.set(msgId, ctrl);
    let terminated = false;
    let gotEvent = false;
    let gotText = false;
    // 归属校验后释放槽位：过期闭包（被新订阅取代的旧连接）绝不得删新控制器、
    // 也不得为已取代的连接回退轮询——否则旧订阅失联残留，双订阅同写一气泡致文本逐块重复
    const release = () => taskStreamRef.current.get(msgId) === ctrl
      ? taskStreamRef.current.delete(msgId) : false;
    const finish = (after?: () => void) => {
      terminated = true;
      window.clearTimeout(watchdog);
      release();
      after?.();
    };
    // 静默看门狗：长时间只有心跳没有业务事件（续跑事件出口异常）时回退轮询兜底
    const watchdog = window.setTimeout(() => {
      if (!gotEvent && !terminated) {
        finish(() => void pollTaskAndReloadRef.current(msgId));
        ctrl.abort();
      }
    }, 45000);
    const onTerminal = () => {
      updateLive(msgId, live => settleFinalPhase({ ...live, resuming: false }));
      // 正文已流式入气泡时保留现场（含过程叙述）；无正文流入（异常路径）才回读历史补齐
      const realSid = sid ?? sessionIdRef.current;
      if (realSid && !gotText) void loadHistory(realSid);
      void refreshSessions();
      refreshSessionsLater();
    };
    void subscribeTaskEvents(taskId, {
      onBlockDelta: d => {
        if (d.blockType === 'text' && d.delta) {
          gotEvent = true;
          gotText = true;
          updateLive(msgId, live => appendTextDelta(live, d.stepIndex ?? 0, d.delta));
        }
      },
      onProgress: d => {
        gotEvent = true;
        if (d.phase !== 'node') return;
        const m = /^(?<id>[A-Za-z0-9_-]+)\s+(?<st>[A-Z]+)(?:\s+·\s+(?<desc>[\s\S]*))?$/.exec(d.message ?? '');
        if (m?.groups) applyNodeEvent(msgId, m.groups.id, m.groups.st, m.groups.desc);
      },
      onDomainData: d => {
        gotEvent = true;
        if (d.kind === 'butler.artifact' && d.ext) {
          updateLive(msgId, live => ({
            ...live,
            artifacts: live.artifacts.some(a => a.artifactId === d.ext.artifactId)
              ? live.artifacts
              : [...live.artifacts, d.ext as TaskArtifact],
          }));
        }
      },
      // 计划执行中的人工门：重现审批卡片等待再次确认
      onApprovalRequired: d => {
        gotEvent = true;
        updateLive(msgId, live => ({
          ...live,
          resuming: false,
          stop: 'INPUT_REQUIRED',
          approval: { approvalId: d.approvalId, summary: d.summary || '需要人工确认', state: 'pending' },
        }));
      },
      onFinal: () => finish(() => {
        updateLive(msgId, live => settleFinalPhase({ ...live, terminal: 'final', stop: undefined }));
        onTerminal();
      }),
      onRunFailed: d => finish(() => {
        updateLive(msgId, live => ({ ...live, terminal: 'failed', errorMsg: d.message || '执行失败' }));
        onTerminal();
      }),
      onCancelled: () => finish(() => {
        updateLive(msgId, live => ({ ...live, terminal: 'cancelled', resuming: false }));
      }),
      onClose: () => {
        // 流异常断开（未见终态）且本闭包仍持有槽位时，才回退轮询兜底
        if (!terminated && release()) {
          void pollTaskAndReloadRef.current(msgId);
        }
      },
    }, ctrl.signal).catch(() => {
      if (!terminated && release()) {
        void pollTaskAndReloadRef.current(msgId);
      }
    });
  }, [updateLive, applyNodeEvent, loadHistory, refreshSessions, refreshSessionsLater]);

  const pushEvent = useCallback((id: string, ev: TimelineItem) => {
    updateLive(id, live => ({ ...live, events: [...live.events, ev] }));
  }, [updateLive]);

  /**
   * 运行中恢复视图：回到会话时若本会话仍有 RUNNING / 待确认任务且无对应活体气泡，
   * 重建活体卡并订阅任务事件流（断流自动回退轮询）——
   * 跳转任务详情再返回不再丢失"正在进行"的视图。
   */
  const resumeLiveIfRunning = useCallback(async (sid: string) => {
    try {
      const tasks = await taskService.listBySession(sid);
      const active = tasks
        .filter(t => t.status === 'RUNNING' || t.status === 'WAITING_CONFIRMATION')
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
      if (!active) return;

      const bubbleId = `live-${active.taskId}`;
      setMessages(prev => {
        if (prev.some(m => m.id === bubbleId)) return prev;
        // 历史里的审批等待提示是过程态：任务仍待确认时由 live 审批卡重现，剔除避免双气泡
        const base = active.status === 'WAITING_CONFIRMATION'
          ? prev.filter(m => !(m.role === 'assistant' && 'content' in m && typeof m.content === 'string'
              && APPROVAL_WAITING_TIP.test(m.content)))
          : prev;
        return [...base, {
          id: bubbleId, role: 'assistant' as const, source: 'live' as const,
          live: {
            taskId: active.taskId, events: [], reasonings: [], content: '',
            artifacts: active.artifacts ?? [],
            plan: active.steps?.map(s => ({ ...s, status: s.status ?? 'PENDING' as PlanStep['status'] })) ?? [],
            resuming: active.status === 'RUNNING',
            stop: active.status === 'WAITING_CONFIRMATION' ? 'INPUT_REQUIRED' : undefined,
            approval: active.status === 'WAITING_CONFIRMATION'
              ? {
                  approvalId: 'plan',
                  summary: active.steps?.find(s => s.status === 'RUNNING' || s.status === 'PENDING')?.description
                    ? `需要人工确认：${active.steps.find(s => s.status === 'RUNNING' || s.status === 'PENDING')!.description}`
                    : '任务等待确认，确认后继续执行',
                  state: 'pending' as const,
                }
              : undefined,
          },
        }];
      });
      subscribeTaskStream(bubbleId, active.taskId, sid);
    } catch {
      // 恢复视图失败静默（历史视图仍可用）
    }
  }, [subscribeTaskStream]);

  // ─── 续跑轮询：confirm 后等待异步终态，节点状态跳变转思维链文案，完成后回读历史 ───
  const pollTaskAndReload = useCallback(async (msgId: string) => {
    const target = messages.find(m => m.id === msgId);
    const taskId = target && target.role === 'assistant' && target.source === 'live' ? target.live.taskId : undefined;
    if (!taskId) return;
    updateLive(msgId, live => ({ ...live, resuming: true }));
    const terminalStates = ['COMPLETED', 'FAILED', 'CANCELED'];
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const plan = await taskService.getTask(taskId);
        // 续跑期间把节点状态跳变回灌（规划抽屉数据 + 思维链文案 + 产物卡片）
        if (plan?.steps) {
          applyPlanSnapshot(
            msgId,
            plan.steps.map(s => ({ ...s, status: s.status ?? 'PENDING' as PlanStep['status'] })),
            plan.artifacts ?? [],
          );
        }
        if (plan?.status && terminalStates.includes(plan.status)) {
          const sid = sessionIdRef.current;
          if (sid) await loadHistory(sid);
          await refreshSessions();
          refreshSessionsLater();
          return;
        }
        // 计划执行中的人工门（risk=HIGH 节点）：挂起态重现审批卡片，等待再次确认
        if (plan?.status === 'WAITING_CONFIRMATION') {
          const gateStep = plan.steps?.find(s => s.status === 'RUNNING' || s.status === 'PENDING');
          updateLive(msgId, live => ({
            ...live,
            resuming: false,
            stop: 'INPUT_REQUIRED',
            approval: {
              approvalId: taskId,
              summary: gateStep?.description
                ? `需要人工确认：${gateStep.description}`
                : '执行到需要人工确认的节点，请确认后继续',
              state: 'pending',
            },
          }));
          return;
        }
      } catch { /* 轮询失败重试 */ }
    }
    updateLive(msgId, live => ({ ...live, resuming: false }));
    showToast('info', '任务仍在执行，可稍后在任务页查看结果');
  }, [messages, updateLive, applyPlanSnapshot, loadHistory, refreshSessions, refreshSessionsLater, showToast]);
  pollTaskAndReloadRef.current = pollTaskAndReload;

  const decideWaiting = useCallback(async (msgId: string, decision: 'confirm' | 'cancel') => {
    const target = messages.find(m => m.id === msgId);
    if (!target || target.role !== 'assistant' || target.source !== 'live' || !target.live.taskId) return;
    const taskId = target.live.taskId;
    // 审批卡片点完即消失，进度转入思维链时间线
    updateLive(msgId, live => ({
      ...live,
      approval: live.approval
        ? { ...live.approval, state: decision === 'confirm' ? 'approved' : 'rejected' }
        : live.approval,
      events: [...live.events, decision === 'confirm'
        ? { kind: 'milestone' as const, label: '已确认，任务继续执行' }
        : { kind: 'milestone' as const, label: '已取消任务' }],
    }));
    try {
      if (decision === 'confirm') {
        await taskService.confirmTask(taskId);
        // 确认后订阅任务事件流（SSE 推送节点进度/产物/挂起/终态），断流自动回退轮询；
        // 清掉首轮终态标记，气泡回到执行中视图
        updateLive(msgId, live => ({ ...live, terminal: undefined, resuming: true, stop: undefined, approval: undefined }));
        subscribeTaskStream(msgId, taskId, sessionIdRef.current);
      } else {
        // 取消前先断任务事件订阅（已 delete 的引用使 onClose 不再回退轮询）
        taskStreamRef.current.get(msgId)?.abort();
        taskStreamRef.current.delete(msgId);
        await taskService.cancelTask(taskId);
        updateLive(msgId, live => ({ ...live, resuming: false, stop: 'CANCELED' }));
      }
    } catch (e: any) {
      updateLive(msgId, live => ({
        ...live,
        events: [...live.events, { kind: 'error' as const, label: `操作失败：${e.message}` }],
      }));
    }
  }, [messages, updateLive, subscribeTaskStream]);

  // ─── 发送 ──────────────────────────────────────────────────
  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    // 任务活动中（首轮流式 / 续跑 / 等待审批）禁止并发发信，避免同会话多任务交错；
    // 澄清答复例外（澄清气泡不参与忙碌判定）
    const busy = messages.some(m => m.role === 'assistant' && m.source === 'live'
      && !m.live.clarification
      && (!m.live.terminal || m.live.resuming
          || (m.live.stop === 'INPUT_REQUIRED' && m.live.approval?.state === 'pending')));
    const images = pendingImages;
    if ((!text && images.length === 0) || streaming || busy) return;
    // 能力门控兜底（入口按钮已拦，粘贴竞态 / 目录迟到场景二次防御）
    if (images.length > 0 && !visionSupported) {
      showToast('warning', '当前模型不支持图片输入，请先切换具备视觉能力的模型');
      return;
    }
    setInput('');
    setPendingImages([]);
    const asstId = `a-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text, images: images.length > 0 ? images : undefined },
      {
        id: asstId, role: 'assistant', source: 'live',
        live: { events: [], reasonings: [], content: '', artifacts: [] },
      },
    ]);
    setStreaming(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // TEXT 块拼接正文；REASONING 块聚合思考过程（孤儿增量自动归组）
    const reasoningBlocks = new Set<string>();
    // 调试频道按轮聚合：开始时刻 / 工具调用计数在 StepFinished 时回填为一行摘要
    const stepStartedAt = new Map<number, number>();
    const stepToolCalls = new Map<number, number>();
    let currentStep = -1;

    try {
      await invokeButlerStream(text, sessionId, selectedAgent || null, {
        onTaskCreated: ext => {
          updateLive(asstId, live => ({ ...live, taskId: ext.taskId }));
        },
        onStage: d => {
          pushEvent(asstId, {
            kind: 'stage',
            label: d.title + (d.detail ? `：${d.detail}` : ''),
          });
        },
        onProgress: d => {
          if (d.phase === 'node') {
            // 节点级进度：更新 DAG 图节点状态并生成思维链文案（"N1 SUCCEEDED · 描述"）
            const m = /^(?<id>[A-Za-z0-9_-]+)\s+(?<st>[A-Z]+)(?:\s+·\s+(?<desc>[\s\S]*))?$/.exec(d.message ?? '');
            if (m?.groups) applyNodeEvent(asstId, m.groups.id, m.groups.st, m.groups.desc);
            return;
          }
          const suffix = d.total > 0 ? `（${d.current}/${d.total}）` : '';
          pushEvent(asstId, { kind: 'progress', label: `${d.phase ?? '进度'}${suffix} ${d.message ?? ''}`.trim() });
        },
        onMilestone: d => {
          if (d.kind === 'butler.plan' && d.payload?.nodes) {
            // 计划总览：建立实时 DAG 图（节点状态由后续 node 进度事件着色）
            const steps: PlanStep[] = (d.payload.nodes as any[]).map(n => ({
              stepId: String(n.nodeId ?? ''),
              description: String(n.description ?? ''),
              stepKind: n.stepKind,
              targetName: n.targetName ? String(n.targetName) : undefined,
              dependsOn: Array.isArray(n.dependsOn) ? n.dependsOn.map(String) : [],
              status: 'PENDING',
            }));
            updateLive(asstId, live => ({ ...live, plan: steps }));
            pushEvent(asstId, { kind: 'milestone', label: d.title || '执行计划已生成' });
            return;
          }
          // 数字/标量 payload 不作为详情展示（防御裸 0 被原样渲染）
          const detail = d.payload && typeof d.payload === 'object' ? fmtJson(d.payload) : undefined;
          pushEvent(asstId, { kind: 'milestone', label: d.title || d.kind || '里程碑', detail });
        },
        onStepStarted: d => {
          currentStep = d.stepIndex;
          stepStartedAt.set(d.stepIndex, Date.now());
          stepToolCalls.set(d.stepIndex, 0);
          pushEvent(asstId, { kind: 'step', label: `第 ${d.stepIndex + 1} 轮推理`, debug: true });
        },
        onStepFinished: d => {
          // 回填本轮摘要：耗时 / 工具调用数 / 正文相位，一轮一行不刷屏
          const startedAt = stepStartedAt.get(d.stepIndex);
          const tools = stepToolCalls.get(d.stepIndex) ?? 0;
          const parts = [
            `第 ${d.stepIndex + 1} 轮推理`,
            startedAt != null ? `${((Date.now() - startedAt) / 1000).toFixed(1)}s` : null,
            d.hadToolCalls ? `工具调用 ×${tools}` : '无工具调用',
            `相位 ${d.terminalPhase}`,
          ].filter(Boolean);
          const summary = parts.join(' · ');
          updateLive(asstId, live => {
            const events = [...live.events];
            for (let i = events.length - 1; i >= 0; i--) {
              if (events[i].kind === 'step' && events[i].label === `第 ${d.stepIndex + 1} 轮推理`) {
                events[i] = { ...events[i], label: summary };
                break;
              }
            }
            return markBlockPhase({ ...live, events }, d.stepIndex, d.terminalPhase ?? 'commentary');
          });
        },
        onBlockStart: d => {
          if (d.blockType === 'reasoning' || d.blockType === 'commentary') {
            if (!reasoningBlocks.has(d.blockId)) {
              reasoningBlocks.add(d.blockId);
              updateLive(asstId, live => ({
                ...live,
                reasonings: [...live.reasonings, { id: d.blockId, label: d.label ?? null, text: '' }],
              }));
            }
          }
        },
        onBlockDelta: d => {
          if (d.blockType === 'reasoning' || d.blockType === 'commentary') {
            if (!reasoningBlocks.has(d.blockId)) {
              // 孤儿增量（续传中途接入）：自动补建块
              reasoningBlocks.add(d.blockId);
              updateLive(asstId, live => ({
                ...live,
                reasonings: [...live.reasonings, { id: d.blockId, label: null, text: d.delta }],
              }));
            } else {
              updateLive(asstId, live => ({
                ...live,
                reasonings: live.reasonings.map(b => b.id === d.blockId ? { ...b, text: b.text + d.delta } : b),
              }));
            }
          } else if (d.blockType === 'text' && d.delta) {
            updateLive(asstId, live => appendTextDelta(live, d.stepIndex ?? 0, d.delta));
          }
        },
        onToolCallStart: d => {
          // DAG 节点工具调用（callId=node-*）：节点进度已覆盖用户频道，进调试频道
          const isNode = d.callId?.startsWith('node-') ?? false;
          if (!isNode && currentStep >= 0) stepToolCalls.set(currentStep, (stepToolCalls.get(currentStep) ?? 0) + 1);
          pushEvent(asstId, {
            kind: 'tool_start',
            label: `调用 ${d.tool}${d.narration ? ' — ' + d.narration : ''}`,
            detail: d.arguments ? fmtJson(d.arguments) : undefined,
            debug: isNode || undefined,
          });
        },
        onToolCallEnd: d => {
          const isNode = d.callId?.startsWith('node-') ?? false;
          pushEvent(asstId, {
            kind: 'tool_done',
            label: `${d.tool} ${d.success ? '完成' : '失败'}（${d.durationMs}ms）`,
            detail: d.success
              ? (d.result ? fmtJson(d.result.message ?? d.result) : undefined)
              : d.error,
            debug: isNode || undefined,
          });
        },
        onLlmCall: d => {
          pushEvent(asstId, {
            kind: 'llm',
            label: `LLM ${d.model} · ↑${d.promptTokens} ↓${d.completionTokens} tokens · ${d.latencyMs}ms`
              + (d.finishReason ? ` · ${d.finishReason}` : ''),
            debug: true,
          });
        },
        onSystemTrace: d => {
          pushEvent(asstId, {
            kind: 'trace',
            label: `[${d.category}] ${d.message ?? ''}`.trim(),
            detail: d.meta ? fmtJson(d.meta) : undefined,
            debug: true,
          });
        },
        onBusinessError: d => {
          pushEvent(asstId, { kind: 'error', label: `业务错误[${d.code}]：${d.message}` });
        },
        onApprovalRequired: d => {
          updateLive(asstId, live => ({
            ...live,
            stop: 'INPUT_REQUIRED',
            approval: { approvalId: d.approvalId, summary: d.summary || '检测到需要确认的操作', state: 'pending' },
          }));
        },
        onClarification: d => {
          // 计划确认（PLAN_CONFIRMATION）：合成审批态走 WaitingCard（确认/取消按钮），
          // 不渲染补充信息卡片——计划草案全文只在正文出现一次，卡片只带按钮
          if (d.kind === 'PLAN_CONFIRMATION') {
            updateLive(asstId, live => ({
              ...live,
              approval: {
                approvalId: 'plan',
                summary: d.question || '已制定执行计划，请确认后开始执行',
                state: 'pending',
                kind: 'plan',
              },
            }));
            return;
          }
          updateLive(asstId, live => ({
            ...live,
            clarification: { question: d.question || '需要补充信息', suggestions: d.suggestions ?? [] },
          }));
        },
        onDomainData: d => {
          if (d.kind === 'butler.artifact' && d.ext) {
            updateLive(asstId, live => ({
              ...live,
              artifacts: live.artifacts.some(a => a.artifactId === d.ext.artifactId)
                ? live.artifacts
                : [...live.artifacts, d.ext as TaskArtifact],
            }));
          }
        },
        onFinal: result => {
          const sid = result.ext?.sessionId;
          updateLive(asstId, live => settleFinalPhase({
            ...live,
            terminal: 'final',
            stop: result.stop,
            meta: {
              model: result.ext?.model,
              totalTokens: result.ext?.totalTokens,
              durationMs: result.ext?.durationMs,
            },
          }));
          // 新会话首条消息：绑定服务端创建的会话并刷新侧栏
          if (sid && sid !== sessionIdRef.current) {
            sessionIdRef.current = sid;
            setSessionId(sid);
          }
          void refreshSessions();
          refreshSessionsLater();
        },
        onRunFailed: d => {
          updateLive(asstId, live => ({ ...live, terminal: 'failed', errorMsg: d.message || '调用失败' }));
        },
        onCancelled: () => {
          updateLive(asstId, live => ({ ...live, terminal: 'cancelled' }));
        },
        onClose: () => {
          // 主动停止（abort 信号）与被动断线分流：前者渲染已取消，后者才是连接中断
          const aborted = signal.aborted;
          updateLive(asstId, live => live.terminal ? live : aborted
            ? { ...live, terminal: 'cancelled' }
            : { ...live, terminal: 'failed', errorMsg: '连接中断' });
          void refreshSessions();
        },
      }, signal, approvalMode, images, resolvedProvider, resolvedModel, resolvedThinking);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        updateLive(asstId, live => ({ ...live, terminal: 'failed', errorMsg: e.message || '调用失败' }));
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const stopStreaming = async () => {
    abortRef.current?.abort();
    // 找到最后一条活体消息，向服务端广播取消
    const last = [...messages].reverse().find(m => m.role === 'assistant' && m.source === 'live');
    const taskId = last && last.role === 'assistant' && last.source === 'live' ? last.live.taskId : undefined;
    if (taskId) await taskService.cancelTask(taskId).catch(() => {});
  };

  const newChat = () => {
    abortRef.current?.abort();
    taskStreamRef.current.forEach(c => c.abort());
    taskStreamRef.current.clear();
    setSessionId(null);
    sessionIdRef.current = null;
    setMessages([]);
  };

  const selectSession = async (id: string) => {
    if (streaming) return;
    taskStreamRef.current.forEach(c => c.abort());
    taskStreamRef.current.clear();
    setSessionId(id);
    sessionIdRef.current = id;
    await loadHistory(id);
    // 会话内仍有运行中/待确认任务时重建活体视图（导航往返不丢"正在进行"）
    void resumeLiveIfRunning(id);
  };

  const deleteSession = async (id: string) => {
    const ok = await confirm({
      title: '删除会话',
      message: '删除后该会话的全部消息将不可恢复，确定删除吗？',
      type: 'warning',
      confirmText: '删除',
      cancelText: '取消',
    });
    if (!ok) return;
    try {
      await conversationService.deleteSession(id);
      if (sessionIdRef.current === id) newChat();
      await refreshSessions();
    } catch (e: any) {
      showToast('error', '删除失败：' + e.message);
    }
  };

  const renameSession = async (id: string, title: string) => {
    try {
      await conversationService.updateSession(id, title);
      await refreshSessions();
    } catch (e: any) {
      showToast('error', '重命名失败：' + e.message);
    }
  };

  const currentTitle = useMemo(
    () => sessions.find(s => s.id === sessionId)?.title ?? '新会话',
    [sessions, sessionId]
  );

  // 任务活动中的 live 气泡（首轮流式 / 续跑中 / 等待审批确认）：期间锁定输入并提供取消入口。
  // 澄清气泡除外（需要用户输入答复）；终态后解除。
  const busyMsgId = messages.find(m =>
    m.role === 'assistant' && m.source === 'live' && !m.live.clarification
    && (!m.live.terminal || m.live.resuming
        || (m.live.stop === 'INPUT_REQUIRED' && m.live.approval?.state === 'pending'))
  )?.id ?? null;

  // ─── 渲染 ──────────────────────────────────────────────────
  return (
    <div className="h-full flex bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100">
      <SessionSidebar
        sessions={sessions}
        currentSessionId={sessionId}
        loading={sessionsLoading}
        onNewChat={newChat}
        onSelect={selectSession}
        onRename={renameSession}
        onDelete={deleteSession}
      />

      {/* 右侧主列 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <Cpu size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-black truncate">{currentTitle}</h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                {sessionId ? `session ${sessionId.slice(-8)}` : '新会话'} · 协议 v1 事件流
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              compact
              className="min-w-[100px]"
              value={approvalMode}
              onChange={v => changeApprovalMode(v)}
              options={[
                { value: 'ASK', label: '每次询问' },
                { value: 'AUTO', label: '自动执行' },
              ]}
            />
            <Select
              compact
              className="min-w-[130px]"
              value={selectedAgent}
              onChange={v => setAgent(v)}
              placeholder="自动路由"
              options={agents.map(a => ({ value: a.agentId, label: a.name ?? a.agentId }))}
            />
            {streaming && (
              <button
                onClick={() => void stopStreaming()}
                title="停止生成"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-all flex-shrink-0"
              >
                <Square size={12} /> 停止
              </button>
            )}
            {!streaming && busyMsgId && (
              <button
                onClick={() => void decideWaiting(busyMsgId, 'cancel')}
                title="取消正在处理的任务"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-all flex-shrink-0"
              >
                <Square size={12} /> 取消任务
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-5 ${THEME.scrollbar}`}>
          {loadingHistory && (
            <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm py-8">
              <Loader2 size={14} className="animate-spin" /> 加载历史消息...
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-4 select-none">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center border border-violet-100">
                <Bot size={30} className="text-violet-300" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-neutral-300">输入消息，Butler 将智能路由到合适的 Agent</p>
            </div>
          )}

          {messages.map(msg => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex gap-4 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm bg-neutral-900">
                    <User size={14} className="text-white" />
                  </div>
                  <div className="max-w-[75%] px-5 py-3.5 rounded-xl rounded-tr-sm bg-neutral-900 text-white text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm">
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex gap-2 flex-wrap mb-2">
                        {msg.images.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noreferrer" className="block">
                            <img src={src} alt={`图片 ${i + 1}`}
                              className="max-w-40 max-h-40 rounded-lg border border-white/20 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    {msg.content}
                  </div>
                </div>
              );
            }

            // 历史消息（服务端会话记录）
            if (msg.source === 'history') {
              return (
                <div key={msg.id} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm bg-white border border-neutral-200">
                    <Bot size={15} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0 max-w-[90%] mt-0.5">
                    {msg.reasoning && (
                      <details className="mb-2 rounded-xl border border-neutral-200/70 bg-neutral-50/60">
                        <summary className="px-4 py-2 text-[12px] font-bold text-neutral-500 cursor-pointer select-none">
                          <Brain size={12} className="inline mr-1.5 -mt-0.5 text-violet-400" />思考过程
                        </summary>
                        <pre className="px-4 pb-3 max-h-56 overflow-y-auto text-[12px] leading-relaxed text-neutral-500 whitespace-pre-wrap">{msg.reasoning}</pre>
                      </details>
                    )}
                    {/* 过程快照回放：执行步骤 / 思考块 / 过程叙述（刷新后重建执行过程视图） */}
                    {msg.blocks?.events && msg.blocks.events.length > 0 && (
                      <Timeline events={msg.blocks.events} streaming={false} />
                    )}
                    {msg.blocks?.reasonings && msg.blocks.reasonings.length > 0 && (
                      <ReasoningSection blocks={msg.blocks.reasonings} streaming={false} />
                    )}
                    <ProcessNarrative
                      blocks={(msg.blocks?.textBlocks ?? []).filter(b => b.phase !== 'final')}
                      streaming={false}
                    />
                    {msg.plan && msg.plan.length > 0 && (
                      <PlanLauncher steps={msg.plan} onOpen={() => setPlanDrawerFor(msg.id)} />
                    )}
                    <MdContent text={msg.content} />
                    {(() => {
                      const arts = msg.blocks?.artifacts && msg.blocks.artifacts.length > 0
                        ? msg.blocks.artifacts : msg.artifacts;
                      return arts && arts.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {arts.map((a, i) => (
                            <ArtifactCard key={a.artifactId} artifact={a}
                              onPreview={() => setPreview({ artifacts: arts, index: i })} />
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const parts = [msg.model, msg.tokens && msg.tokens > 0 ? `${msg.tokens} tokens` : null].filter(Boolean);
                      return parts.length > 0 && (
                        <p className="mt-1.5 text-[10px] text-neutral-300 font-mono">{parts.join(' · ')}</p>
                      );
                    })()}
                  </div>
                </div>
              );
            }

            // 活体消息（协议 v1 事件聚合）
            const live = msg.live;
            const isStreaming = !live.terminal && !live.resuming;
            return (
              <div key={msg.id} className="flex gap-4">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm bg-white border border-neutral-200">
                  <Bot size={15} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0 max-w-[90%] mt-0.5">
                  {live.plan && live.plan.length > 0 && (
                    <PlanLauncher steps={live.plan} onOpen={() => setPlanDrawerFor(msg.id)} />
                  )}
                  <Timeline events={live.events} streaming={isStreaming} />
                  <ReasoningSection blocks={live.reasonings} streaming={isStreaming} />

                  {(() => {
                    // 相位分流渲染：过程叙述与正式答复分层，不再把执行步骤误读为正文
                    const { narrative, answer } = splitPhases(live.textBlocks, live.content);
                    return (
                      <>
                        <ProcessNarrative blocks={narrative} streaming={isStreaming} />
                        {(answer || live.errorMsg || (isStreaming && !answer)) && (
                          <div className={`w-full ${live.terminal === 'failed' ? 'px-5 py-4 rounded-2xl bg-red-50 border border-red-100' : ''}`}>
                            {live.terminal === 'failed'
                              ? <p className="text-[14px] text-red-600">{live.errorMsg || answer || '调用失败'}</p>
                              : <MdContent text={answer} />}
                            {isStreaming && !answer && (
                              <span className="flex gap-1.5 items-center mt-2 h-4">
                                {[0, 0.15, 0.3].map((d, i) => (
                                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-pulse" style={{ animationDelay: `${d}s` }} />
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {live.artifacts.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {live.artifacts.map((a, i) => (
                        <ArtifactCard key={a.artifactId} artifact={a}
                          onPreview={() => setPreview({ artifacts: live.artifacts, index: i })} />
                      ))}
                    </div>
                  )}

                  {live.terminal === 'cancelled' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-400">
                      <XCircle size={13} /> 本次运行已取消
                    </div>
                  )}

                  {live.clarification && live.terminal !== 'failed' && (
                    <ClarificationCard
                      question={live.clarification.question}
                      suggestions={live.clarification.suggestions}
                      onPick={s => setInput(s)}
                    />
                  )}

                  {live.stop === 'INPUT_REQUIRED' && live.approval && (
                    <WaitingCard
                      live={live}
                      onConfirm={() => void decideWaiting(msg.id, 'confirm')}
                      onCancel={() => void decideWaiting(msg.id, 'cancel')}
                    />
                  )}

                  {live.terminal === 'final' && live.stop !== 'INPUT_REQUIRED' && live.meta && (() => {
                    const m = live.meta;
                    const parts = [
                      m.model,
                      m.totalTokens ? `${m.totalTokens} tokens` : null,
                      m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : null,
                    ].filter(Boolean);
                    return parts.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-neutral-300 font-mono">{parts.join(' · ')}</p>
                    );
                  })()}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-neutral-100 flex-shrink-0">
          {/* 生成控制工具条：模型 + 思考贴近输入区（控制的是"这轮怎么生成"） */}
          <div className="mb-2.5 flex items-center gap-2">
            <ModelPreferenceSelect
              servicePrefix={config.SERVICE_BUTLER}
              sessionId={sessionId}
              onPreferenceResolved={(p, m, t) => { setResolvedProvider(p); setResolvedModel(m); setResolvedThinking(t); }}
            />
          </div>
          {/* 待发送图片预览条（多图，可单独移除） */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 mb-2.5 flex-wrap">
              {pendingImages.map((src, i) => (
                <div key={i} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
                  <img src={src} alt={`图片 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                    title="移除图片"
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 items-end">
            {/* 图片附件入口（视觉能力门控：当前模型不支持时禁用） */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void addImages(files);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!visionSupported || streaming || busyMsgId !== null}
              title={visionSupported ? '添加图片（支持粘贴，最多 4 张）' : '当前模型不支持图片输入'}
              className="flex-shrink-0 w-11 h-11 rounded-2xl border border-neutral-200 text-neutral-500 flex items-center justify-center hover:bg-neutral-50 hover:text-violet-600 hover:border-violet-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImagePlus size={16} />
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              onPaste={handlePaste}
              placeholder={busyMsgId ? '任务处理中，完成或取消后可继续输入…' : visionSupported ? '输入指令，可直接粘贴图片...' : '输入指令，Butler 将自动路由到合适的 Agent...'}
              disabled={streaming || busyMsgId !== null}
              rows={1}
              className="flex-1 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 text-sm font-medium resize-none outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all max-h-32 min-h-[48px] disabled:opacity-50"
            />
            <button
              onClick={() => void send()}
              disabled={(!input.trim() && pendingImages.length === 0) || streaming || busyMsgId !== null}
              className="flex-shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
      {ConfirmDialog}
      {/* 产物预览抽屉 */}
      {preview && (
        <ArtifactPreviewDrawer
          artifacts={preview.artifacts}
          index={preview.index}
          onSelect={i => setPreview(p => p ? { ...p, index: i } : p)}
          onClose={() => setPreview(null)}
        />
      )}
      {/* 任务规划抽屉：步骤数据实时取自对应消息（轮询 / SSE 更新自动反映） */}
      {planDrawerFor && (() => {
        const m = messages.find(x => x.id === planDrawerFor);
        const steps = m && m.role === 'assistant'
          ? (m.source === 'live' ? m.live.plan : m.plan)
          : undefined;
        return steps && steps.length > 0
          ? <PlanDrawer steps={steps} onClose={() => setPlanDrawerFor(null)} />
          : null;
      })()}
    </div>
  );
};

export default InvokePage;
