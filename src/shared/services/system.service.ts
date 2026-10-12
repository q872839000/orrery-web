import apis from './apis';
import { ApiResponse, PageResponse, SysUser, SysRole, SysMenu, MenuTreeVO } from '../types';

export const userService = {
  create: async (params: any) => {
    const res = await apis.createSysUser(params);
    return res.data;
  },
  update: async (params: any) => {
    const res = await apis.updateSysUser(params);
    return res.data;
  },
  getInfo: async (id: string) => {
    const res = await apis.getSysUserInfo(id);
    return res.data;
  },
  listAll: async () => {
    const res = await apis.listAllSysUsers();
    return res.data;
  },
  remove: async (id: string) => {
    const res = await apis.removeSysUser(id);
    return res.data;
  },
  updateStatus: async (id: string, status: number) => {
    const res = await apis.updateSysUserStatus(id, status);
    return res.data;
  },
  updatePassword: async (params: any) => {
    const res = await apis.updateSysUserPassword(params);
    return res.data;
  },
  resetPassword: async (id: string, newPassword: string) => {
    const res = await apis.resetSysUserPassword(id, newPassword);
    return res.data;
  },
  assignRoles: async (params: any) => {
    const res = await apis.assignRolesToUser(params);
    return res.data;
  },
  getRoleIds: async (userId: string) => {
    const res = await apis.getUserRoleIds(userId);
    return res.data;
  },
  page: async (params: any) => {
    const res = await apis.pageSysUsers(params);
    return res.data;
  },
  /** 活跃用户模糊搜索（知识库成员添加等场景） */
  listActive: async (name?: string) => {
    const res = await apis.listActiveUsers(name);
    return res.data;
  }
};

export const roleService = {
  create: async (params: any) => {
    const res = await apis.createSysRole(params);
    return res.data;
  },
  update: async (params: any) => {
    const res = await apis.updateSysRole(params);
    return res.data;
  },
  getInfo: async (id: string) => {
    const res = await apis.getSysRoleInfo(id);
    return res.data;
  },
  listAll: async () => {
    const res = await apis.listAllSysRoles();
    return res.data;
  },
  remove: async (id: string) => {
    const res = await apis.removeSysRole(id);
    return res.data;
  },
  updateStatus: async (id: string, status: number) => {
    const res = await apis.updateSysRoleStatus(id, status);
    return res.data;
  },
  assignMenus: async (params: any) => {
    const res = await apis.assignMenusToRole(params);
    return res.data;
  },
  getMenuIds: async (roleId: string) => {
    const res = await apis.getRoleMenuIds(roleId);
    return res.data;
  },
  page: async (params: any) => {
    const res = await apis.pageSysRoles(params);
    return res.data;
  }
};

export const menuService = {
  create: async (params: any) => {
    const res = await apis.createSysMenu(params);
    return res.data;
  },
  update: async (params: any) => {
    const res = await apis.updateSysMenu(params);
    return res.data;
  },
  getInfo: async (id: string) => {
    const res = await apis.getSysMenuInfo(id);
    return res.data;
  },
  listAll: async () => {
    const res = await apis.listAllSysMenus();
    return res.data;
  },
  getTree: async () => {
    const res = await apis.getSysMenuTree();
    return res.data;
  },
  remove: async (id: string) => {
    const res = await apis.removeSysMenu(id);
    return res.data;
  },
  updateStatus: async (id: string, status: number) => {
    const res = await apis.updateSysMenuStatus(id, status);
    return res.data;
  }
};