
import React, { useEffect, useState } from 'react';
import { Activity, Server, Bot, ShieldCheck, Cpu, ScrollText, Globe, Link2, Cog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { butlerService, ButlerStatus, logService, LogRecord, AgentEntry } from '../../shared/services/orrery.service';
import { THEME } from '../../shared/styles/theme';

const formatTime = (isoString?: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
};

const OrreryPortal: React.FC = () => {
  const [status, setStatus] = useState<ButlerStatus | null>(null);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [audits, setAudits] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [st, ags, evts] = await Promise.all([
          butlerService.getStatus().catch(() => null),
          butlerService.listAgents().catch(() => []),
          logService.query({ page: 1, size: 10 }).then(r => r.records).catch(() => [])
        ]);
        setStatus(st);
        setAgents(ags);
        setAudits(evts);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // Refresh every 10s only if autoRefresh is enabled
    if (autoRefresh) {
      const timer = setInterval(fetchData, 10000);
      return () => clearInterval(timer);
    }
  }, [autoRefresh]);

  const stats = [
    { label: '集群智能体数', value: status?.totalAgents ?? 0, icon: Bot, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: '在线智能体', value: agents.filter(a => a.serviceName).length, icon: Server, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: '可路由智能体', value: status?.routableAgents ?? 0, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: '配置同步版本', value: status?.snapshotVersion ?? 0, icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-50' }
  ];

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* 头部大标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">智能管家运行总览</h1>
          <p className="text-neutral-400 text-[13px] font-medium mt-1">Orrery Butler 多智能体编排与协同状态实时监控</p>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, idx) => (
          <div key={idx} className={`${THEME.card} p-4 flex items-center gap-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon size={22} strokeWidth={1.5} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-black mb-0.5">{loading && !status ? '-' : s.value}</p>
              <p className="text-[11px] font-semibold text-neutral-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左侧：最近系统审计流转 */}
        <div className={`lg:col-span-2 ${THEME.card} p-0 flex flex-col min-h-[380px]`}>
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <ScrollText size={15} className="text-blue-500" /> 审计流转追踪 (Audit Trail)
            </h3>
            <Link to="/system/audit" className="text-[11px] font-semibold text-blue-600 hover:underline">查看全部日志</Link>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {loading && audits.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
            ) : audits.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-300 text-sm">暂无最新流转事件</div>
            ) : (
              audits.map((a, i) => (
                <div key={a.id ?? i} className="flex gap-3 p-2.5 rounded-xl hover:bg-neutral-50 transition-colors">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${a.success === false ? 'bg-red-500' : 'bg-blue-500'}`} />
                    <div className="w-0.5 flex-1 bg-neutral-100" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-neutral-500 bg-white border border-neutral-200 px-1.5 py-0.5 rounded-md font-mono">
                          {a.logType ?? '-'}
                        </span>
                        {a.source && (() => {
                          const cfg: Record<string, { label: string; icon: typeof Globe; color: string }> = {
                            external: { label: '外部', icon: Globe, color: 'text-sky-500' },
                            gateway:  { label: '网关', icon: Server, color: 'text-indigo-500' },
                            internal: { label: '内部', icon: Link2, color: 'text-teal-500' },
                            system:   { label: '系统', icon: Cog, color: 'text-neutral-400' },
                          };
                          const src = cfg[a.source];
                          if (!src) return null;
                          const Icon = src.icon;
                          return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${src.color}`}><Icon size={10}/>{src.label}</span>;
                        })()}
                      </div>
                      <span className="text-[11px] font-medium text-neutral-400">
                        {a.createTime ? new Date(a.createTime).toLocaleTimeString('zh-CN', { hour12: false }) : ''}
                      </span>
                    </div>
                    <p className="text-[13px] text-neutral-700 leading-relaxed truncate" title={a.description ?? a.changeSummary ?? a.requestUri ?? ''}>
                      {a.errorMessage
                        ? <span className="text-red-500">{a.errorMessage}</span>
                        : a.changeSummary
                          ? <span className="text-emerald-600 font-mono text-[11px]">{a.changeSummary}</span>
                          : (a.description ?? (a.requestUri ? `${a.requestMethod} ${a.requestUri}` : '-'))}
                    </p>
                    {(a.module || a.serviceName) && (
                      <div className="flex gap-2 mt-2">
                        {a.module && <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md font-mono truncate max-w-[150px]">{a.module}{a.operation ? ` / ${a.operation}` : ''}</span>}
                        {a.serviceName && <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-md font-mono truncate max-w-[150px]">{a.serviceName}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：在线智能体列表 */}
        <div className={`${THEME.card} p-0 flex flex-col min-h-[380px]`}>
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Cpu size={15} className="text-purple-500" /> 在线智能体 (Routable Agents)
            </h3>
            <Link to="/orrery/agents" className="text-[11px] font-semibold text-purple-600 hover:underline">查看完整列表</Link>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {loading && agents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
            ) : agents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-300 text-sm">集群无可用智能体</div>
            ) : (
              agents.slice(0, 8).map(agent => (
                <div key={agent.agentId} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-neutral-100 hover:border-purple-200 hover:shadow-sm bg-neutral-50/50 transition-all group">
                  <div className="w-7 h-7 rounded-lg bg-white border border-neutral-200 flex items-center justify-center flex-shrink-0 group-hover:border-purple-300">
                    <Bot size={13} className="text-neutral-600 group-hover:text-purple-600 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-black truncate">{agent.name || agent.agentId}</p>
                    <p className="text-[10px] text-neutral-400 font-mono truncate">{agent.agentId}</p>
                  </div>
                  {agent.serviceName && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] flex-shrink-0" title="Online" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrreryPortal;
