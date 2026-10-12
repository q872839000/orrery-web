/**
 * 全局配置。所有后端流量统一走 Orrery 网关（8582），
 * 网关按「/{服务ID}/{路径}」经 Nacos 服务发现路由到目标服务。
 */
export const config = {
  /** Orrery 网关地址（唯一入口） */
  GATEWAY_URL: 'http://localhost:8582',

  /** Orrery 侧服务 ID（Nacos 注册名，即网关路由前缀） */
  SERVICE_BUTLER: 'orrery-butler-service',
  SERVICE_ADMIN: 'orrery-admin-service',
  SERVICE_SCENARIO: 'scenario-agent',

  REQUEST_TIMEOUT: 30000,
  TOKEN_KEY: 'token',
  PAGE_SIZE: 20,
};

export default config;
