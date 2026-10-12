import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Layers, Lock, Network, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { knowledgeAppService } from '../../shared/services/knowledge';
import type { KnowledgeApp, KnowledgeAppCondition } from '../../shared/types/knowledge';
import { KB_MODES, KB_MODE_LABELS, ROLE_LABELS, type KnowledgeMode } from '../../shared/constants/knowledge';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';
import { useConfirm } from '../../shared/hooks/useConfirm';
import Modal from '../../shared/components/ui/Modal';
import Badge from '../../shared/components/ui/Badge';
import EmptyState from '../../shared/components/ui/EmptyState';
import Pagination from '../../shared/components/ui/Pagination';
import Select from '../../shared/components/ui/Select';
import Spinner from '../../shared/components/ui/Spinner';
import { formatDateTime } from '../../shared/utils/date';

const PAGE_SIZE = 12;

/** 新建/编辑知识库表单弹窗 */
const AppFormModal: React.FC<{
  open: boolean;
  editing?: KnowledgeApp | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, editing, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');
  const [mode, setMode] = useState<KnowledgeMode>('PRIVATE');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setRemark(editing?.remark ?? '');
      setMode(editing?.mode ?? 'PRIVATE');
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) {
      toast.showWarning('请填写知识库名称');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await knowledgeAppService.update(editing.id, { name: name.trim(), remark, mode });
        toast.showSuccess('知识库已更新');
      } else {
        await knowledgeAppService.create({ name: name.trim(), remark, mode });
        toast.showSuccess('知识库已创建');
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
      title={editing ? '编辑知识库' : '新建知识库'}
      onClose={onClose}
      footer={
        <>
          <button className={THEME.button.secondary} onClick={onClose}>取消</button>
          <button className={THEME.button.primary} onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={THEME.label}>名称</label>
          <input className={`${THEME.input} mt-1.5 w-full`} value={name} onChange={e => setName(e.target.value)} placeholder="如：雷达部署规范库" maxLength={128} />
        </div>
        <div>
          <label className={THEME.label}>描述</label>
          <textarea className={`${THEME.input} mt-1.5 min-h-[80px] w-full`} value={remark} onChange={e => setRemark(e.target.value)} placeholder="这个知识库装什么、给谁用" maxLength={512} />
        </div>
        <div>
          <label className={THEME.label}>可见性</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {KB_MODES.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  mode === m.value ? 'border-black bg-black text-white shadow-lg' : 'border-neutral-200 bg-white/80 hover:border-neutral-400'
                }`}
              >
                <div className="text-[13px] font-bold">{m.label}</div>
                <div className={`mt-0.5 text-[11px] ${mode === m.value ? 'text-white/70' : 'text-neutral-400'}`}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

const MODE_ICONS: Record<string, React.ReactNode> = {
  PRIVATE: <Lock size={12} />,
  TEAM: <Users size={12} />,
  PUBLIC: <Database size={12} />,
};

/** 知识库列表页（/knowledge） */
const KnowledgeListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [condition, setCondition] = useState<KnowledgeAppCondition>({ page: 1, size: PAGE_SIZE });
  const [data, setData] = useState<{ records: KnowledgeApp[]; totalRow: number }>({ records: [], totalRow: 0 });
  const [loading, setLoading] = useState(true);
  const [nameFilter, setNameFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeApp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await knowledgeAppService.page(condition);
      setData({ records: page.records ?? [], totalRow: page.totalRow ?? 0 });
    } catch (e: any) {
      toast.showError(e.message || '加载知识库失败');
    } finally {
      setLoading(false);
    }
  }, [condition]);

  useEffect(() => { load(); }, [load]);

  const remove = async (app: KnowledgeApp) => {
    const ok = await confirm({
      title: '删除知识库',
      message: `删除「${app.name}」将级联删除其全部文档、本体、Wiki 与成员配置，且不可恢复。确认删除？`,
      type: 'error',
      confirmText: '确认删除',
    });
    if (!ok) return;
    try {
      await knowledgeAppService.remove(app.id);
      toast.showSuccess('已删除');
      load();
    } catch (e: any) {
      toast.showError(e.message || '删除失败');
    }
  };

  return (
    <div className={THEME.page}>
      <div className={THEME.pageHeader}>
        <div>
          <h1 className={THEME.pageTitle}>知识库</h1>
          <p className={THEME.pageDesc}>文档资产、本体、Wiki 与图谱的统一管理入口</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className={`${THEME.input} w-56`}
            placeholder="按名称搜索…"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setCondition(c => ({ ...c, name: nameFilter || undefined, page: 1 }))}
          />
          <Select
            className="w-36"
            value={condition.mode ?? ''}
            onChange={v => setCondition(c => ({ ...c, mode: (v || undefined) as KnowledgeMode | undefined, page: 1 }))}
            options={[{ value: '' as const, label: '全部可见性' }, ...KB_MODES.map(m => ({ value: m.value as string, label: m.label }))]}
          />
          <button className={`${THEME.button.primary}`} onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus size={14} strokeWidth={3} /> 新建知识库
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : data.records.length === 0 ? (
        <EmptyState
          icon={<Database size={24} />}
          title="暂无知识库"
          desc="创建第一个知识库，上传文档后即可检索、对话，并逐步建设本体、Wiki 与图谱。"
          action={
            <button className={THEME.button.primary} onClick={() => { setEditing(null); setModalOpen(true); }}>新建知识库</button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.records.map(app => (
              <div
                key={app.id}
                onClick={() => navigate(`/knowledge/${app.id}`)}
                className={`${THEME.card} ${THEME.cardHover} group relative cursor-pointer p-5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white shadow-lg">
                    <Database size={20} strokeWidth={1.75} />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {app.disabled && <Badge tone="error">已停用</Badge>}
                    {app.graphEnabled && <Badge tone="teal"><Network size={10} /> 图谱</Badge>}
                    <Badge tone="neutral">{MODE_ICONS[app.mode]} {KB_MODE_LABELS[app.mode] ?? app.mode}</Badge>
                    {app.myRole && <Badge tone="black">{ROLE_LABELS[app.myRole]}</Badge>}
                  </div>
                </div>
                <h3 className="mt-4 truncate text-base font-black tracking-tight text-neutral-900 group-hover:text-black">{app.name}</h3>
                <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-xs font-medium leading-relaxed text-neutral-500">
                  {app.remark || '暂无描述'}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-[11px] font-semibold text-neutral-400">
                  <span className="flex items-center gap-1"><Layers size={12} /> {app.docCount ?? 0} 篇文档</span>
                  <span>{formatDateTime(app.createTime)}</span>
                </div>
                {/* 所有者操作：悬停浮出图标按钮（右上），与全局 icon 按钮一致 */}
                {app.myRole === 'OWNER' && (
                  <div className="absolute right-3 top-3 flex items-center gap-1 rounded-2xl border border-neutral-100 bg-white/90 p-1 opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover:opacity-100">
                    <button
                      className={THEME.buttonIcon}
                      title="编辑知识库"
                      onClick={e => { e.stopPropagation(); setEditing(app); setModalOpen(true); }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className={`${THEME.buttonIcon} hover:!bg-red-50 hover:!text-red-600`}
                      title="删除知识库"
                      onClick={e => { e.stopPropagation(); remove(app); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination
            page={condition.page ?? 1}
            size={PAGE_SIZE}
            total={data.totalRow}
            onChange={page => setCondition(c => ({ ...c, page }))}
            className="pt-2"
          />
        </>
      )}

      <AppFormModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSaved={load} />
      {ConfirmDialog}
    </div>
  );
};

export default KnowledgeListPage;
