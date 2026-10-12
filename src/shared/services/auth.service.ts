
import apis from './apis';
import { ApiResponse, UserInfo } from '../types';

export interface LoginData extends UserInfo {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export const authService = {
  login: async (params: any) => {
    const res = await apis.getLogin(params);
    return res.data;
  },
  register: async (params: any) => {
    const res = await apis.getRegister(params);
    return res.data;
  },
  logout: async () => {
    const res = await apis.getLogout();
    return res.data;
  },
  getUserInfo: async (userId: string) => {
    const res = await apis.getUserInfo(userId);
    return res.data;
  }
};
