import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Database, Settings, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../shared/store/useAuthStore';

const Portal: React.FC = () => {
  const { user } = useAuthStore();

  const apps = [
    {
      title: '知识库',
      desc: '企业级文档资产管理与深度语义检索中心。',
      path: '/dashboard',
      icon: Database,
      color: 'bg-blue-600',
      bgGradient: 'from-blue-500/10 to-cyan-500/10',
    },
    {
      title: '系统管理',
      desc: '组织架构、人员权限与系统参数配置。',
      path: '/system',
      icon: Settings,
      color: 'bg-orange-600',
      bgGradient: 'from-orange-500/10 to-amber-500/10',
    },
    {
      title: '智能管家',
      desc: '智能管家编排调度、多智能体协同与想定推演平台。',
      path: '/orrery',
      icon: Bot,
      color: 'bg-emerald-600',
      bgGradient: 'from-emerald-500/10 to-teal-500/10',
    },
  ];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-[#F4F4F7]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-5%] top-[-10%] h-[420px] w-[420px] rounded-full bg-purple-200/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] h-[520px] w-[520px] rounded-full bg-blue-200/20 blur-[120px]" />
      </div>

      <div className="z-10 flex w-full max-w-[1280px] flex-col items-center px-6 sm:px-8">
        <div className="mb-10 space-y-4 text-center sm:mb-14">
          <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[24px] bg-black shadow-2xl shadow-black/20 transition-transform duration-500 hover:scale-105 animate-float">
            <ShieldCheck className="h-9 w-9 text-white" />
          </div>
          <div>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-black sm:text-4xl">
              欢迎回来，{user?.nickname || '指挥官'}
            </h1>
            <p className="text-base font-medium text-neutral-500">Orrery 智能平台已准备就绪，请选择你的工作区域。</p>
          </div>
        </div>

        <div className="grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
          {apps.map((app) => (
            <Link
              key={app.path}
              to={app.path}
              className="group relative flex h-[240px] flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/65 p-6 shadow-xl backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:border-white hover:shadow-2xl"
            >
              <div className={`absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${app.bgGradient} blur-3xl opacity-0 transition-opacity duration-700 group-hover:opacity-100`} />

              <div className="relative z-10 flex h-full flex-col">
                <div className="mb-5 flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] ${app.color} text-white shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                    <app.icon size={24} strokeWidth={1.75} />
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-100 bg-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                    <ArrowRight size={15} />
                  </div>
                </div>

                <h3 className="mb-3 text-xl font-black text-black transition-colors group-hover:text-neutral-800">
                  {app.title}
                </h3>

                <p className="line-clamp-3 text-sm font-medium leading-relaxed text-neutral-500">{app.desc}</p>

                <div className="mt-auto pt-5">
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-neutral-200">
                    <div className={`h-full w-0 ${app.color} transition-all duration-700 ease-out group-hover:w-full`} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-300 sm:mt-14">
          Orrery Intelligence Platform
        </div>
      </div>
    </div>
  );
};

export default Portal;
