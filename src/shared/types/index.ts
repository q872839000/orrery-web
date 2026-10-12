/**
 * 平台通用类型（认证/系统管理）。
 * 知识库域类型统一在 ./knowledge.ts，勿在此重复定义。
 */

export interface UserInfo {
  userId: string;
  username: string;
  nickname: string;
  avatar?: string | null;
  superAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface PageResponse<T> {
  records: T[];
  current: number;
  size: number;
  total: number;
  pages: number;
}

export interface SysUser {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
  gender: number;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
  createName?: string;
  updateName?: string;
}

export interface SysRole {
  id: string;
  roleCode: string;
  roleName: string;
  sort: number;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
  createName?: string;
  updateName?: string;
}

export interface SysMenu {
  id: string;
  parentId: string;
  menuName: string;
  menuType: number;
  path: string;
  component: string;
  permission: string;
  icon: string;
  sort: number;
  visible: number;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
  createName: string;
  updateName: string;
  children?: SysMenu[];
}

export interface MenuTreeVO {
  id: string;
  parentId: string;
  menuName: string;
  menuType: number;
  path: string;
  component: string;
  permission: string;
  icon: string;
  sort: number;
  visible: number;
  status: number;
  children?: MenuTreeVO[];
}
