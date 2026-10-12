/**
 * 统一 HTTP 客户端：全站唯一 axios 实例，基址为 Orrery 网关。
 * 业务路径需带服务 ID 前缀（如 `cy-knowledge-repository/knowledge/apps`），
 * 由网关经服务发现路由到目标服务。
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import config from '../config';

/** 网关基址（带尾斜杠），供 fetch/SSE 场景拼接完整 URL */
export const GATEWAY_BASE = config.GATEWAY_URL.endsWith('/')
  ? config.GATEWAY_URL
  : `${config.GATEWAY_URL}/`;

const request = axios.create({
  baseURL: GATEWAY_BASE,
  timeout: config.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：附带登录令牌；FormData 时移除默认 JSON Content-Type（让浏览器自动带 multipart boundary）
request.interceptors.request.use((axiosConfig: InternalAxiosRequestConfig) => {
  if (axiosConfig.data instanceof FormData) {
    delete axiosConfig.headers['Content-Type'];
  }
  const token = localStorage.getItem(config.TOKEN_KEY);
  if (token) {
    axiosConfig.headers.Authorization = token;
  }
  return axiosConfig;
}, (error) => {
  return Promise.reject(error);
});

// 响应拦截器：R<T> 业务错误解包 + 401 跳登录
request.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data && typeof data.status === 'number' && data.status !== 1000) {
      return Promise.reject(new Error(data.message || '操作失败'));
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(config.TOKEN_KEY);
      window.location.hash = '#/login';
    }
    const responseData = error.response?.data as any;
    const message = responseData?.message || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);

export const get = (url: string, config?: any) => request.get(url, config);
export const post = (url: string, data?: any, config?: any) => request.post(url, data, config);
export const put = (url: string, data?: any, config?: any) => request.put(url, data, config);
export const del = (url: string, config?: any) => request.delete(url, config);

export default request;
