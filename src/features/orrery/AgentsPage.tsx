
import React, { useEffect, useState } from 'react';
import { butlerService, AgentEntry, CapabilitySummary } from '../../shared/services/orrery.service';
import { Bot, RefreshCw, Search, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { THEME } from '../../shared/styles/theme';

const AgentsPage: React.FC = () => {
  const [agents, setAgents]     = useState<AgentEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [query, setQuery]       = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await butlerService.listAgents();
      setAgents(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = query
    ? agents.filter(a =>
        a.agentId.toLowerCase().includes(query.toLowerCase()) ||
        (a.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (a.serviceName ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : agents;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-black tracking-tighter">多智能体路由</h1>
          <p className="text-neutral-400 text-sm font-medium mt-1">查询编排引擎当前加载的可路由 Agent</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold bg-black text-white hover:bg-neutral-800 transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 搜索 */}
      <div className={`max-w-md ${THEME.searchWrapper}`}>
        <Search className={THEME.searchIcon} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索 Agent ID / 名称 / 服务名..."
          className={THEME.searchInput}
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-red-500">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-neutral-300 gap-3">
          <Bot size={32} strokeWidth={1} />
          <span className="text-sm">暂无可路由 Agent</span>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(agent => (
            <div key={agent.agentId} className={`${THEME.card} overflow-hidden`}>
              <button
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-neutral-50/50 transition-colors"
                onClick={() => setExpanded(prev => prev === agent.agentId ? null : agent.agentId)}
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Bot size={18} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-black truncate">{agent.name ?? agent.agentId}</p>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5 truncate">{agent.agentId}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {agent.serviceName && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-bold">{agent.serviceName}</span>
                  )}
                  {agent.version && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-neutral-100 text-neutral-500 font-bold">v{agent.version}</span>
                  )}
                  {expanded === agent.agentId ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                </div>
              </button>

              {expanded === agent.agentId && (
                <div className="px-6 pb-5 pt-0 border-t border-neutral-100 space-y-4">
                  {agent.capabilitySummaries && agent.capabilitySummaries.length > 0 && (
                    <div>
                      <p className={`${THEME.label} mb-2`}>能力列表</p>
                      <div className="flex flex-wrap gap-2">
                        {agent.capabilitySummaries.map((cap: CapabilitySummary) => (
                          <span key={cap.capabilityId} className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 text-[11px] font-bold" title={cap.summary}>
                            {cap.name ?? cap.capabilityId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agent.tags && agent.tags.length > 0 && (
                    <div>
                      <p className={`${THEME.label} mb-2`}>标签</p>
                      <div className="flex flex-wrap gap-2">
                        {agent.tags.map(t => (
                          <span key={t} className="px-3 py-1.5 rounded-xl bg-neutral-100 text-neutral-600 text-[11px] font-bold">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentsPage;
