import React, { useMemo } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  Database,
  Globe2,
  LayoutDashboard,
  Layers,
  LucideIcon,
  Menu as MenuIcon,
  MessageSquareCode,
  ScrollText,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useUIStore } from '../store/useUIStore';
import { THEME } from '../styles/theme';

type SidebarContext = 'system' | 'orrery' | 'knowledge';

type MenuItem =
  | { name: string; icon: LucideIcon; path: string; section?: false }
  | { name: string; section: true; icon?: never; path?: never };

const menuMap: Record<SidebarContext, MenuItem[]> = {
  system: [
    { name: '管理概览', icon: LayoutDashboard, path: '/system' },
    { name: '身份治理', section: true },
    { name: '成员管理', icon: Users, path: '/system/users' },
    { name: '角色权限', icon: Shield, path: '/system/roles' },
    { name: '菜单配置', icon: MenuIcon, path: '/system/menus' },
    { name: '系统监控', section: true },
    { name: '调用链路日志', icon: ScrollText, path: '/system/audit' },
    { name: '平台配置', section: true },
    { name: '大模型提供商', icon: Bot, path: '/system/llm-providers' },
  ],
  knowledge: [
    { name: '数字化看板', icon: LayoutDashboard, path: '/dashboard' },
    { name: '知识库', icon: Database, path: '/knowledge' },
    { name: '知识应用', section: true },
    { name: '智慧检索', icon: Search, path: '/knowledge/search' },
    { name: '知识问答', icon: MessageSquareCode, path: '/knowledge/chat' },
  ],
  orrery: [
    { name: '管家总览', icon: Cpu, path: '/orrery' },
    { name: '编排运行', section: true },
    { name: '管家对话', icon: MessageSquareCode, path: '/orrery/invoke' },
    { name: '多智能体路由', icon: Bot, path: '/orrery/agents' },
    { name: '记忆档案', icon: Brain, path: '/orrery/memory' },
    { name: '协作任务监控', icon: ClipboardList, path: '/orrery/tasks' },
    { name: '想定推演编排', icon: Globe2, path: '/orrery/scenario' },
    { name: '配置管理', section: true },
    { name: 'Workspace 配置', icon: Layers, path: '/orrery/workspace' },
  ],
};

const systemNames: Record<SidebarContext, string> = {
  system: '系统管理',
  orrery: '智能管家',
  knowledge: '知识库',
};

const systemInitials: Record<SidebarContext, string> = {
  system: 'Sys',
  orrery: 'Bu',
  knowledge: 'Kb',
};

interface SidebarContentProps {
  collapsed: boolean;
  context: SidebarContext;
  onNavigate?: () => void;
}

const SidebarContent: React.FC<SidebarContentProps> = ({ collapsed, context, onNavigate }) => {
  const menus = menuMap[context];

  return (
    <>
      <Link
        to="/portal"
        onClick={onNavigate}
        className={`flex h-20 flex-shrink-0 items-center border-b border-white/25 transition-all duration-300 ${
          collapsed ? 'justify-center px-0' : 'px-6'
        }`}
      >
        <div className="flex items-center">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-black shadow-lg transition-transform hover:scale-105">
            <span className="text-base font-black text-white">{systemInitials[context]}</span>
          </div>
          <span
            className={`ml-3 overflow-hidden whitespace-nowrap text-lg font-black tracking-tight text-black transition-all duration-300 ${
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}
          >
            {systemNames[context]}
          </span>
        </div>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
        <nav className="scrollbar-hide flex-1 space-y-1.5 overflow-y-auto px-2">
          {menus.map((item, index) => {
              if (item.section) {
                return collapsed ? (
                  <div key={`${item.name}-${index}`} className="mx-3 my-3 h-px bg-white/30" />
                ) : (
                  <div
                    key={`${item.name}-${index}`}
                    className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400"
                  >
                    {item.name}
                  </div>
                );
              }

              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/system' || item.path === '/orrery'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center rounded-2xl transition-all ${
                      collapsed ? 'mx-auto h-12 w-12 justify-center' : 'h-12 px-4'
                    } ${
                      isActive
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-500 hover:bg-white/55 hover:text-black'
                    }`
                  }
                  title={collapsed ? item.name : undefined}
                >
                  <Icon size={19} className={`${collapsed ? '' : 'mr-3'} flex-shrink-0 opacity-80 transition-opacity group-hover:opacity-100`} />
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                      <ChevronRight size={14} className="opacity-0 transition-opacity group-hover:opacity-30" />
                    </>
                  )}
                  {collapsed && (
                    <div className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl transition-all -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100">
                      {item.name}
                    </div>
                  )}
                </NavLink>
              );
            })}
        </nav>
      </div>
    </>
  );
};

const Sidebar: React.FC = () => {
  const { sidebarCollapsed, mobileSidebarOpen, toggleSidebar, closeMobileSidebar } = useUIStore();
  const { pathname } = useLocation();

  const context = useMemo<SidebarContext>(() => {
    if (pathname.startsWith('/system') || pathname.startsWith('/admin')) return 'system';
    if (pathname.startsWith('/orrery')) return 'orrery';
    return 'knowledge';
  }, [pathname]);

  return (
    <>
      <aside
        className={`relative z-30 hidden h-full flex-col p-3 transition-all duration-300 ease-out sm:flex ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/40 ${THEME.glassPanel}`}>
          <SidebarContent collapsed={sidebarCollapsed} context={context} />
        </div>

        <button
          onClick={toggleSidebar}
          className="absolute right-3 top-9 z-40 flex h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-neutral-100 bg-white shadow-lg transition-all hover:scale-105 hover:bg-black hover:text-white"
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeMobileSidebar} />
          <aside className="relative h-full w-[88vw] max-w-[320px] p-3">
            <div className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/40 shadow-2xl ${THEME.glassPanel}`}>
              <button
                onClick={closeMobileSidebar}
                className="absolute right-4 top-6 z-20 flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-neutral-500 shadow-sm transition-all hover:text-black"
                title="关闭导航菜单"
                aria-label="关闭导航菜单"
              >
                <X size={18} />
              </button>
              <SidebarContent collapsed={false} context={context} onNavigate={closeMobileSidebar} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
