
import { get, post } from './request';
import config from '../config';

const ADM = config.SERVICE_ADMIN; // orrery-admin-service

export default {
  // ==========================================认证模块（via gateway → orrery-admin-service）==========================================
  // 登录
  getLogin: (params: any) => post(`${ADM}/auth/login`, params),

  // 退出登录（服务端从 Authorization header 读取 token，无需传 userId）
  getLogout: () => post(`${ADM}/auth/logout`, null),

  // 用户注册
  getRegister: (params: any) => post(`${ADM}/auth/register`, params),

  // 获取当前用户信息
  getUserInfo: (userId: string) => get(`${ADM}/auth/user-info`, { params: { userId } }),

  // ==========================================系统用户模块（via gateway → orrery-admin-service）==========================================
  // 创建用户
  createSysUser: (params: any) => post(`${ADM}/system/user/create`, params),

  // 更新用户
  updateSysUser: (params: any) => post(`${ADM}/system/user/update`, params),

  // 查询用户详情
  getSysUserInfo: (id: string) => get(`${ADM}/system/user/get-info`, { params: { id } }),

  // 查询所有用户
  listAllSysUsers: () => get(`${ADM}/system/user/list-all`),

  // 删除用户
  removeSysUser: (id: string) => post(`${ADM}/system/user/remove`, null, { params: { id } }),

  // 修改用户状态
  updateSysUserStatus: (id: string, status: number) =>
    post(`${ADM}/system/user/update-status`, null, { params: { id, status } }),

  // 修改密码
  updateSysUserPassword: (params: any) => post(`${ADM}/system/user/update-password`, params),

  // 重置密码
  resetSysUserPassword: (id: string, newPassword: string) =>
    post(`${ADM}/system/user/reset-password`, null, { params: { id, newPassword } }),

  // 分配角色给用户
  assignRolesToUser: (params: any) => post(`${ADM}/system/user/assign-roles`, params),

  // 获取用户的角色ID列表
  getUserRoleIds: (userId: string) => get(`${ADM}/system/user/role-ids`, { params: { userId } }),

  // 分页查询用户
  pageSysUsers: (params: any) => get(`${ADM}/system/user/page`, { params }),

  // 查询活跃用户(含模糊搜索)
  listActiveUsers: (name?: string) => get(`${ADM}/system/user/list-all-active`, { params: { name } }),

  // ==========================================系统角色模块==========================================
  // 创建角色
  createSysRole: (params: any) => post(`${ADM}/system/role/create`, params),

  // 更新角色
  updateSysRole: (params: any) => post(`${ADM}/system/role/update`, params),

  // 查询角色详情
  getSysRoleInfo: (id: string) => get(`${ADM}/system/role/get-info`, { params: { id } }),

  // 查询所有角色
  listAllSysRoles: () => get(`${ADM}/system/role/list-all`),

  // 删除角色
  removeSysRole: (id: string) => post(`${ADM}/system/role/remove`, null, { params: { id } }),

  // 修改角色状态
  updateSysRoleStatus: (id: string, status: number) =>
    post(`${ADM}/system/role/update-status`, null, { params: { id, status } }),

  // 分配菜单给角色
  assignMenusToRole: (params: any) => post(`${ADM}/system/role/assign-menus`, params),

  // 获取角色的菜单ID列表
  getRoleMenuIds: (roleId: string) => get(`${ADM}/system/role/menu-ids`, { params: { roleId } }),

  // 分页查询角色
  pageSysRoles: (params: any) => get(`${ADM}/system/role/page`, { params }),

  // ==========================================系统菜单模块==========================================
  // 创建菜单
  createSysMenu: (params: any) => post(`${ADM}/system/menu/create`, params),

  // 更新菜单
  updateSysMenu: (params: any) => post(`${ADM}/system/menu/update`, params),

  // 查询菜单详情
  getSysMenuInfo: (id: string) => get(`${ADM}/system/menu/get-info`, { params: { id } }),

  // 查询所有菜单
  listAllSysMenus: () => get(`${ADM}/system/menu/list-all`),

  // 获取菜单树形结构
  getSysMenuTree: () => get(`${ADM}/system/menu/tree`),

  // 删除菜单
  removeSysMenu: (id: string) => post(`${ADM}/system/menu/remove`, null, { params: { id } }),

  // 修改菜单状态
  updateSysMenuStatus: (id: string, status: number) =>
    post(`${ADM}/system/menu/update-status`, null, { params: { id, status } }),
};
