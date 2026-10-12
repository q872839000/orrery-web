
import React, { useState, useEffect } from 'react';
import { Shield, Plus, Search, Loader2, Trash2, Edit, Check, X, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../shared/components/ui/Button';
import { roleService, menuService } from '../../shared/services/system.service';
import { SysRole, MenuTreeVO } from '../../shared/types';
import { formatDateTime } from '../../shared/utils/date';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';

const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<SysRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRole, setSelectedRole] = useState<SysRole | null>(null);
  const [menuTree, setMenuTree] = useState<MenuTreeVO[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([]);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    roleName: '',
    roleCode: '',
    sort: 0,
    remark: '',
    status: 1
  });
  const [editingRole, setEditingRole] = useState<SysRole | null>(null);
  const { showSuccess, showError, showConfirm } = useToast();

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const response = await roleService.page({
        current,
        size: pageSize,
        name: search 
      });
      setRoles(response.data?.records || []);
      setTotal(response.data?.totalRow || 0);
      setTotalPages(response.data?.totalPage || 1);
    } catch (error) {
      console.error('加载角色列表失败', error);
      setRoles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuTree = async () => {
    try {
      const response = await menuService.getTree();
      setMenuTree(response.data || []);
    } catch (error) {
      console.error('加载菜单树失败', error);
      setMenuTree([]);
    }
  };

  const fetchRoleMenuIds = async (roleId: string) => {
    try {
      const response = await roleService.getMenuIds(roleId);
      setSelectedMenuIds(response.data || []);
    } catch (error) {
      console.error('加载角色菜单失败', error);
      setSelectedMenuIds([]);
    }
  };

  useEffect(() => {
    fetchRoles();
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
    showConfirm('确定要删除该角色吗？删除后无法恢复。', async () => {
      try {
        const response = await roleService.remove(id);
        showSuccess('角色删除成功');
        fetchRoles();
      } catch (error: any) {
        console.error('删除角色失败', error);
        showError(error.message || '删除角色失败');
      }
    }, {
      type: 'warning',
      title: '删除确认',
      confirmText: '删除',
      confirmButtonClass: 'bg-red-500 text-white hover:bg-red-600'
    });
  };

  const handleToggleStatus = async (role: SysRole) => {
    try {
      const response = await roleService.updateStatus(role.id.toString(), role.status === 1 ? 0 : 1);
      fetchRoles();
    } catch (error) {
      console.error('修改角色状态失败', error);
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

  const handleOpenMenuModal = async (role: SysRole) => {
    setSelectedRole(role);
    setShowMenuModal(true);
    await fetchMenuTree();
    await fetchRoleMenuIds(role.id);
  };

  const handleCloseMenuModal = () => {
    setShowMenuModal(false);
    setSelectedRole(null);
    setSelectedMenuIds([]);
  };

  const handleSaveMenus = async () => {
    if (!selectedRole) return;
    try {
      const response = await roleService.assignMenus({
        roleId: selectedRole.id.toString(),
        menuIds: selectedMenuIds
      });
      showSuccess('菜单分配成功');
      handleCloseMenuModal();
    } catch (error: any) {
      console.error('分配菜单失败', error);
      showError(error.message || '分配菜单失败');
    }
  };

  const handleOpenCreateModal = () => {
    setFormData({
      roleName: '',
      roleCode: '',
      sort: 0,
      remark: '',
      status: 1
    });
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setEditingRole(null);
    setFormData({
      roleName: '',
      roleCode: '',
      sort: 0,
      remark: '',
      status: 1
    });
  };

  const handleCreateRole = async () => {
    if (!formData.roleName || !formData.roleCode) {
      showError('请填写角色名称和角色编码');
      return;
    }
    try {
      const response = editingRole 
        ? await roleService.update({ ...formData, id: editingRole.id })
        : await roleService.create(formData);
      showSuccess(editingRole ? '角色更新成功' : '角色创建成功');
      handleCloseCreateModal();
      fetchRoles();
    } catch (error: any) {
      console.error(editingRole ? '更新角色失败' : '创建角色失败', error);
      showError(error.message || (editingRole ? '更新角色失败' : '创建角色失败'));
    }
  };

  const handleEditRole = (role: SysRole) => {
    setEditingRole(role);
    setFormData({
      roleName: role.roleName || '',
      roleCode: role.roleCode || '',
      sort: role.sort || 0,
      remark: role.remark || '',
      status: role.status || 1
    });
    setShowCreateModal(true);
  };

  const handleMenuToggle = (menuId: string, checked: boolean) => {
    const newSelectedIds = new Set(selectedMenuIds);
    
    if (checked) {
      newSelectedIds.add(menuId);
      // 自动选中所有父节点
      const parents = findParents(menuTree, menuId);
      parents.forEach(parentId => newSelectedIds.add(parentId));
      
      // 自动选中所有子节点
      const children = findChildren(menuTree, menuId);
      children.forEach(childId => newSelectedIds.add(childId));
    } else {
      // 取消选中当前节点及其所有子节点
      const removeMenuAndChildren = (menuId: string) => {
        newSelectedIds.delete(menuId);
        const children = findChildren(menuTree, menuId);
        children.forEach(childId => newSelectedIds.delete(childId));
      };
      
      removeMenuAndChildren(menuId);
    }
    
    setSelectedMenuIds(Array.from(newSelectedIds));
  };

  const findParents = (menus: MenuTreeVO[], targetId: string): string[] => {
    for (const menu of menus) {
      if (menu.children?.some(child => child.id.toString() === targetId)) {
        return [menu.id.toString(), ...findParents(menus, menu.id.toString())];
      }
      if (menu.children) {
        const parents = findParents(menu.children, targetId);
        if (parents.length > 0) return parents;
      }
    }
    return [];
  };

  const findChildren = (menus: MenuTreeVO[], targetId: string): string[] => {
    for (const menu of menus) {
      if (menu.id.toString() === targetId) {
        const children: string[] = [];
        const collectChildren = (m: MenuTreeVO) => {
          if (m.children) {
            m.children.forEach(child => {
              children.push(child.id.toString());
              collectChildren(child);
            });
          }
        };
        collectChildren(menu);
        return children;
      }
      if (menu.children) {
        const children = findChildren(menu.children, targetId);
        if (children.length > 0) return children;
      }
    }
    return [];
  };

  const renderMenuTree = (menus: MenuTreeVO[], level = 0) => {
    return menus.map((menu) => {
      const isChecked = selectedMenuIds.includes(menu.id.toString());
      const hasChildren = menu.children && menu.children.length > 0;
      const hasSelectedChildren = hasChildren && menu.children.some(child => 
        selectedMenuIds.includes(child.id.toString()) || 
        (child.children && child.children.some(grandChild => selectedMenuIds.includes(grandChild.id.toString())))
      );
      
      return (
        <div key={menu.id} className="relative">
          {level > 0 && (
            <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />
          )}
          <div style={{ marginLeft: level * 24 }} className="relative">
            <div className="flex items-center py-3 hover:bg-white rounded-lg px-3 transition-colors group">
              <div className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full mr-3 ${
                  menu.menuType === 1 ? 'bg-blue-100' : 
                  menu.menuType === 2 ? 'bg-green-100' : 'bg-orange-100'
                }`}>
                  {menu.menuType === 1 ? (
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  ) : menu.menuType === 2 ? (
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleMenuToggle(menu.id.toString(), e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black focus:ring-2"
                  ref={(el) => {
                    if (el && hasSelectedChildren && !isChecked) {
                      el.indeterminate = true;
                    }
                  }}
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-neutral-800 group-hover:text-black transition-colors">{menu.menuName}</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      menu.menuType === 1 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 
                      menu.menuType === 2 ? 'bg-green-50 text-green-700 border border-green-200' : 
                      'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                      {menu.menuType === 1 ? '目录' : menu.menuType === 2 ? '菜单' : '按钮'}
                    </span>
                  </div>
                  {menu.permission && (
                    <div className="text-xs text-neutral-500 font-mono mt-1 bg-neutral-100 rounded px-2 py-1 inline-block">
                      {menu.permission}
                    </div>
                  )}
                </div>
              </div>
              {hasChildren && (
                <div className="text-xs text-neutral-400 font-medium">
                  {menu.children.length} 个子项
                </div>
              )}
            </div>
            {hasChildren && (
              <div className="mt-1">
                {renderMenuTree(menu.children, level + 1)}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-black tracking-tighter">角色管理</h1>
          <p className="text-neutral-400 mt-0.5 sm:mt-1 text-xs sm:text-sm font-medium">定义系统权限与角色分配策略</p>
        </div>
        <Button 
          onClick={handleOpenCreateModal}
          size="md"
        >
          <Plus size={16} className="mr-2" /> 新建角色
        </Button>
      </div>

      <div className={`border border-neutral-100 rounded-xl sm:rounded-[24px] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.06)] overflow-hidden ${THEME.card}`}>
        <div className="p-4 sm:p-6 border-b border-neutral-50 flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between">
          <div className={`flex-1 max-w-md ${THEME.searchWrapper}`}>
            <Search className={THEME.searchIcon} />
            <input
              type="text"
              placeholder="搜索角色名称或编码..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              className={THEME.searchInput}
            />
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16 sm:py-24">
            <Loader2 className="animate-spin text-black sm:w-8 sm:h-8" size={24} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="border-b border-neutral-50 text-[9px] sm:text-[10px] font-black text-neutral-300 uppercase tracking-[0.15em] sm:tracking-[0.2em]">
                    <th className="px-4 sm:px-6 py-3 sm:py-4">角色信息</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">角色编码</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">排序</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">状态</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">创建时间</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4">修改时间</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {roles.map((role) => (
                    <tr key={role.id} className="hover:bg-neutral-50/50 transition-colors group">
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-[10px] sm:rounded-[14px] bg-black text-white flex items-center justify-center font-black text-xs sm:text-sm transition-transform group-hover:scale-110">
                            <Shield size={12} className="sm:w-4 sm:h-4" />
                          </div>
                          <div>
                            <p className="font-black text-black text-xs sm:text-sm">{role.roleName}</p>
                            <p className="text-[10px] sm:text-[11px] text-neutral-300 font-bold mt-0.5">{role.remark || '暂无描述'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-neutral-50 rounded-md text-[10px] sm:text-xs font-black text-neutral-400 uppercase tracking-wider">
                          {role.roleCode}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-neutral-400 text-[10px] sm:text-xs font-medium">
                        {role.sort}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5">
                        <button
                          onClick={() => handleToggleStatus(role)}
                          className={role.status === 1 ? THEME.badge.success : THEME.badge.inactive}
                        >
                          {role.status === 1 ? '正常' : '禁用'}
                        </button>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-neutral-400 text-[10px] sm:text-xs font-medium">
                        {formatDateTime(role.createTime)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-neutral-400 text-[10px] sm:text-xs font-medium">
                        {formatDateTime(role.updateTime)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-5 text-right">
                        <div className="flex items-center justify-end space-x-0.5 sm:space-x-1.5">
                          <button 
                            onClick={() => handleOpenMenuModal(role)}
                            className={THEME.buttonIcon}
                            title="分配菜单"
                          >
                            <Menu size={14} className="sm:w-4 sm:h-4" />
                          </button>
                          <button 
                            onClick={() => handleEditRole(role)}
                            className={THEME.buttonIcon}
                            title="编辑"
                          >
                            <Edit size={14} className="sm:w-4 sm:h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(role.id)}
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

            {roles.length > 0 && (
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

            {!loading && roles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-neutral-300">
                {/* Fix: Replace size and sm:size with responsive className */}
                <Shield strokeWidth={1} className="mb-2 sm:mb-3 opacity-20 w-9 h-9 sm:w-12 sm:h-12" />
                <p className="text-sm sm:text-base font-bold">暂无角色数据</p>
                <p className="text-[10px] sm:text-xs mt-1">您可以点击右上方按钮创建新角色</p>
              </div>
            )}
          </>
        )}
      </div>

      {showMenuModal && selectedRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col ${THEME.glass}`}>
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-black">分配菜单权限</h3>
                <p className="text-neutral-400 text-xs mt-1 font-medium">为角色「{selectedRole.roleName}」配置可访问的菜单</p>
              </div>
              <button 
                onClick={handleCloseMenuModal}
                className={THEME.buttonIcon}
              >
                <X size={20} />
              </button>
            </div>
            <div className={`p-6 ${THEME.scrollbar} max-h-[60vh]`}>
              {menuTree.length > 0 ? (
                <div className="bg-neutral-50/50 rounded-2xl p-6 border border-neutral-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-black rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">权限架构树</span>
                    </div>
                    <div className="flex items-center space-x-4 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                        <span>目录</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span>菜单</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                        <span>按钮</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {renderMenuTree(menuTree)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
                  <Menu size={48} strokeWidth={1} className="mb-3 opacity-20" />
                  <p className="text-base font-black">暂无权限数据</p>
                </div>
              )}
            </div>
            <div className="p-4 sm:p-6 border-t border-neutral-50 flex items-center justify-end space-x-2 sm:space-x-3">
              <button
                onClick={handleCloseMenuModal}
                className={THEME.button.secondary}
              >
                取消
              </button>
              <button
                onClick={handleSaveMenus}
                className={`${THEME.button.primary}`}
              >
                <Check size={16} className="mr-2" /> 保存配置
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className={`shadow-2xl w-full max-w-sm sm:max-w-md overflow-hidden rounded-[24px] ${THEME.glass}`}>
            <div className="p-4 sm:p-6 border-b border-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-black">{editingRole ? '编辑角色' : '新建角色'}</h3>
                <p className="text-neutral-400 text-[10px] sm:text-xs mt-1 font-medium">{editingRole ? '修改角色信息' : '创建新的系统角色'}</p>
              </div>
              <button 
                onClick={handleCloseCreateModal}
                className={THEME.buttonIcon}
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div>
                <label className={THEME.label}>角色名称 *</label>
                <input
                  type="text"
                  value={formData.roleName}
                  onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
                  placeholder="请输入角色名称"
                  className={`${THEME.input} w-full`}
                />
              </div>
              <div>
                <label className={THEME.label}>角色编码 *</label>
                <input
                  type="text"
                  value={formData.roleCode}
                  onChange={(e) => setFormData({ ...formData, roleCode: e.target.value })}
                  placeholder="请输入角色编码"
                  className={`${THEME.input} w-full`}
                />
              </div>
              <div>
                <label className={THEME.label}>排序</label>
                <input
                  type="number"
                  value={formData.sort}
                  onChange={(e) => setFormData({ ...formData, sort: Number(e.target.value) })}
                  placeholder="请输入排序"
                  className={`${THEME.input} w-full`}
                />
              </div>
              <div>
                <label className={THEME.label}>备注</label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  placeholder="请输入备注信息"
                  rows={3}
                  className={`${THEME.input} resize-none w-full`}
                />
              </div>
            </div>
            <div className="p-4 sm:p-6 border-t border-neutral-50 flex items-center justify-end space-x-2 sm:space-x-3">
              <button
                onClick={handleCloseCreateModal}
                className={THEME.button.secondary}
              >
                取消
              </button>
              <button
                onClick={handleCreateRole}
                className={`${THEME.button.primary}`}
              >
                <Check className="mr-1.5 w-3 h-3 sm:w-3.5 sm:h-3.5" /> {editingRole ? '保存修改' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
