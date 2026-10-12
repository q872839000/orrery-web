

import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, MoreHorizontal, UserPlus, Search, Loader2, Trash2, Edit, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../shared/components/ui/Button';
import { userService } from '../../shared/services/system.service';
import { SysUser } from '../../shared/types';
import { formatDateTime } from '../../shared/utils/date';
import { useToast } from '../../shared/components/ui/ToastManager';
import { THEME } from '../../shared/styles/theme';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<SysUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [current, setCurrent] = useState(1);
  const [size] = useState(10);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteNickname, setInviteNickname] = useState('');
  const { showSuccess, showError, showWarning, showConfirm } = useToast();
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteGender, setInviteGender] = useState(0);
  const [inviteRemark, setInviteRemark] = useState('');
  const [editingUser, setEditingUser] = useState<SysUser | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.page({ 
        current, 
        size, 
        name: search 
      });
      setUsers(response.data.records || []);
      setTotal(response.data.totalRow || 0);
      setTotalPages(response.data.totalPage || 1);
    } catch (error) {
      console.error('加载用户列表失败', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [current, search]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (!isComposing) {
      setSearch(value);
      setCurrent(1);
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
    setSearch(e.currentTarget.value);
    setCurrent(1);
  };

  const handleDelete = async (id: string) => {
    showConfirm('确定要删除该用户吗？删除后无法恢复。', async () => {
      try {
        const response = await userService.remove(id);
        showSuccess('用户删除成功');
        fetchUsers();
      } catch (error: any) {
        console.error('删除用户失败', error);
        showError(error.message || '删除用户失败');
      }
    }, {
      type: 'warning',
      title: '删除确认',
      confirmText: '删除',
      confirmButtonClass: 'bg-red-500 text-white hover:bg-red-600'
    });
  };

  const handleToggleStatus = async (user: SysUser) => {
    try {
      const response = await userService.updateStatus(user.id.toString(), user.status === 1 ? 0 : 1);
      showSuccess(`用户${user.status === 1 ? '禁用' : '启用'}成功`);
      fetchUsers();
    } catch (error: any) {
      console.error('修改用户状态失败', error);
      showError(error.message || '修改用户状态失败');
    }
  };

  const handleEditUser = (user: SysUser) => {
    setEditingUser(user);
    setInviteUsername(user.username || '');
    setInviteNickname(user.nickname || '');
    setInviteEmail(user.email || '');
    setInvitePhone(user.phone || '');
    setInviteGender(user.gender || 0);
    setInviteRemark(user.remark || '');
    setInvitePassword('');
    setInviteConfirmPassword('');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!inviteUsername || !inviteNickname) {
      showError('请填写用户名和昵称');
      return;
    }
    try {
      const params: any = {
        id: editingUser.id,
        username: inviteUsername,
        nickname: inviteNickname,
        email: inviteEmail,
        phone: invitePhone,
        gender: inviteGender,
        remark: inviteRemark
      };
      if (invitePassword) {
        params.password = invitePassword;
      }
      const response = await userService.update(params);
      showSuccess('用户信息更新成功');
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('更新用户失败', error);
      showError(error.message || '更新失败');
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername || !inviteNickname) {
      showError('请填写用户名和昵称');
      return;
    }

    // 如果输入了密码，才进行密码校验
    if (invitePassword && invitePassword !== inviteConfirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    if (inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      showError('请输入正确的邮箱格式');
      return;
    }

    if (invitePhone && !/^1[3-9]\d{9}$/.test(invitePhone)) {
      showError('请输入正确的手机号格式');
      return;
    }
    
    try {
      const params: any = {
        username: inviteUsername,
        nickname: inviteNickname,
        email: inviteEmail,
        phone: invitePhone,
        gender: inviteGender,
        remark: inviteRemark,
        status: 1
      };
      
      // 只有在输入密码时才添加到参数中
      if (invitePassword) {
        params.password = invitePassword;
      }
      
      const response = await userService.create(params);
      
      setShowInviteModal(false);
      setInviteUsername('');
      setInviteNickname('');
      setInvitePassword('');
      setInviteConfirmPassword('');
      setInviteEmail('');
      setInvitePhone('');
      setInviteGender(0);
      setInviteRemark('');
      showSuccess('用户邀请成功！');
      fetchUsers();
    } catch (error: any) {
      console.error('邀请成员失败', error);
      showError(error.message || '邀请失败');
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4 sm:space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-black tracking-tighter">成员管理</h1>
          <p className="text-neutral-400 mt-1 sm:mt-1.5 text-xs sm:text-sm font-medium">管理系统用户与权限分配</p>
        </div>
        <Button size="md" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={16} className="mr-2" /> 邀请新成员
        </Button>
      </div>

      <div className={`border border-neutral-100 rounded-xl sm:rounded-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] overflow-hidden ${THEME.card}`}>
        <div className="p-4 sm:p-6 border-b border-neutral-50 flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between">
          <div className={`flex-1 max-w-md ${THEME.searchWrapper}`}>
            <Search className={THEME.searchIcon} />
            <input
              type="text"
              placeholder="搜索姓名、邮箱或角色..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              className={THEME.searchInput}
            />
          </div>
          <div className="flex space-x-2 w-full md:w-auto">
            <button className="hidden sm:flex items-center px-5 py-2.5 text-xs font-black bg-neutral-50 border border-neutral-100 rounded-[14px] hover:bg-black hover:text-white transition-all">
              导出表格
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16 sm:py-32">
            <Loader2 className="animate-spin text-black sm:w-8 sm:h-8" size={24} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="border-b border-neutral-50 text-[9px] sm:text-[10px] font-black text-neutral-300 uppercase tracking-[0.15em] sm:tracking-[0.2em]">
                    <th className="px-4 sm:px-6 py-3 sm:py-4">用户信息</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">账户状态</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">职能角色</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">创建时间</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">修改时间</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-neutral-50/50 transition-colors group">
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-[10px] sm:rounded-[14px] bg-black text-white flex items-center justify-center font-black text-xs sm:text-base transition-transform group-hover:scale-110">
                            {user.nickname?.charAt(0) || user.username?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-black text-black text-xs sm:text-sm">{user.nickname || user.username}</p>
                            <p className="text-[10px] sm:text-[11px] text-neutral-300 font-bold mt-0.5">{user.email || user.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={user.status === 1 ? THEME.badge.success : THEME.badge.inactive}
                        >
                          {user.status === 1 ? '正常' : '禁用'}
                        </button>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <div className="flex items-center text-[10px] sm:text-xs font-black text-black">
                          <Shield size={10} className="sm:w-[14px] sm:h-[14px] mr-1 sm:mr-1.5 text-neutral-300" />
                          系统用户
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-neutral-400 text-[10px] sm:text-xs font-medium">
                        {formatDateTime(user.createTime)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-neutral-400 text-[10px] sm:text-xs font-medium">
                        {formatDateTime(user.updateTime)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-right">
                        <div className="flex items-center justify-end space-x-0.5 sm:space-x-1.5">
                          <button 
                            onClick={() => handleEditUser(user)}
                            className={THEME.buttonIcon}
                          >
                            <Edit size={14} className="sm:w-4 sm:h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(user.id)}
                            className={`${THEME.buttonIcon} hover:bg-red-50 hover:text-red-500`}
                          >
                            <Trash2 size={14} className="sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {users.length > 0 && (
              <div className="p-4 sm:p-6 border-t border-neutral-50 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center justify-end space-x-3 text-[11px] font-black uppercase tracking-widest">
                  <div className={`mr-auto ${THEME.pagination.info}`}>
                    共 {total} 条
                  </div>

                  <button
                    className={THEME.pagination.button}
                    disabled={current <= 1}
                    onClick={() => setCurrent(Math.max(1, current - 1))}
                    title="上一页"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <div className="flex items-center space-x-1.5">
                    {getPageNumbers().map((num) => (
                      <button
                        key={num}
                        onClick={() => setCurrent(num)}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl text-[10px] font-black transition-all active:scale-90 ${
                          current === num
                            ? THEME.pagination.active
                            : THEME.pagination.inactive
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <button
                    className={THEME.pagination.button}
                    disabled={current >= totalPages}
                    onClick={() => setCurrent(Math.min(totalPages, current + 1))}
                    title="下一页"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {!loading && users.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-neutral-300">
                {/* Fix: Replace size and sm:size with responsive className */}
                <User strokeWidth={1} className="mb-2 sm:mb-3 opacity-20 w-9 h-9 sm:w-12 sm:h-12" />
                <p className="text-sm sm:text-base font-bold">暂无成员数据</p>
                <p className="text-[10px] sm:text-xs mt-1">您可以点击右上方按钮邀请新成员</p>
              </div>
            )}
          </>
        )}
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={(e) => e.target === e.currentTarget && setShowInviteModal(false)}>
          <div className={`rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col ${THEME.glass}`}>
            <div className="p-6 border-b border-neutral-50">
              <h3 className="text-xl font-black">邀请新成员</h3>
              <p className="text-neutral-400 text-xs mt-1 font-medium">填写以下信息邀请新成员加入团队</p>
            </div>
            <div className={`flex-1 ${THEME.scrollbar} p-6`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={THEME.label}>用户名 *</label>
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入用户名"
                  />
                </div>
                <div>
                  <label className={THEME.label}>昵称 *</label>
                  <input
                    type="text"
                    value={inviteNickname}
                    onChange={(e) => setInviteNickname(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入昵称"
                  />
                </div>
                <div>
                  <label className={THEME.label}>密码</label>
                  <input
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入密码（可选）"
                  />
                </div>
                {invitePassword && (
                  <div>
                    <label className={THEME.label}>确认密码</label>
                    <input
                      type="password"
                      value={inviteConfirmPassword}
                      onChange={(e) => setInviteConfirmPassword(e.target.value)}
                      className={`${THEME.input} w-full`}
                      placeholder="请再次输入密码"
                    />
                  </div>
                )}
                <div>
                  <label className={THEME.label}>邮箱</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入邮箱地址（可选）"
                  />
                </div>
                <div>
                  <label className={THEME.label}>手机号</label>
                  <input
                    type="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入手机号（可选）"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={THEME.label}>性别</label>
                  <div className="flex space-x-6 px-1">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="0"
                        checked={inviteGender === 0}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">未知</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="1"
                        checked={inviteGender === 1}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">男</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="2"
                        checked={inviteGender === 2}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">女</span>
                    </label>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className={THEME.label}>备注</label>
                  <textarea
                    value={inviteRemark}
                    onChange={(e) => setInviteRemark(e.target.value)}
                    rows={2}
                    className={`${THEME.input} resize-none w-full`}
                    placeholder="请输入备注信息（可选）"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-50 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteUsername('');
                  setInviteNickname('');
                  setInvitePassword('');
                  setInviteConfirmPassword('');
                  setInviteEmail('');
                  setInvitePhone('');
                  setInviteGender(0);
                  setInviteRemark('');
                }}
                className={THEME.button.secondary}
              >
                取消
              </button>
              <button
                onClick={handleInvite}
                className={THEME.button.primary}
              >
                确认邀请
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={(e) => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className={`rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col ${THEME.glass}`}>
            <div className="p-6 border-b border-neutral-50">
              <h3 className="text-xl font-black">编辑用户</h3>
              <p className="text-neutral-400 text-xs mt-1 font-medium">修改用户信息</p>
            </div>
            <div className={`flex-1 ${THEME.scrollbar} p-6`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={THEME.label}>用户名 *</label>
                  <input
                    type="text"
                    value={inviteUsername}
                    disabled
                    className={`${THEME.input} w-full bg-neutral-50 text-neutral-500 cursor-not-allowed`}
                    placeholder="请输入用户名"
                  />
                </div>
                <div>
                  <label className={THEME.label}>昵称 *</label>
                  <input
                    type="text"
                    value={inviteNickname}
                    onChange={(e) => setInviteNickname(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入昵称"
                  />
                </div>
              
                <div>
                  <label className={THEME.label}>邮箱</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入邮箱地址"
                  />
                </div>
                <div>
                  <label className={THEME.label}>手机号</label>
                  <input
                    type="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入手机号"
                  />
                </div>
                 <div className="md:col-span-2">
                  <label className={THEME.label}>性别</label>
                  <div className="flex space-x-6 px-1">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="0"
                        checked={inviteGender === 0}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">未知</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="1"
                        checked={inviteGender === 1}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">男</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="2"
                        checked={inviteGender === 2}
                        onChange={(e) => setInviteGender(Number(e.target.value))}
                        className="w-4 h-4 text-black focus:ring-black/20"
                      />
                      <span className="ml-2 text-sm text-neutral-600">女</span>
                    </label>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className={THEME.label}>备注</label>
                  <textarea
                    value={inviteRemark}
                    onChange={(e) => setInviteRemark(e.target.value)}
                    rows={2}
                    className={`${THEME.input} resize-none w-full`}
                    placeholder="请输入备注信息"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-50 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
                className={THEME.button.secondary}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className={THEME.button.primary}
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;