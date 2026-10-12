import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, History, RefreshCw, Search } from 'lucide-react';
import { wikiService } from '../../../../shared/services/knowledge';
import type { KnowledgeApp, WikiEntry, WikiPageBrief, WikiTree, WikiVersion } from '../../../../shared/types/knowledge';
import { roleAtLeast, WIKI_PAGE_TYPE_LABELS } from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import Badge from '../../../../shared/components/ui/Badge';
import EmptyState from '../../../../shared/components/ui/EmptyState';
import Spinner from '../../../../shared/components/ui/Spinner';
import Modal from '../../../../shared/components/ui/Modal';
import { formatDateTime } from '../../../../shared/utils/date';
import ChunkPreviewDrawer from '../components/ChunkPreviewDrawer';

/** 把 [[条目名]] 互链改写为 markdown 链接，渲染时由自定义 a 组件拦截跳转 */
const WIKI_LINK_PROTOCOL = 'wikilink://';

const renderWithLinks = (md: string): string =>
  md.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => `[${title}](${WIKI_LINK_PROTOCOL}${encodeURIComponent(title.trim())})`);

interface WikiTabProps {
  app: KnowledgeApp;
}

/** Wiki 百科 tab：导航树 + 条目正文（互链跳转）+ 版本历史 + 出处回原文 */
const WikiTab: React.FC<WikiTabProps> = ({ app }) => {
  const toast = useToast();
  const canEdit = roleAtLeast(app.myRole, 'EDITOR');

  const [tree, setTree] = useState<WikiTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<WikiVersion[]>([]);
  const [preview, setPreview] = useState<{ docId: string; docName?: string; chunkId?: string } | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await wikiService.tree(app.id));
    } catch (e: any) {
      toast.showError(e.message || '加载 Wiki 导航失败');
    } finally {
      setLoading(false);
    }
  }, [app.id]);

  useEffect(() => { loadTree(); }, [loadTree]);

  /** 标题 → 条目 ID（互链跳转用） */
  const titleIndex = useMemo(() => {
    const map = new Map<string, string>();
    tree?.groups.forEach(g => g.pages.forEach(p => map.set(p.title, p.id)));
    return map;
  }, [tree]);

  const openEntry = useCallback(async (id: string, version?: number) => {
    setEntryLoading(true);
    setViewingVersion(version ?? null);
    try {
      setEntry(version != null ? await wikiService.historyContent(id, version) : await wikiService.entry(id));
    } catch (e: any) {
      toast.showError(e.message || '加载条目失败');
    } finally {
      setEntryLoading(false);
    }
  }, []);

  const openByTitle = useCallback((title: string) => {
    const id = titleIndex.get(title);
    if (id) openEntry(id);
    else toast.showInfo(`未找到条目「${title}」`);
  }, [titleIndex, openEntry]);

  const openHistory = async () => {
    if (!entry) return;
    try {
      setHistory(await wikiService.history(entry.id));
      setHistoryOpen(true);
    } catch (e: any) {
      toast.showError(e.message || '加载版本历史失败');
    }
  };

  const doRecompile = async () => {
    if (!entry) return;
    try {
      await wikiService.recompile(entry.id);
      toast.showSuccess('已触发重编译，完成后条目将自动更新');
      loadTree();
    } catch (e: any) {
      toast.showError(e.message || '重编译失败');
    }
  };

  const filteredGroups = useMemo(() => {
    if (!tree) return [];
    const kw = filter.trim().toLowerCase();
    if (!kw) return tree.groups;
    return tree.groups
      .map(g => ({ ...g, pages: g.pages.filter(p => p.title.toLowerCase().includes(kw)) }))
      .filter(g => g.pages.length > 0);
  }, [tree, filter]);

  /** markdown 渲染器（拦截 wikilink:// 实现条目互跳） */
  const markdownComponents = useMemo(() => ({
    a: ({ href, children }: any) => {
      if (typeof href === 'string' && href.startsWith(WIKI_LINK_PROTOCOL)) {
        const title = decodeURIComponent(href.slice(WIKI_LINK_PROTOCOL.length));
        return (
          <button
            className="font-bold text-blue-600 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-800"
            onClick={() => openByTitle(title)}
          >
            {children}
          </button>
        );
      }
      return <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline">{children}</a>;
    },
  }), [openByTitle]);

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size={24} /></div>;
  }

  const pages = tree?.groups.flatMap(g => g.pages) ?? [];
  if (pages.length === 0 && !filter) {
    return (
      <EmptyState
        icon={<BookOpen size={24} />}
        title="Wiki 尚未生成"
        desc={tree?.guidance || '文档入库并完成编译后，这里会沉淀出可浏览的百科条目。'}
      />
    );
  }

  return (
    <div className="flex min-h-[480px] gap-4">
      {/* 导航树 */}
      <div className={`${THEME.card} w-64 flex-shrink-0 p-3`}>
        <div className="relative mb-3">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
          <input
            className={`${THEME.input} w-full !pl-8`}
            placeholder="筛选条目…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {filteredGroups.map(group => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[11px] font-black uppercase tracking-widest text-neutral-400">{group.label}</div>
              <div className="space-y-0.5">
                {group.pages.map(page => (
                  <button
                    key={page.id}
                    onClick={() => openEntry(page.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                      entry?.id === page.id ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{page.title}</span>
                    {page.dirty && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${entry?.id === page.id ? 'bg-amber-300' : 'bg-amber-400'}`} title="待更新" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 && <div className="px-2 py-6 text-center text-xs text-neutral-400">无匹配条目</div>}
        </div>
      </div>

      {/* 条目正文 */}
      <div className={`${THEME.card} min-w-0 flex-1 p-6`}>
        {entryLoading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : !entry ? (
          <EmptyState icon={<BookOpen size={24} />} title="选择左侧条目开始浏览" desc="条目由知识库文档自动编译生成，支持互链跳转与出处回溯。" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-4">
              <h2 className="text-lg font-black tracking-tight text-neutral-900">{entry.title}</h2>
              <Badge tone="blue">{WIKI_PAGE_TYPE_LABELS[entry.pageType] ?? entry.pageType}</Badge>
              <Badge tone="neutral">v{entry.version}</Badge>
              {entry.dirty && <Badge tone="warning">待更新</Badge>}
              {viewingVersion != null && <Badge tone="amber">正在查看历史版本 v{viewingVersion}</Badge>}
              <div className="ml-auto flex items-center gap-1">
                {viewingVersion != null && (
                  <button className={THEME.button.secondary} onClick={() => openEntry(entry.id)}>回到当前版本</button>
                )}
                <button className={THEME.button.secondary} onClick={openHistory}>
                  <History size={13} className="mr-1 inline" /> 历史
                </button>
                {canEdit && (
                  <button className={THEME.button.primary} onClick={doRecompile}>
                    <RefreshCw size={13} className="mr-1 inline" /> 重编译
                  </button>
                )}
              </div>
            </div>

            <div className="prose prose-sm max-w-none font-prose text-neutral-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {renderWithLinks(entry.contentMd || '')}
              </ReactMarkdown>
            </div>

            {(entry.sourceRefs?.length ?? 0) > 0 && (
              <div className="mt-6 border-t border-neutral-100 pt-4">
                <div className={THEME.label}>出处（点击回原文块）</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.sourceRefs!.map((ref, i) => (
                    <button
                      key={`${ref.chunkId}-${i}`}
                      className="rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-neutral-600 transition-all hover:border-black hover:text-black"
                      onClick={() => setPreview({ docId: ref.docId, docName: ref.docName, chunkId: ref.chunkId })}
                    >
                      {ref.docName || '文档'}{ref.pageNo != null ? ` · 第 ${ref.pageNo} 页` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={historyOpen} title="版本历史" onClose={() => setHistoryOpen(false)}>
        {history.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400">暂无历史版本</div>
        ) : (
          <div className="space-y-2">
            {history.map(v => (
              <button
                key={v.version}
                className="flex w-full items-center justify-between rounded-xl border border-neutral-100 px-4 py-2.5 text-left transition-colors hover:border-black"
                onClick={() => { setHistoryOpen(false); if (entry) openEntry(entry.id, v.version); }}
              >
                <span className="text-[13px] font-bold">v{v.version}</span>
                <span className="text-[11px] text-neutral-400">{formatDateTime(v.createTime)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <ChunkPreviewDrawer
        open={!!preview}
        docId={preview?.docId ?? null}
        docName={preview?.docName}
        highlightChunkId={preview?.chunkId}
        onClose={() => setPreview(null)}
      />
    </div>
  );
};

export default WikiTab;
