import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Pencil, RefreshCw, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { knowledgeDocsService } from '../../../../shared/services/knowledge';
import type { DocProgress, KnowledgeApp, KnowledgeDoc } from '../../../../shared/types/knowledge';
import {
  DOC_STATUS_META, DocProcessStatus, docStatusCode, docStatusMeta, GRAPH_STATUS_LABELS, PROCESS_PHASE_LABELS, roleAtLeast,
} from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import { useConfirm } from '../../../../shared/hooks/useConfirm';
import Badge from '../../../../shared/components/ui/Badge';
import EmptyState from '../../../../shared/components/ui/EmptyState';
import Pagination from '../../../../shared/components/ui/Pagination';
import Spinner from '../../../../shared/components/ui/Spinner';
import Modal from '../../../../shared/components/ui/Modal';
import Select from '../../../../shared/components/ui/Select';
import { formatDateTime } from '../../../../shared/utils/date';
import DocTypeIcon from '../../../../shared/components/DocTypeIcon';
import ChunkPreviewDrawer from '../components/ChunkPreviewDrawer';

/** 引擎错误信息转用户可读文案：剥离 HTTP/JSON 技术细节，保留业务原因 */
const displayError = (raw?: string | null): string | null => {
  if (!raw) return null;
  // 引擎 4xx/5xx 包装形态（如 "Unexpected status code: [404], response body: {...message...}"）
  const msgMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (msgMatch) return msgMatch[1];
  // "Unexpected status code: [xxx]" 等引擎接入错误
  if (/status code/i.test(raw)) return '内容引擎处理失败（服务可能未就绪或配置有误）';
  // 截断兜底（JSON 片段/长堆栈）
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
};

/** 判断是否为引擎接入类失败（状态栏给出可重试提示） */
const isEngineDownError = (raw?: string | null): boolean =>
  !!raw && (/status code/i.test(raw) || /不可用|超时|未就绪|解析失败|连接失败/i.test(raw));

const PAGE_SIZE = 10;

interface DocumentsTabProps {
  app: KnowledgeApp;
}

/** 文档管理 tab：列表 + 实时进度 + 上传/重试/重灌/删除 + 分块预览 */
const DocumentsTab: React.FC<DocumentsTabProps> = ({ app }) => {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const canEdit = roleAtLeast(app.myRole, 'EDITOR');

  const [condition, setCondition] = useState({ page: 1, size: PAGE_SIZE, name: undefined as string | undefined, processStatus: undefined as number | undefined });
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<string, DocProgress>>({});
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDoc | null>(null);
  const [renaming, setRenaming] = useState<KnowledgeDoc | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseControllers = useRef<Map<string, AbortController>>(new Map());

  // silent：后台刷新（如 SSE 终态后的状态同步），不闪全表 Spinner
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const page = await knowledgeDocsService.page({ ...condition, knowledgeId: app.id });
      const records = page.records ?? [];
      setDocs(records);
      setTotal(page.totalRow ?? 0);
      // 列表快照已到终态的文档，实时进度缓存失去意义（列表即为权威状态），清理以免长期遮蔽
      setProgressMap(prev => {
        const next = { ...prev };
        let changed = false;
        records.forEach(d => {
          if (next[d.id] && docStatusMeta(d.processStatus).terminal) {
            delete next[d.id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    } catch (e: any) {
      toast.showError(e.message || '加载文档失败');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [condition, app.id]);

  useEffect(() => { load(); }, [load]);

  // 处理中文档的 SSE 进度订阅：列表变化时增量建立/回收
  useEffect(() => {
    // 实时进度已到终态的文档不再重订阅：若列表快照因后端状态未落库仍显示处理中，
    //  terminal→刷新→重订阅→又 terminal 会形成无限循环（列表闪烁、接口被反复调用）
    const active = docs.filter(d => {
      const live = progressMap[d.id];
      if (live?.terminal) return false;
      return docStatusMeta(live ? live.processStatus : d.processStatus).active;
    });
    const activeIds = new Set(active.map(d => d.id));

    sseControllers.current.forEach((controller, id) => {
      if (!activeIds.has(id)) {
        controller.abort();
        sseControllers.current.delete(id);
      }
    });

    active.forEach(doc => {
      if (sseControllers.current.has(doc.id)) return;
      const controller = knowledgeDocsService.subscribeProgress(doc.id, {
        onEvent: progress => {
          setProgressMap(prev => ({ ...prev, [doc.id]: progress }));
          if (progress.terminal) {
            sseControllers.current.get(doc.id)?.abort();
            sseControllers.current.delete(doc.id);
            // 终态后静默刷新列表以同步权威状态（不闪全表 Spinner）
            setTimeout(() => load({ silent: true }), 300);
          }
        },
        onError: () => {
          sseControllers.current.delete(doc.id);
        },
      });
      sseControllers.current.set(doc.id, controller);
    });
  }, [docs, load, progressMap]);

  // 卸载时全部取消
  useEffect(() => () => {
    sseControllers.current.forEach(c => c.abort());
    sseControllers.current.clear();
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    for (const file of Array.from(files)) {
      try {
        await knowledgeDocsService.upload(file, app.id);
        ok++;
      } catch (e: any) {
        fail++;
        toast.showError(`「${file.name}」上传失败：${e.message || '未知错误'}`);
      }
    }
    setUploading(false);
    if (ok > 0) toast.showSuccess(`已提交 ${ok} 篇文档摄入`);
    if (fail > 0 && ok === 0) return;
    load();
  };

  const doRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    try {
      await knowledgeDocsService.rename(renaming.id, renameValue.trim());
      toast.showSuccess('已重命名');
      setRenaming(null);
      load();
    } catch (e: any) {
      toast.showError(e.message || '重命名失败');
    }
  };

  /** 重新进入处理流程前，清掉该文档的实时进度缓存，否则会因终态标记残留而不再订阅新进度 */
  const clearLiveProgress = (docId: string) => {
    setProgressMap(prev => {
      if (!prev[docId]) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const doRetry = async (doc: KnowledgeDoc) => {
    try {
      await knowledgeDocsService.retry(doc.id);
      toast.showSuccess('已重新提交');
      clearLiveProgress(doc.id);
      load();
    } catch (e: any) {
      toast.showError(e.message || '重试失败');
    }
  };

  const doReindex = async (doc: KnowledgeDoc) => {
    const ok = await confirm({
      title: '重建索引',
      message: `「${doc.name}」将重新走完整摄入管线（解析→分块→向量），期间旧索引被替换。确认重建？`,
      type: 'warning',
      confirmText: '重建',
    });
    if (!ok) return;
    try {
      await knowledgeDocsService.reindex(doc.id);
      toast.showSuccess('已开始重建索引');
      clearLiveProgress(doc.id);
      load();
    } catch (e: any) {
      toast.showError(e.message || '重灌失败');
    }
  };

  const doDelete = async (doc: KnowledgeDoc) => {
    const ok = await confirm({
      title: '删除文档',
      message: `删除「${doc.name}」将级联删除其分块、向量与图谱引用。确认删除？`,
      type: 'error',
      confirmText: '删除',
    });
    if (!ok) return;
    try {
      await knowledgeDocsService.remove(doc.id);
      toast.showSuccess('已删除');
      setSelected(prev => { const next = new Set(prev); next.delete(doc.id); return next; });
      load();
    } catch (e: any) {
      toast.showError(e.message || '删除失败');
    }
  };

  const doBatchDelete = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: '批量删除',
      message: `将删除选中的 ${selected.size} 篇文档及其全部索引数据。确认删除？`,
      type: 'error',
      confirmText: `删除 ${selected.size} 篇`,
    });
    if (!ok) return;
    try {
      const result = await knowledgeDocsService.removeBatch([...selected]);
      if (result.failureCount > 0) {
        const firstError = result.items.find(i => !i.success)?.error;
        toast.showWarning(`成功 ${result.successCount} 篇，失败 ${result.failureCount} 篇${firstError ? `：${firstError}` : ''}`);
      } else {
        toast.showSuccess(`已删除 ${result.successCount} 篇文档`);
      }
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.showError(e.message || '批量删除失败');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** 文档行展示用状态：优先 SSE 实时进度，否则取列表快照（状态码统一规整，兼容旧后端枚举名 wire） */
  const displayOf = (doc: KnowledgeDoc): { status: DocProcessStatus; phase?: string | null; processed?: number; total?: number; errorMsg?: string | null; graphStatus?: string } => {
    const live = progressMap[doc.id];
    return live
      ? { status: docStatusCode(live.processStatus), phase: live.phase, processed: live.processed, total: live.total, errorMsg: live.errorMsg, graphStatus: live.graphStatus }
      : { status: docStatusCode(doc.processStatus), phase: doc.processPhase, processed: doc.processedChunks, total: doc.totalChunks, errorMsg: doc.errorMsg, graphStatus: doc.graphStatus };
  };

  return (
    <div className="space-y-4">
      {/* 工具栏不换行：搜索框可收缩（min-w-0），筛选与操作按钮保持右侧 */}
      <div className="flex items-center gap-2">
        <input
          className={`${THEME.input} w-52 min-w-0`}
          placeholder="按文档名搜索…"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const v = (e.target as HTMLInputElement).value;
              setCondition(c => ({ ...c, name: v || undefined, page: 1 }));
            }
          }}
        />
        <Select
          className="w-36"
          value={condition.processStatus?.toString() ?? ''}
          onChange={v => setCondition(c => ({ ...c, processStatus: v === '' ? undefined : Number(v), page: 1 }))}
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(DOC_STATUS_META).map(([code, meta]) => ({ value: code, label: meta.label })),
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          {canEdit && selected.size > 0 && (
            <button className={`${THEME.button.danger}`} onClick={doBatchDelete}>
              <Trash2 size={13} /> 删除选中（{selected.size}）
            </button>
          )}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.txt,.html,.htm"
                onChange={e => { upload(e.target.files); e.target.value = ''; }}
              />
              <button
                className={`${THEME.button.primary}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || app.disabled}
                title={app.disabled ? '知识库已停用，不可上传' : undefined}
              >
                {uploading ? <Spinner size={14} className="text-white" /> : <Upload size={14} strokeWidth={3} />}
                上传文档
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="暂无文档"
          desc={canEdit ? '上传文档后将自动完成解析、分块与向量化，可实时跟踪处理进度。' : '该知识库还没有文档。'}
        />
      ) : (
        <>
          <div className={`${THEME.card} overflow-hidden`}>
            <table className={THEME.table}>
              <thead className={THEME.tableHead}>
                <tr>
                  {canEdit && <th className={`${THEME.tableCell} w-10`}></th>}
                  <th className={THEME.tableCell}>文档</th>
                  <th className={`${THEME.tableCell} w-56`}>处理状态</th>
                  <th className={`${THEME.tableCell} w-28`}>分块</th>
                  <th className={`${THEME.tableCell} w-40`}>上传时间</th>
                  <th className={`${THEME.tableCell} w-44 text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const view = displayOf(doc);
                  const meta = docStatusMeta(view.status);
                  const pct = view.total && view.total > 0 ? Math.min(100, Math.round(((view.processed ?? 0) / view.total) * 100)) : undefined;
                  return (
                    <tr key={doc.id} className={THEME.tableRow}>
                      {canEdit && (
                        <td className={THEME.tableCell}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-neutral-300 accent-black"
                            checked={selected.has(doc.id)}
                            onChange={() => toggleSelect(doc.id)}
                          />
                        </td>
                      )}
                      <td className={THEME.tableCell}>
                        <div className="flex max-w-64 items-center gap-2">
                          <DocTypeIcon name={doc.name} fileKey={doc.fileKey} />
                          <span className="truncate font-bold text-neutral-800" title={doc.name}>{doc.name}</span>
                        </div>
                        {view.errorMsg && (
                          <div className="mt-0.5 max-w-64 truncate text-[11px] font-medium text-red-500" title={view.errorMsg}>
                            {displayError(view.errorMsg)}
                            {isEngineDownError(view.errorMsg) && canEdit && '（可重试）'}
                          </div>
                        )}
                      </td>
                      <td className={THEME.tableCell}>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {view.phase && PROCESS_PHASE_LABELS[view.phase] && (meta.active || view.phase === 'QUEUED') && (
                              <span className="text-[11px] font-semibold text-neutral-400">
                                {view.phase === 'QUEUED' ? '排队中（内存紧张）' : `${PROCESS_PHASE_LABELS[view.phase]}阶段`}
                              </span>
                            )}
                            {view.graphStatus && view.graphStatus !== 'NONE' && (
                              <Badge tone={view.graphStatus === 'PARTIAL' ? 'warning' : view.graphStatus === 'FAILED' ? 'error' : 'teal'}>
                                图谱 {GRAPH_STATUS_LABELS[view.graphStatus]}
                              </Badge>
                            )}
                          </div>
                          {meta.active && pct !== undefined && (
                            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-100">
                              <div className="h-full rounded-full bg-black transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`${THEME.tableCell} font-semibold text-neutral-500`}>
                        {view.total ? `${view.processed ?? 0}/${view.total}` : '—'}
                      </td>
                      <td className={`${THEME.tableCell} text-[12px] text-neutral-400`}>{formatDateTime(doc.createTime)}</td>
                      <td className={`${THEME.tableCell} text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <button className={THEME.buttonIcon} title="分块预览" onClick={() => setPreviewDoc(doc)}>
                            <FileText size={15} />
                          </button>
                          {canEdit && view.status === DocProcessStatus.FAILED && (
                            <button className={THEME.buttonIcon} title="失败重试" onClick={() => doRetry(doc)}>
                              <RotateCcw size={15} />
                            </button>
                          )}
                          {canEdit && view.status === DocProcessStatus.COMPLETED && (
                            <button className={THEME.buttonIcon} title="重建索引" onClick={() => doReindex(doc)}>
                              <RefreshCw size={15} />
                            </button>
                          )}
                          {canEdit && (
                            <button className={THEME.buttonIcon} title="重命名" onClick={() => { setRenaming(doc); setRenameValue(doc.name); }}>
                              <Pencil size={15} />
                            </button>
                          )}
                          {canEdit && (
                            <button className={`${THEME.buttonIcon} hover:!bg-red-50 hover:!text-red-600`} title="删除" onClick={() => doDelete(doc)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={condition.page} size={PAGE_SIZE} total={total} onChange={page => setCondition(c => ({ ...c, page }))} />
        </>
      )}

      <ChunkPreviewDrawer
        open={!!previewDoc}
        docId={previewDoc?.id ?? null}
        docName={previewDoc?.name}
        onClose={() => setPreviewDoc(null)}
      />

      <Modal
        open={!!renaming}
        title="重命名文档"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <button className={THEME.button.secondary} onClick={() => setRenaming(null)}>取消</button>
            <button className={THEME.button.primary} onClick={doRename}>保存</button>
          </>
        }
      >
        <input className={`${THEME.input} w-full`} value={renameValue} onChange={e => setRenameValue(e.target.value)} maxLength={512} />
      </Modal>

      {ConfirmDialog}
    </div>
  );
};

export default DocumentsTab;
