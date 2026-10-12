
import React, { useEffect, useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Activity, 
  Server, 
  Cpu, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Lock,
  Database
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { THEME } from '../../shared/styles/theme';
import { userService, roleService } from '../../shared/services/system.service';

const AdminPortal: React.FC = () => {
  const [stats, setStats] = useState({
    userCount: 0,
    activeUserCount: 0,
    roleCount: 0,
    systemHealth: 98
  });

  // 模拟图表数据
  const activityData = [
    { name: 'Mon', apiCalls: 2400, errors: 40 },
    { name: 'Tue', apiCalls: 1398, errors: 20 },
    { name: 'Wed', apiCalls: 9800, errors: 120 },
    { name: 'Thu', apiCalls: 3908, errors: 50 },
    { name: 'Fri', apiCalls: 4800, errors: 80 },
    { name: 'Sat', apiCalls: 3800, errors: 30 },
    { name: 'Sun', apiCalls: 4300, errors: 45 },
  ];

  // 模拟日志数据
  const auditLogs = [
    { id: 1, action: '用户登录', user: 'admin', ip: '192.168.1.10', time: '10:23:45', status: 'success' },
    { id: 2, action: '更新角色权限', user: 'super_admin', ip: '192.168.1.15', time: '09:12:30', status: 'success' },
    { id: 3, action: '创建知识库', user: 'editor_zhang', ip: '10.0.0.5', time: '08:45:11', status: 'success' },
    { id: 4, action: '尝试越权访问', user: 'unknown', ip: '172.16.0.22', time: '03:11:09', status: 'failed' },
    { id: 5, action: '系统备份', user: 'system', ip: 'localhost', time: '02:00:00', status: 'success' },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, rolesRes] = await Promise.all([
          userService.listAll(),
          roleService.listAll()
        ]);
        
        // 模拟计算活跃用户（实际应从后端获取）
        const allUsers = usersRes.data || [];
        const activeUsers = allUsers.filter((u: any) => u.status === 1).length;

        setStats({
          userCount: allUsers.length,
          activeUserCount: activeUsers,
          roleCount: (rolesRes.data || []).length,
          systemHealth: 99
        });
      } catch (error) {
        console.error('Failed to fetch system stats');
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-8 py-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">系统运行状态</h1>
          <p className="text-neutral-500 mt-1 font-medium text-[13px]">实时监控与安全审计概览</p>
        </div>
        <div className="flex items-center space-x-2 text-[11px] font-semibold bg-white px-3 py-1.5 rounded-xl border border-neutral-100 shadow-sm text-green-600">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          <span>服务运行正常</span>
        </div>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${THEME.glassPanel} p-5 rounded-2xl relative overflow-hidden group`}>
          <div className="absolute right-[-20px] top-[-20px] text-neutral-50 group-hover:text-blue-50 transition-colors duration-500">
            <Users size={120} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Users size={18} />
              </div>
              <span className={THEME.label}>注册用户</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-bold text-black">{stats.userCount}</h3>
              <p className="text-[11px] text-neutral-400 font-medium">其中 {stats.activeUserCount} 位状态活跃</p>
            </div>
          </div>
        </div>

        <div className={`${THEME.glassPanel} p-5 rounded-2xl relative overflow-hidden group`}>
          <div className="absolute right-[-20px] top-[-20px] text-neutral-50 group-hover:text-purple-50 transition-colors duration-500">
            <ShieldCheck size={120} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <ShieldCheck size={18} />
              </div>
              <span className={THEME.label}>权限角色</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-bold text-black">{stats.roleCount}</h3>
              <p className="text-[11px] text-neutral-400 font-medium">RBAC 安全策略模型</p>
            </div>
          </div>
        </div>

        <div className={`${THEME.glassPanel} p-5 rounded-2xl relative overflow-hidden group`}>
          <div className="absolute right-[-20px] top-[-20px] text-neutral-50 group-hover:text-orange-50 transition-colors duration-500">
            <Activity size={120} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
                <Activity size={18} />
              </div>
              <span className={THEME.label}>系统负载</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-bold text-black">12%</h3>
              <p className="text-[11px] text-neutral-400 font-medium">CPU 与 内存占用率健康</p>
            </div>
          </div>
        </div>

        <div className={`${THEME.glassPanel} p-5 rounded-2xl relative overflow-hidden group`}>
          <div className="absolute right-[-20px] top-[-20px] text-neutral-50 group-hover:text-emerald-50 transition-colors duration-500">
            <Server size={120} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Server size={18} />
              </div>
              <span className={THEME.label}>健康评分</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-bold text-black">{stats.systemHealth}</h3>
              <p className="text-[11px] text-neutral-400 font-medium">各项服务指标运行良好</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 流量趋势图 */}
        <div className={`lg:col-span-2 ${THEME.glassPanel} p-6 rounded-2xl`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-black">API 调用趋势</h3>
              <p className="text-[11px] text-neutral-400 mt-1">近 7 天系统接口访问量统计</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center text-[10px] font-bold text-neutral-400">
                <div className="w-2 h-2 bg-black rounded-full mr-2"></div>
                调用量
              </div>
              <div className="flex items-center text-[10px] font-bold text-neutral-400 ml-4">
                <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
                异常
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000000" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fill: '#a3a3a3'}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fill: '#a3a3a3'}} 
                />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'}}
                  itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                />
                <Area 
                  type="monotone" 
                  dataKey="apiCalls" 
                  stroke="#000000" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorApi)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="errors" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorError)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 实时审计日志 */}
        <div className={`${THEME.glassPanel} p-6 rounded-2xl flex flex-col`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-black">安全审计日志</h3>
            <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
              <Lock size={13} />
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="space-y-4">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2.5 p-2.5 hover:bg-white/50 rounded-xl transition-colors border border-transparent hover:border-white/60">
                  <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-neutral-800">{log.action}</p>
                      <span className="text-[10px] text-neutral-300 font-mono">{log.time}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-neutral-400">操作人: {log.user}</p>
                      <p className="text-[10px] text-neutral-300 font-mono">{log.ip}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* 底部渐变遮罩，提示还有更多 */}
            <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-white/80 to-transparent pointer-events-none"></div>
          </div>
          <button className="w-full mt-4 py-3 rounded-2xl bg-neutral-50 text-neutral-400 text-xs font-bold hover:bg-black hover:text-white transition-all uppercase tracking-widest">
            查看全部日志
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className={`${THEME.glassPanel} p-6 rounded-[32px] flex items-center justify-between`}>
            <div className="flex items-center space-x-4">
               <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                  <Cpu size={24} />
               </div>
               <div>
                  <h4 className="font-bold text-black">Redis 缓存节点</h4>
                  <p className="text-xs text-neutral-400 mt-0.5">连接状态正常，命中率 94%</p>
               </div>
            </div>
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
         </div>
         <div className={`${THEME.glassPanel} p-6 rounded-[32px] flex items-center justify-between`}>
            <div className="flex items-center space-x-4">
               <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center">
                  <Database size={24} />
               </div>
               <div>
                  <h4 className="font-bold text-black">PGVector 向量库</h4>
                  <p className="text-xs text-neutral-400 mt-0.5">存储 1.2GB，索引构建完成</p>
               </div>
            </div>
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
         </div>
      </div>
    </div>
  );
};

// 临时导入 Database 图标

export default AdminPortal;
