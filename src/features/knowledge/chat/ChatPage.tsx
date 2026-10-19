import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageSquareText, Pencil, Plus, SendHorizonal, Square, Trash2 } from 'lucide-react';
import { knowledgeAppService, knowledgeChatService } from '../../../shared/services/knowledge';
import type {
  ChatHistoryMessage, ChatSession, Citation, KnowledgeApp,
} from '../../../shared/types/knowledge';
import { CHAT_DEFAULT_TOP_K } from '../../../shared/constants/knowledge';
import { THEME } from '../../../shared/styles/theme';
import { useToast } from '../../../shared/components/ui/ToastManager';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import Badge from '../../../shared/components/ui/Badge';
import EmptyState from '../../../shared/components/ui/EmptyState';
import Spinner from '../../../shared/components/ui/Spinner';
import ModelPreferenceSelect from '../../../shared/components/ModelPreferenceSelect';
import { formatDateTime } from '../../../shared/utils/date';
import ChunkPreviewDrawer from '../detail/components/ChunkPreviewDrawer';

/** 进行中消息在 sessionStorage 的标记前缀（刷新后可 resume 续接） */
const STREAMING_MARK = 'kb.chat.streaming:';

/** 本地消息（历史消息 + 流式进行态） */
interface LocalMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  citations?: Citation[];
  streaming?: boolean;
  error?: string;
  createTime?: number;
}

const toLocal = (m: ChatHistoryMessage): LocalMessage => ({
  id: m.id,
  role: m.role === 'assistant' ? 'assistant' : 'user',
  content: m.content,
  reasoning: m.reasoningContent,
  citations: m.citations,
  createTime: m.createTime ?? undefined,
});

/** 知识问答页（/knowledge/chat）：会话栏 + 流式问答 + 引用下钻 */
const ChatPage: React.FC = () => {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [apps, setApps] = useState<KnowledgeApp[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  /** 会话模型偏好（选择器解析回调填充，随请求携带——新会话首轮无偏好可读） */
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [preview, setPreview] = useState<{ docId: string; docName?: string; chunkId?: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const page = await knowledgeChatService.pageSessions({ page: 1, size: 50 });
      setSessions(page.records ?? []);
    } catch (e: any) {
      toast.showError(e.message || '加载会话失败');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    knowledgeAppService.page({ page: 1, size: 100 })
      .then(p => setApps((p.records ?? []).filter(a => !a.disabled)))
      .catch(() => setApps([]));
  }, [loadSessions]);

  /** 流事件统一处理：citations 先行 → content 追加 → done/error 收尾 */
  const streamCallbacks = (assistantIndex: () => number) => ({
    onEvent: (event: { type: string; content?: string; reasoningContent?: string; citations?: Citation[]; sessionId?: string; error?: string }) => {
      const idx = assistantIndex();
      if (event.type === 'citations') {
        setMessages(prev => prev.map((m, i) => i === idx ? { ...m, citations: event.citations ?? [] } : m));
        return;
      }
      if (event.type === 'content') {
        setMessages(prev => prev.map((m, i) => i === idx
          ? { ...m, content: m.content + (event.content ?? ''), reasoning: (m.reasoning ?? '') + (event.reasoningContent ?? '') }
          : m));
        scrollToBottom();
        return;
      }
      if (event.type === 'done') {
        if (event.sessionId && !activeId) {
          setActiveId(event.sessionId);
          loadSessions();
        }
        return true;
      }
      if (event.type === 'error') {
        setMessages(prev => prev.map((m, i) => i === idx ? { ...m, error: event.error || '生成失败' } : m));
        return true;
      }
      return;
    },
    onError: (error: Error) => {
      const idx = assistantIndex();
      setMessages(prev => prev.map((m, i) => i === idx ? { ...m, streaming: false, error: error.message } : m));
      setSending(false);
    },
    onClose: () => {
      const idx = assistantIndex();
      // resume 无活跃流时服务端直接关流：清掉空的占位气泡
      setMessages(prev => prev.flatMap((m, i) => {
        if (i !== idx) return [m];
        if (m.streaming && !m.content && !m.error && !(m.citations?.length)) return [];
        return [{ ...m, streaming: false }];
      }));
      setSending(false);
      if (activeId) sessionStorage.removeItem(STREAMING_MARK + activeId);
    },
  });

  /** 断线续接：刷新/重进后若服务端仍有活跃流则 replay 接续 */
  const tryResume = useCallback((sessionId: string) => {
    if (!sessionStorage.getItem(STREAMING_MARK + sessionId)) return;
    setSending(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);
    const idx = () => messagesRef.current.length - 1;
    abortRef.current = knowledgeChatService.resume(sessionId, streamCallbacks(idx));
  }, []);

  /** 选中会话：加载历史 + 范围绑定 */
  const openSession = useCallback(async (sessionId: string) => {
    abortRef.current?.abort();
    setActiveId(sessionId);
    setHistoryLoading(true);
    setMessages([]);
    try {
      const [history, scopeIds] = await Promise.all([
        knowledgeChatService.messages(sessionId),
        knowledgeChatService.getScope(sessionId).catch(() => [] as string[]),
      ]);
      setMessages(history.map(toLocal));
      setScope(scopeIds ?? []);
      scrollToBottom();
      tryResume(sessionId);
    } catch (e: any) {
      toast.showError(e.message || '加载会话失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [tryResume]);

  /** messages 的 ref 镜像（流回调内取最新长度） */
  const messagesRef = useRef<LocalMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const startNew = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setScope([]);
    setSending(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    setMessages(prev => [...prev, { role: 'user', content: text, createTime: Date.now() }, { role: 'assistant', content: '', streaming: true }]);
    scrollToBottom();
    if (activeId) sessionStorage.setItem(STREAMING_MARK + activeId, '1');

    const idx = () => messagesRef.current.length - 1;
    abortRef.current = knowledgeChatService.chat({
      sessionId: activeId ?? undefined,
      message: text,
      knowledgeAppIds: scope.length > 0 ? scope : undefined,
      topK: CHAT_DEFAULT_TOP_K,
      llmProvider: llmProvider ?? undefined,
      llmModel: llmModel ?? undefined,
    }, streamCallbacks(idx));
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const toggleScope = async (appId: string) => {
    const next = scope.includes(appId) ? scope.filter(x => x !== appId) : [...scope, appId];
    setScope(next);
    if (activeId) {
      try {
        await knowledgeChatService.bindScope(activeId, next);
      } catch (e: any) {
        toast.showError(e.message || '范围绑定失败');
      }
    }
  };

  const renameSession = async (session: ChatSession) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await knowledgeChatService.renameSession(session.id, renameValue.trim());
      loadSessions();
    } catch (e: any) {
      toast.showError(e.message || '重命名失败');
    } finally {
      setRenamingId(null);
    }
  };

  const removeSession = async (session: ChatSession) => {
    const ok = await confirm({ title: '删除会话', message: `确认删除会话「${session.title || '未命名'}」？`, type: 'warning', confirmText: '删除' });
    if (!ok) return;
    try {
      await knowledgeChatService.removeSession(session.id);
      if (activeId === session.id) startNew();
      loadSessions();
    } catch (e: any) {
      toast.showError(e.message || '删除失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* 会话栏 */}
      <div className={`${THEME.card} flex w-64 flex-shrink-0 flex-col p-3`}>
        <button className={`${THEME.button.primary} mb-3`} onClick={startNew}>
          <Plus size={14} strokeWidth={3} /> 新对话
        </button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {sessionsLoading ? (
            <div className="flex justify-center py-10"><Spinner size={18} /></div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">暂无会话</div>
          ) : sessions.map(session => (
            <div
              key={session.id}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 transition-colors ${
                activeId === session.id ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              onClick={() => openSession(session.id)}
            >
              {renamingId === session.id ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1 text-[12px] font-bold text-black outline-none"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && renameSession(session)}
                  onBlur={() => renameSession(session)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{session.title || '未命名会话'}</span>
                  <button
                    className={`flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${activeId === session.id ? 'text-white/70 hover:text-white' : 'text-neutral-400 hover:text-black'}`}
                    title="重命名"
                    onClick={e => { e.stopPropagation(); setRenamingId(session.id); setRenameValue(session.title || ''); }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className={`flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${activeId === session.id ? 'text-white/70 hover:text-white' : 'text-neutral-400 hover:text-red-500'}`}
                    title="删除"
                    onClick={e => { e.stopPropagation(); removeSession(session); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 对话区 */}
      <div className={`${THEME.card} flex min-w-0 flex-1 flex-col`}>
        {/* 范围选择 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-100 px-4 py-2.5">
          <span className={THEME.label}>检索范围</span>
          {apps.map(app => (
            <button
              key={app.id}
              onClick={() => toggleScope(app.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all ${
                scope.includes(app.id) ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white/80 text-neutral-500 hover:border-neutral-400'
              }`}
            >
              {app.name}
            </button>
          ))}
          {apps.length === 0 && <span className="text-[11px] text-neutral-400">暂无可用知识库</span>}
          <span className="ml-auto">
            <ModelPreferenceSelect
              servicePrefix="cy-knowledge-repository"
              sessionId={activeId}
              disabled={sending}
              onPreferenceResolved={(p, m) => { setLlmProvider(p); setLlmModel(m); }}
            />
            <span className="text-[10px] font-semibold text-neutral-300">缺省 = 全部可见库</span>
          </span>
        </div>

        {/* 消息流 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {historyLoading ? (
            <div className="flex justify-center py-16"><Spinner size={24} /></div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText size={24} />}
              title="向知识库提问"
              desc="答案基于召回的文档块流式生成，并附引用清单；点击引用可回原文核对。"
            />
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id ?? i} msg={msg} onCitationClick={(c) => setPreview({ docId: c.docId, docName: c.docName, chunkId: c.chunkId })} />
              ))}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="flex-shrink-0 border-t border-neutral-100 p-4">
          <div className="relative">
            <textarea
              className={THEME.chatInput}
              placeholder="输入问题，Enter 发送，Shift+Enter 换行…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="absolute bottom-3.5 right-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shadow-lg transition-all hover:scale-105 disabled:opacity-30"
              onClick={sending ? stop : send}
              disabled={!sending && !input.trim()}
              title={sending ? '停止生成' : '发送'}
              aria-label={sending ? '停止生成' : '发送'}
            >
              {sending ? <Square size={13} /> : <SendHorizonal size={15} />}
            </button>
          </div>
        </div>
      </div>

      <ChunkPreviewDrawer
        open={!!preview}
        docId={preview?.docId ?? null}
        docName={preview?.docName}
        highlightChunkId={preview?.chunkId}
        onClose={() => setPreview(null)}
      />
      {ConfirmDialog}
    </div>
  );
};

/** 单条消息气泡（markdown 渲染 + 引用清单 + 思考段折叠） */
const MessageBubble: React.FC<{ msg: LocalMessage; onCitationClick: (c: Citation) => void }> = ({ msg, onCitationClick }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-[20px] rounded-br-md bg-black px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {msg.reasoning && (
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 px-4 py-2">
            <button className="text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-black" onClick={() => setShowReasoning(v => !v)}>
              思考过程 {showReasoning ? '▲' : '▼'}
            </button>
            {showReasoning && <p className="mt-1 whitespace-pre-wrap text-[12px] font-medium text-neutral-500">{msg.reasoning}</p>}
          </div>
        )}
        <div className="rounded-[20px] rounded-bl-md border border-neutral-100 bg-white/85 px-4 py-3 shadow-sm">
          {msg.error ? (
            <div className="text-sm font-bold text-red-500">{msg.error}</div>
          ) : (
            <div className="prose prose-sm max-w-none font-prose text-neutral-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || (msg.streaming ? '…' : '')}</ReactMarkdown>
            </div>
          )}
          {msg.streaming && <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded bg-neutral-400" />}
        </div>
        {(msg.citations?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.citations!.map(c => (
              <button
                key={c.index}
                onClick={() => onCitationClick(c)}
                className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-neutral-600 transition-all hover:border-black hover:text-black"
                title={c.chapterPath || c.docName}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-white">{c.index}</span>
                {c.docName}
                {c.pageNo != null && <span className="text-neutral-400">p.{c.pageNo}</span>}
                {c.refType && c.refType !== 'chunk' && <Badge tone="purple">{c.refType === 'wikiEntry' ? 'Wiki' : '图谱'}</Badge>}
              </button>
            ))}
          </div>
        )}
        {msg.createTime && <div className="text-[10px] font-semibold text-neutral-300">{formatDateTime(msg.createTime)}</div>}
      </div>
    </div>
  );
};

export default ChatPage;
