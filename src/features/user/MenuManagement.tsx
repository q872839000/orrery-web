
import React, { useState, useEffect } from 'react';
import { Menu as MenuIcon, Plus, Search, Loader2, Trash2, Edit, Folder, FileText, Zap, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Button } from '../../shared/components/ui/Button';
import { menuService } from '../../shared/services/system.service';
import { SysMenu } from '../../shared/types';
import { formatDateTime } from '../../shared/utils/date';
import { THEME } from '../../shared/styles/theme';
import Select from '../../shared/components/ui/Select';
import { useToast } from '../../shared/components/ui/ToastManager';

const MenuManagement: React.FC = () => {
  const [menus, setMenus] = useState<SysMenu[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<SysMenu | null>(null);
  const [formData, setFormData] = useState({
    parentId: '',
    menuName: '',
    menuType: 2,
    path: '',
    component: '',
    permission: '',
    icon: '',
    sort: 0,
    visible: 1,
    status: 1,
    remark: ''
  });
  const { showSuccess, showError, showConfirm } = useToast();

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const response = await menuService.getTree();
      setMenus(response.data || []);
      const allIds = new Set<string>();
      const collectIds = (items: SysMenu[]) => {
        items.forEach(item => {
          allIds.add(item.id);
          if (item.children) {
            collectIds(item.children);
          }
        });
      };
      collectIds(response.data || []);
      setExpandedMenus(allIds);
    } catch (error) {
      console.error('加载菜单列表失败', error);
      setMenus([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenus();
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (!isComposing) {
      setSearch(value);
      // 搜索时自动展开匹配的节点
      if (value.trim()) {
        const expandMatchingNodes = (menus: SysMenu[]) => {
          const newExpanded = new Set(expandedMenus);
          const searchLower = value.toLowerCase();
          
          const shouldExpand = (menu: SysMenu): boolean => {
            const matchesSearch = menu.menuName?.toLowerCase().includes(searchLower) ||
                                menu.path?.toLowerCase().includes(searchLower) ||
                                menu.permission?.toLowerCase().includes(searchLower) || false;
            
            if (matchesSearch) {
              return true;
            }
            
            if (menu.children) {
              return menu.children.some(child => shouldExpand(child));
            }
            
            return false;
          };
          
          const expandParents = (menus: SysMenu[]) => {
            menus.forEach(menu => {
              if (shouldExpand(menu)) {
                newExpanded.add(menu.id);
              }
              if (menu.children) {
                expandParents(menu.children);
              }
            });
          };
          
          expandParents(menus);
          setExpandedMenus(newExpanded);
        };
        
        expandMatchingNodes(menus);
      }
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
    setSearch(e.currentTarget.value);
  };

  const handleDelete = async (id: string) => {
    showConfirm('确定要删除该菜单吗？删除后不可恢复。', async () => {
      try {
        const response = await menuService.remove(id);
        showSuccess('菜单删除成功');
        fetchMenus();
      } catch (error: any) {
        console.error('删除菜单失败', error);
        showError(error.message || '删除菜单失败');
      }
    }, {
      type: 'warning',
      title: '删除确认',
      confirmText: '删除',
      confirmButtonClass: 'bg-red-500 text-white hover:bg-red-600'
    });
  };

  const handleToggleStatus = async (menu: SysMenu) => {
    try {
      const response = await menuService.updateStatus(menu.id, menu.status === 1 ? 0 : 1);
      fetchMenus();
    } catch (error) {
      console.error('修改菜单状态失败', error);
    }
  };

  const handleToggleExpand = (id: string) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedMenus(newExpanded);
  };

  const handleOpenModal = (menu?: SysMenu) => {
    if (menu) {
      setEditingMenu(menu);
      setFormData({
        parentId: menu.parentId,
        menuName: menu.menuName,
        menuType: menu.menuType,
        path: menu.path,
        component: menu.component,
        permission: menu.permission,
        icon: menu.icon,
        sort: menu.sort,
        visible: menu.visible,
        status: menu.status,
        remark: menu.remark
      });
    } else {
      setEditingMenu(null);
      setFormData({
        parentId: '',
        menuName: '',
        menuType: 2,
        path: '',
        component: '',
        permission: '',
        icon: '',
        sort: 0,
        visible: 1,
        status: 1,
        remark: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingMenu(null);
    setFormData({
      parentId: '',
      menuName: '',
      menuType: 2,
      path: '',
      component: '',
      permission: '',
      icon: '',
      sort: 0,
      visible: 1,
      status: 1,
      remark: ''
    });
  };

  const handleSave = async () => {
    try {
      const response = editingMenu 
        ? await menuService.update({ ...formData, id: Number(editingMenu.id) })
        : await menuService.create(formData);
      
      fetchMenus();
      handleCloseModal();
    } catch (error) {
      console.error('保存菜单失败', error);
    }
  };

  const filterMenus = (menus: SysMenu[], searchTerm: string): SysMenu[] => {
    if (!searchTerm.trim()) return menus;
    
    const searchLower = searchTerm.toLowerCase();
    const result: SysMenu[] = [];
    
    const shouldInclude = (menu: SysMenu): boolean => {
      return menu.menuName?.toLowerCase().includes(searchLower) ||
             menu.path?.toLowerCase().includes(searchLower) ||
             menu.permission?.toLowerCase().includes(searchLower) || false;
    };
    
    const processMenu = (menu: SysMenu): SysMenu | null => {
      let hasMatchingChildren = false;
      let filteredChildren: SysMenu[] = [];
      
      if (menu.children) {
        filteredChildren = menu.children.map(child => processMenu(child)).filter(Boolean) as SysMenu[];
        hasMatchingChildren = filteredChildren.length > 0;
      }
      
      const matchesSearch = shouldInclude(menu);
      
      if (matchesSearch || hasMatchingChildren) {
        return {
          ...menu,
          children: hasMatchingChildren ? filteredChildren : menu.children
        };
      }
      
      return null;
    };
    
    menus.forEach(menu => {
      const filtered = processMenu(menu);
      if (filtered) {
        result.push(filtered);
      }
    });
    
    return result;
  };

  const renderMenuTree = (menus: SysMenu[], level = 0) => {
    return menus.map((menu) => {
      const hasChildren = menu.children && menu.children.length > 0;
      const isExpanded = expandedMenus.has(menu.id);

      return (
        <div key={menu.id}>
          <div 
            className="flex items-center py-3 sm:py-4 hover:bg-neutral-50/50 transition-colors group"
            style={{ paddingLeft: `${level * 16 + 24}px` }}
          >
            {hasChildren && (
              <button
                onClick={() => handleToggleExpand(menu.id)}
                className="mr-1.5 sm:mr-2 p-1 hover:bg-neutral-100 rounded-full transition-colors"
              >
                {/* Fix: Replace size and sm:size with responsive className */}
                {isExpanded ? <ChevronDown className="w-[14px] h-[14px] sm:w-4 sm:h-4" /> : <ChevronRight className="w-[14px] h-[14px] sm:w-4 sm:h-4" />}
              </button>
            )}
            {!hasChildren && <div className="w-6 sm:w-8 mr-1.5 sm:mr-2" />}
            
            <div className="flex items-center space-x-2 sm:space-x-3 flex-1">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-[10px] sm:rounded-[14px] flex items-center justify-center transition-transform group-hover:scale-110 ${
                menu.menuType === 1 ? 'bg-blue-50 text-blue-600' :
                menu.menuType === 2 ? 'bg-purple-50 text-purple-600' :
                'bg-orange-50 text-orange-600'
              }`}>
                {menu.menuType === 1 ? <Folder className="w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]" /> :
                 menu.menuType === 2 ? <FileText className="w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]" /> :
                 <Zap className="w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <p className="font-black text-black text-xs sm:text-sm truncate">{menu.menuName}</p>
                  <span className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-full uppercase tracking-wider flex-shrink-0 ${
                    menu.menuType === 1 ? 'bg-blue-50 text-blue-600' :
                    menu.menuType === 2 ? 'bg-purple-50 text-purple-600' :
                    'bg-orange-50 text-orange-600'
                  }`}>
                    {menu.menuType === 1 ? '目录' : menu.menuType === 2 ? '菜单' : '按钮'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-neutral-300 font-bold mt-0.5 truncate">
                  {menu.path || menu.permission || '无路由/权限'}
                </p>
                <div className="flex items-center space-x-3 mt-1 text-[9px] sm:text-[10px] text-neutral-400">
                  <span>创建人: {menu.createName || '-'}</span>
                  <span>修改人: {menu.updateName || '-'}</span>
                  <span>修改时间: {formatDateTime(menu.updateTime)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2 mr-4 sm:mr-8">
              <button
                onClick={() => handleToggleStatus(menu)}
                className={menu.status === 1 ? THEME.badge.success : THEME.badge.inactive}
              >
                {menu.status === 1 ? '显示' : '隐藏'}
              </button>
              <button 
                onClick={() => handleOpenModal(menu)}
                className={THEME.buttonIcon}
                title="编辑"
              >
                <Edit className="w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]" />
              </button>
              <button 
                onClick={() => handleDelete(menu.id)}
                className={`${THEME.buttonIcon} hover:bg-red-50 hover:text-red-500`}
                title="删除"
              >
                <Trash2 className="w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
          </div>

          {hasChildren && isExpanded && (
            <div>
              {renderMenuTree(menu.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-black tracking-tighter">菜单管理</h1>
          <p className="text-neutral-400 mt-1 text-xs sm:text-sm font-medium">配置系统导航结构与访问权限</p>
        </div>
        <Button size="md" onClick={() => handleOpenModal()}>
          <Plus size={16} className="mr-2" /> 新建菜单
        </Button>
      </div>

      <div className={`border border-neutral-100 rounded-xl sm:rounded-[24px] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.06)] overflow-hidden ${THEME.card}`}>
        <div className="p-4 sm:p-6 border-b border-neutral-50 flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between">
          <div className={`flex-1 max-w-md ${THEME.searchWrapper}`}>
            <Search className={THEME.searchIcon} />
            <input
              type="text"
              placeholder="搜索菜单名称或路由..."
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
            {/* Fix: Replace size and sm:size with responsive className to fix line 383 */}
            <Loader2 className="animate-spin text-black w-6 h-6 sm:w-8 sm:h-8" />
          </div>
        ) : (
          <>
            <div className="py-2 sm:py-3">
              {menus.length > 0 ? (
                renderMenuTree(filterMenus(menus, search))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-neutral-300">
                  {/* Fix: Replace size and sm:size with responsive className */}
                  <MenuIcon strokeWidth={1} className="mb-2 sm:mb-3 opacity-20 w-9 h-9 sm:w-12 sm:h-12" />
                  <p className="text-sm sm:text-base font-bold">暂无菜单数据</p>
                  <p className="text-[10px] sm:text-xs mt-1">您可以点击右上方按钮创建新菜单</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-[24px] shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col ${THEME.glass}`}>
            <div className="p-6 border-b border-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{editingMenu ? '编辑菜单' : '新建菜单'}</h3>
                <p className="text-neutral-400 text-xs mt-1 font-medium">
                  {editingMenu ? '修改菜单信息与权限配置' : '创建新的系统菜单项'}
                </p>
              </div>
              <button 
                onClick={handleCloseModal}
                className={THEME.buttonIcon}
              >
                <X size={20} />
              </button>
            </div>
            <div className={`p-6 ${THEME.scrollbar} max-h-[60vh] space-y-5`}>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={THEME.label}>菜单名称</label>
                  <input
                    type="text"
                    value={formData.menuName}
                    onChange={(e) => setFormData({ ...formData, menuName: e.target.value })}
                    className={`${THEME.input} w-full`}
                    placeholder="请输入菜单名称"
                  />
                </div>
                <div>
                  <label className={THEME.label}>菜单类型</label>
                  <Select
                    value={String(formData.menuType)}
                    onChange={v => setFormData({ ...formData, menuType: Number(v) })}
                    options={[{ value: '1', label: '目录' }, { value: '2', label: '菜单' }, { value: '3', label: '按钮' }]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={THEME.label}>路由地址</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className={`${THEME.input} w-full`}
                    placeholder="例如：/user"
                  />
                </div>
                <div>
                  <label className={THEME.label}>组件路径</label>
                  <input
                    type="text"
                    value={formData.component}
                    onChange={(e) => setFormData({ ...formData, component: e.target.value })}
                    className={`${THEME.input} w-full`}
                    placeholder="例如：user/index"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={THEME.label}>权限标识</label>
                  <input
                    type="text"
                    value={formData.permission}
                    onChange={(e) => setFormData({ ...formData, permission: e.target.value })}
                    className={`${THEME.input} w-full`}
                    placeholder="例如：user:list"
                  />
                </div>
                <div>
                  <label className={THEME.label}>图标</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className={`${THEME.input} w-full`}
                    placeholder="例如：User"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className={THEME.label}>排序</label>
                  <input
                    type="number"
                    value={formData.sort}
                    onChange={(e) => setFormData({ ...formData, sort: Number(e.target.value) })}
                    className={`${THEME.input} w-full`}
                  />
                </div>
                <div>
                  <label className={THEME.label}>显示状态</label>
                  <Select
                    value={String(formData.visible)}
                    onChange={v => setFormData({ ...formData, visible: Number(v) })}
                    options={[{ value: '1', label: '显示' }, { value: '0', label: '隐藏' }]}
                  />
                </div>
                <div>
                  <label className={THEME.label}>菜单状态</label>
                  <Select
                    value={String(formData.status)}
                    onChange={v => setFormData({ ...formData, status: Number(v) })}
                    options={[{ value: '1', label: '正常' }, { value: '0', label: '停用' }]}
                  />
                </div>
              </div>

              <div>
                <label className={THEME.label}>备注</label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  rows={3}
                  className={`${THEME.input} resize-none w-full`}
                  placeholder="请输入备注信息"
                />
              </div>
            </div>
            <div className="p-6 border-t border-neutral-50 flex items-center justify-end space-x-3">
              <button
                onClick={handleCloseModal}
                className={THEME.button.secondary}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className={THEME.button.primary}
              >
                {editingMenu ? '保存修改' : '立即创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
