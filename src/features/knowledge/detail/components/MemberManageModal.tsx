import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import { knowledgeAppService } from '../../../../shared/services/knowledge';
import { userService } from '../../../../shared/services/system.service';
import type { KnowledgeMember } from '../../../../shared/types/knowledge';
import type { SysUser } from '../../../../shared/types';
import { ROLE_LABELS, type KnowledgeRole } from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import { avatarLetter, avatarTone } from '../../../../shared/utils/avatar';
import { useToast } from '../../../../shared/components/ui/ToastManager';
import Modal from '../../../../shared/components/ui/Modal';
import Select from '../../../../shared/components/ui/Select';
import Spinner from '../../../../shared/components/ui/Spinner';
import Badge from '../../../../shared/components/ui/Badge';

/** 成员编辑行（草稿行 userId 为空串，保存时忽略；existing=服务端已有行） */
interface MemberRow {
  key: string;
  userId: string;
  /** 展示名快照（已有行来自 userName 填充，草稿行来自用户选择） */
  display: string;
  /** @用户名副行（草稿行选定后有值） */
  username?: string;
  role: KnowledgeRole;
  existing: boolean;
  /** 属主行：角色与删除锁定（后端同样强制） */
  owner: boolean;
}

/** 可授予的角色枚举（OWNER 由后端 21022 禁止手工授予，不在选项内） */
const ASSIGNABLE_ROLES: { value: KnowledgeRole; label: string }[] = [
  { value: 'VIEWER', label: ROLE_LABELS.VIEWER },
  { value: 'EDITOR', label: ROLE_LABELS.EDITOR },
];

/** 成员下拉选择器（草稿行用）：按钮 + 浮层，浮层内模糊搜索，客户端过滤 */
const UserPicker: React.FC<{
  row: MemberRow;
  users: SysUser[];
  loading: boolean;
  /** 其他行已占用的用户 ID（同一用户不重复出现） */
  excludeIds: Set<string>;
  onPick: (user: SysUser) => void;
}> = ({ row, users, loading, excludeIds, onPick }) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return users.filter(u => {
      if (excludeIds.has(u.id)) return false;
      if (!kw) return true;
      return u.username?.toLowerCase().includes(kw) || u.nickname?.toLowerCase().includes(kw);
    });
  }, [users, excludeIds, keyword]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${THEME.input} flex w-full items-center justify-between gap-2 text-left hover:border-neutral-300`}
      >
        {row.userId ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black ${avatarTone(row.username || row.display)}`}>
              {avatarLetter(row.display)}
            </span>
            <span className="truncate text-[13px] font-bold text-neutral-800">{row.display}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-neutral-400">{loading ? '加载用户…' : '搜索并选择用户…'}</span>
        )}
        <ChevronDown size={14} className={`flex-shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`${THEME.dropdown} absolute left-0 right-0 top-full z-50 mt-1.5 p-1.5`}>
          <div className="relative mb-1.5">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              autoFocus
              className="w-full rounded-lg border border-neutral-200/70 bg-white py-1.5 pl-8 pr-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-black/8"
              placeholder="模糊搜索用户名 / 昵称…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {filtered.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onPick(u); setOpen(false); setKeyword(''); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100"
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-black ${avatarTone(u.username)}`}>
                  {avatarLetter(u.nickname || u.username)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-neutral-700">{u.nickname || u.username}</span>
                  <span className="block truncate text-[11px] text-neutral-400">@{u.username}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-5 text-center text-xs text-neutral-400">
                {loading ? '加载中…' : keyword ? '无匹配用户' : '暂无可添加用户'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface MemberManageModalProps {
  appId: string;
  /** 当前成员（打开时快照进编辑行） */
  members: KnowledgeMember[];
  open: boolean;
  onClose: () => void;
  /** 保存完成后回传（父级重新拉取成员列表） */
  onSaved: () => void;
}

/**
 * 成员管理弹窗：编辑表格一体（增/改角色/删除，保存时按 diff 批量提交）。
 * 行结构 = 成员下拉（模糊搜索）+ 角色枚举 + 删除；底部「添加一行」追加草稿行。
 */
const MemberManageModal: React.FC<MemberManageModalProps> = ({ appId, members, open, onClose, onSaved }) => {
  const toast = useToast();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [allUsers, setAllUsers] = useState<SysUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftSeq = useRef(0);

  // 打开时：成员快照进行 + 拉全量活跃用户（候选客户端过滤）
  useEffect(() => {
    if (!open) return;
    setRows(members.map(m => ({
      key: m.id,
      userId: m.userId,
      display: m.userName || m.userId,
      role: m.role,
      existing: true,
      owner: m.role === 'OWNER',
    })));
    setSaving(false);
    setUsersLoading(true);
    userService.listActive()
      .then(res => setAllUsers(res.data ?? []))
      .catch((e: any) => {
        setAllUsers([]);
        toast.showError(e.message || '加载用户列表失败');
      })
      .finally(() => setUsersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addRow = () => {
    draftSeq.current += 1;
    setRows(prev => [...prev, { key: `draft-${draftSeq.current}`, userId: '', display: '', role: 'VIEWER', existing: false, owner: false }]);
  };

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

  const setRowRole = (key: string, role: KnowledgeRole) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, role } : r)));

  const pickUser = (key: string, user: SysUser) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, userId: user.id, display: user.nickname || user.username, username: user.username } : r)));

  /** 待提交变更：删除 + 角色变更 + 新增（空草稿行忽略） */
  const pending = useMemo(() => {
    const originalByUserId = new Map(members.map(m => [m.userId, m]));
    const keptUserIds = new Set(rows.filter(r => r.userId).map(r => r.userId));
    const deletions = members.filter(m => m.role !== 'OWNER' && !keptUserIds.has(m.userId));
    const roleChanges = rows.filter(r => r.existing && !r.owner && originalByUserId.get(r.userId)?.role !== r.role);
    const additions = rows.filter(r => !r.existing && r.userId);
    return { deletions, roleChanges, additions, count: deletions.length + roleChanges.length + additions.length };
  }, [rows, members]);

  /** 批量提交：依次执行删除/改角色/新增，汇总成败 */
  const save = async () => {
    if (pending.count === 0 || saving) return;
    setSaving(true);
    const failed: string[] = [];
    for (const m of pending.deletions) {
      try { await knowledgeAppService.removeMember(appId, m.userId); }
      catch (e: any) { failed.push(`移除 ${m.userName || m.userId}：${e.message || '失败'}`); }
    }
    for (const r of pending.roleChanges) {
      try { await knowledgeAppService.changeMemberRole(appId, r.userId, r.role); }
      catch (e: any) { failed.push(`调整 ${r.display}：${e.message || '失败'}`); }
    }
    for (const r of pending.additions) {
      try { await knowledgeAppService.addMember(appId, r.userId, r.role); }
      catch (e: any) { failed.push(`添加 ${r.display}：${e.message || '失败'}`); }
    }
    setSaving(false);
    if (failed.length === 0) {
      toast.showSuccess('成员变更已保存');
    } else {
      toast.showWarning(`部分失败：${failed[0]}${failed.length > 1 ? ` 等 ${failed.length} 项` : ''}`);
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="成员管理"
      width="max-w-xl"
      onClose={onClose}
      footer={
        <>
          <button className={THEME.button.secondary} onClick={onClose}>取消</button>
          <button className={THEME.button.primary} onClick={save} disabled={pending.count === 0 || saving}>
            {saving ? '保存中…' : `保存变更${pending.count > 0 ? `（${pending.count}）` : ''}`}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {/* 表头 */}
        <div className="grid grid-cols-[1fr_112px_36px] items-center gap-2 px-1">
          <span className={THEME.label}>成员</span>
          <span className={THEME.label}>角色</span>
          <span />
        </div>

        {/* 编辑行（min-h 保证弹窗初始高度，下拉浮层有展开空间） */}
        <div className="max-h-[46vh] min-h-[260px] space-y-1.5 overflow-y-auto pr-0.5">
          {rows.map(row => (
            <div key={row.key} className="grid grid-cols-[1fr_112px_36px] items-center gap-2">
              {row.existing ? (
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50/50 px-3 py-2">
                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black ${avatarTone(row.userId)}`}>
                    {avatarLetter(row.display)}
                  </span>
                  <span className="truncate text-[13px] font-bold text-neutral-800">{row.display}</span>
                </div>
              ) : (
                <UserPicker
                  row={row}
                  users={allUsers}
                  loading={usersLoading}
                  excludeIds={new Set(rows.filter(r => r.key !== row.key && r.userId).map(r => r.userId))}
                  onPick={u => pickUser(row.key, u)}
                />
              )}

              {row.owner ? (
                <div className="flex justify-center"><Badge tone="black">{ROLE_LABELS.OWNER}</Badge></div>
              ) : (
                <Select
                  value={row.role}
                  onChange={v => setRowRole(row.key, v as KnowledgeRole)}
                  options={ASSIGNABLE_ROLES}
                />
              )}

              {row.owner ? (
                <span />
              ) : (
                <button
                  type="button"
                  className={`${THEME.buttonIcon} !h-8 !w-8 hover:!bg-red-50 hover:!text-red-600`}
                  title={row.existing ? '移除该成员（保存时生效）' : '删除该行'}
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          {rows.length === 0 && (
            <div className="py-8 text-center text-xs text-neutral-400">暂无成员，点击下方添加</div>
          )}
        </div>

        {/* 添加一行 */}
        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-2 text-[12px] font-bold text-neutral-400 transition-all hover:border-black hover:text-black"
        >
          <Plus size={13} /> 添加一行
        </button>
      </div>
    </Modal>
  );
};

export default MemberManageModal;
