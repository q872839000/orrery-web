import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { taskService, TaskPlan, ExecutionTrace } from '../../shared/services/orrery.service';
import {
  Search, CheckCircle, XCircle, AlertCircle, Clock, Loader2, RefreshCw, ChevronRight,
  ScrollText, Gauge, Timer, Coins, FileCode2,
} from 'lucide-react';
import { THEME } from '../../shared/styles/theme';
import TaskRunGraph from './TaskRunGraph';

const BUTLER_SESSION_KEY = 'butler_session_id';

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  CREATED:              { bg: 'bg-slate-100',   text: 'text-slate-600',   label: '已创建' },
  RUNNING:              { bg: 'bg-blue-50',     text: 'text-blue-600',    label: '运行中' },
  WAITING_CONFIRMATION: { bg: 'bg-amber-50',    text: 'text-amber-600',   label: '待确认' },
  COMPLETED:            { bg: 'bg-emerald-50',  text: 'text-emerald-600', label: '已完成' },
  FAILED:               { bg: 'bg-red-50',      text: 'text-red-500',     label: '失败' },
  CANCELED:             { bg: 'bg-neutral-100', text: 'text-neutral-500', label: '已取消' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = STATUS_CFG[status] ?? { bg: 'bg-neutral-100', text: 'text-neutral-500', label: status };
  const Icon = status === 'COMPLETED' ? CheckCircle
    : status === 'FAILED' ? XCircle
    : status === 'RUNNING' ? Loader2
    : status === 'WAITING_CONFIRMATION' ? Clock
    : AlertCircle;
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${c.bg} ${c.text}`}>
      <Icon size={11} className={status === 'RUNNING' ? 'animate-spin' : ''} />
      {c.label}
    </span>
  );
};

const ENGINE_LABEL: Record<string, string> = {
  direct: '直答', react: '主循环', dag: '计划DAG', subagent: '子Agent',
};

/** 计划宪法横幅（L2/L3 计划路径挂载的原始指令/约束/验收标准） */
const ConstitutionBanner: React.FC<{ task: TaskPlan }> = ({ task }) => (
  <div className="px-6 py-4 border-b border-neutral-100 bg-amber-50/40">
    <div className="flex items-center gap-2 mb-2">
      <ScrollText size={13} className="text-amber-600" />
      <p className="text-xs font-bold text-amber-700">
        计划宪法
        {task.complexityLevel && (
          <span className="ml-2 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px]">
            {task.complexityLevel}
          </span>
        )}
      </p>
    </div>
    <p className="text-xs text-neutral-700 leading-relaxed">{task.userMessage}</p>
    {(task.constraints?.length ?? 0) > 0 && (
      <p className="text-[11px] text-neutral-500 mt-1.5">
        <span className="font-bold text-neutral-600">约束：</span>{task.constraints!.join('；')}
      </p>
    )}
    {(task.acceptanceCriteria?.length ?? 0) > 0 && (
      <p className="text-[11px] text-neutral-500 mt-1">
        <span className="font-bold text-neutral-600">验收：</span>{task.acceptanceCriteria!.join('；')}
      </p>
    )}
    {task.classifyRationale && (
      <p className="text-[10px] text-neutral-400 mt-1.5">定级理由：{task.classifyRationale}</p>
    )}
  </div>
);

/** 执行轨迹条（引擎 × 终态 × token × 耗时） */
const TracesStrip: React.FC<{ traces: ExecutionTrace[] }> = ({ traces }) => {
  if (!traces.length) return null;
  const totalTokens = traces.reduce(
    (sum, t) => sum + (t.promptTokens ?? 0) + (t.completionTokens ?? 0), 0);
  const totalMs = traces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  return (
    <div className="px-6 py-4 border-b border-neutral-100">
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={13} className="text-neutral-400" />
        <p className="text-xs font-bold text-neutral-500">
          执行轨迹
          <span className="ml-2 text-neutral-400 font-normal">
            {traces.length} 次运行 · <Coins size={10} className="inline -mt-0.5" /> {totalTokens.toLocaleString()} tokens ·
            <Timer size={10} className="inline -mt-0.5" /> {(totalMs / 1000).toFixed(1)}s
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {traces.map((t, i) => (
          <div key={t.id ?? i}
            className={`px-3 py-2 rounded-xl border text-[11px] ${
              t.stopStatus === 'FAILED' || t.errorCode
                ? 'border-red-200 bg-red-50/50' : 'border-neutral-100 bg-neutral-50/60'
            }`}
          >
            <p className="font-bold text-neutral-700">
              {ENGINE_LABEL[t.engine] ?? t.engine}
              {t.runId !== t.taskId && <span className="text-neutral-400 font-normal"> · {t.runId.split('/').pop()}</span>}
            </p>
            <p className="text-neutral-500 mt-0.5">
              {t.stopStatus ?? '-'}
              {(t.promptTokens ?? 0) + (t.completionTokens ?? 0) > 0 &&
                ` · ${(t.promptTokens ?? 0) + (t.completionTokens ?? 0)} tok`}
              {t.durationMs != null && ` · ${(t.durationMs / 1000).toFixed(1)}s`}
            </p>
            <p className="text-[10px] text-neutral-400 font-mono mt-0.5 flex items-center gap-1">
              {t.promptVersion && <><FileCode2 size={9} />{t.promptVersion}</>}
              {t.executedCount != null && ` · ${t.executedCount}/${(t.executedCount ?? 0) + (t.droppedCount ?? 0)}节点`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const TaskDetail: React.FC<{ task: TaskPlan; events: any[]; traces: ExecutionTrace[]; acting: string | null; onConfirm: () => void; onCancel: () => void }> = ({
  task, events, traces, acting, onConfirm, onCancel,
}) => (
  <div className={`${THEME.card} overflow-hidden`}>
    <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-black text-black font-mono truncate">{task.taskId}</p>
        {task.userMessage && <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{task.userMessage}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={task.status} />
        {task.status === 'WAITING_CONFIRMATION' && (<>
          <button onClick={onConfirm} disabled={!!acting} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50">
            {acting === 'confirm' ? <Loader2 size={12} className="animate-spin" /> : '确认'}
          </button>
          <button onClick={onCancel} disabled={!!acting} className="px-3 py-1.5 rounded-xl bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-all disabled:opacity-50">
            {acting === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : '取消'}
          </button>
        </>)}
        {(task.status === 'RUNNING' || task.status === 'CREATED') && (
          <button onClick={onCancel} disabled={!!acting} className="px-3 py-1.5 rounded-xl bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-all disabled:opacity-50">
            {acting === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : '取消任务'}
          </button>
        )}
      </div>
    </div>

    {task.complexityLevel && <ConstitutionBanner task={task} />}

    {task.steps && task.steps.length > 0 && (
      <div className="px-6 py-4 border-b border-neutral-100">
        <TaskRunGraph steps={task.steps} height={420} />
      </div>
    )}

    {traces.length > 0 && <TracesStrip traces={traces} />}

    {events.length > 0 && (
      <div className="px-6 py-4">
        <p className={`${THEME.label} mb-3`}>事件日志</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {events.map((ev: any, i: number) => {
            // 步骤级事件回退显示步骤描述/目标名，stepId（N1…）对用户无意义
            const refStep = ev.stepId ? task.steps?.find(s => s.stepId === ev.stepId) : undefined;
            const text = ev.message ?? ev.payload?.error ?? ev.payload?.confirmMessage
              ?? refStep?.description ?? refStep?.targetName ?? ev.stepId ?? JSON.stringify(ev);
            return (
              <div key={i} className="flex items-start gap-3 text-[11px]">
                <span className="text-neutral-300 font-mono w-28 flex-shrink-0 mt-0.5">{ev.eventType ?? ev.type ?? '-'}</span>
                <span className="text-neutral-600">{text}</span>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
);

const TasksPage: React.FC = () => {
  const sessionId = localStorage.getItem(BUTLER_SESSION_KEY) ?? '';
  const [searchParams] = useSearchParams();

  const [sessionTasks, setSessionTasks] = useState<TaskPlan[]>([]);
  const [recentTasks, setRecentTasks] = useState<TaskPlan[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [sessLoading, setSessLoading]   = useState(false);
  const [taskId, setTaskId]             = useState('');
  const [task, setTask]                 = useState<TaskPlan | null>(null);
  const [events, setEvents]             = useState<any[]>([]);
  const [traces, setTraces]             = useState<ExecutionTrace[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [acting, setActing]             = useState<'confirm' | 'cancel' | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setSessLoading(true);
    try {
      const tasks = await taskService.listBySession(sessionId);
      tasks.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setSessionTasks(tasks);
    } catch { /* silent */ } finally {
      setSessLoading(false);
    }
  }, [sessionId]);

  /** 全局近期任务（监控主视角：所有用户的任务，非本会话过滤） */
  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const tasks = await taskService.listRecent(50);
      tasks.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setRecentTasks(tasks);
    } catch { /* silent */ } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  /** 列表视图轻量轮询（监控语义：5s 自动刷新近期任务） */
  useEffect(() => {
    const timer = window.setInterval(() => { void loadRecent(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadRecent]);

  /** URL 携带 taskId 时自动精确查询（从调用页「查看运行详情」跳转进入） */
  const prefilledRef = useRef(false);
  useEffect(() => {
    const fromUrl = searchParams.get('taskId');
    if (fromUrl && !prefilledRef.current) {
      prefilledRef.current = true;
      setTaskId(fromUrl);
      (async () => {
        setLoading(true); setError(null);
        try {
          const [plan, evts, trs] = await Promise.all([
            taskService.getTask(fromUrl), taskService.getTaskEvents(fromUrl),
            taskService.getTaskTraces(fromUrl)]);
          setTask(plan);
          setEvents(evts);
          setTraces(trs);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
      })();
    }
  }, [searchParams]);

  const query = async () => {
    const id = taskId.trim();
    if (!id) return;
    setLoading(true); setError(null); setTask(null); setEvents([]); setTraces([]);
    try {
      const [plan, evts, trs] = await Promise.all([
        taskService.getTask(id), taskService.getTaskEvents(id), taskService.getTaskTraces(id)]);
      setTask(plan);
      setEvents(evts);
      setTraces(trs);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const selectTask = async (t: TaskPlan) => {
    setLoading(true); setError(null); setTask(null); setEvents([]); setTraces([]);
    try {
      const [evts, trs] = await Promise.all([
        taskService.getTaskEvents(t.taskId), taskService.getTaskTraces(t.taskId)]);
      setTask(t);
      setEvents(evts);
      setTraces(trs);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  /** 运行中自动轮询（4s）：计划/事件/轨迹同步刷新，终态即停 */
  useEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (!task || (task.status !== 'RUNNING' && task.status !== 'CREATED')) return;
    const id = task.taskId;
    pollRef.current = window.setInterval(async () => {
      try {
        const [plan, evts, trs] = await Promise.all([
          taskService.getTask(id), taskService.getTaskEvents(id), taskService.getTaskTraces(id)]);
        setTask(plan);
        setEvents(evts);
        setTraces(trs);
      } catch { /* 保持旧数据 */ }
    }, 4000);
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [task?.taskId, task?.status]);

  const confirm = async () => {
    if (!task) return;
    setActing('confirm');
    try { setTask(await taskService.confirmTask(task.taskId)); }
    catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  const cancel = async () => {
    if (!task) return;
    setActing('cancel');
    try { setTask(await taskService.cancelTask(task.taskId)); }
    catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-black tracking-tighter">协作任务监控</h1>
          <p className="text-neutral-400 text-sm font-medium mt-1">实时查看任务生命周期流转</p>
        </div>
        <button onClick={() => { loadRecent(); loadSession(); }} disabled={sessLoading || recentLoading} className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold bg-black text-white hover:bg-neutral-800 transition-all disabled:opacity-50">
          <RefreshCw size={13} className={sessLoading || recentLoading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 近期任务（全局监控视角，默认主列表） */}
      <div>
        <p className={`${THEME.label} mb-3`}>近期任务（全部）</p>
        {recentLoading ? (
          <div className="h-20 flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
        ) : recentTasks.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-neutral-300 text-sm">暂无任务记录</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {recentTasks.map(t => (
              <button
                key={t.taskId}
                onClick={() => selectTask(t)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all hover:shadow-sm ${
                  task?.taskId === t.taskId ? 'border-black bg-black/[0.02]' : 'border-neutral-100 bg-white hover:border-neutral-200'
                }`}
              >
                <StatusBadge status={t.status} />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-mono text-neutral-400 truncate">{t.taskId}</span>
                  {t.userMessage && <span className="block text-xs text-neutral-600 truncate mt-0.5">{t.userMessage}</span>}
                </span>
                <ChevronRight size={14} className="text-neutral-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 当前会话任务列表（次级视角） */}
      {sessionId && (
        <div>
          <p className={`${THEME.label} mb-3`}>
            当前会话任务
            <span className="ml-2 text-neutral-300 font-mono normal-case">{sessionId.slice(-13)}</span>
          </p>
          {sessLoading ? (
            <div className="h-20 flex items-center justify-center text-neutral-400 text-sm">加载中...</div>
          ) : sessionTasks.length === 0 ? (
            <div className="h-20 flex items-center justify-center text-neutral-300 text-sm">暂无任务记录</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {sessionTasks.map(t => (
                <button
                  key={t.taskId}
                  onClick={() => selectTask(t)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all hover:shadow-sm ${
                    task?.taskId === t.taskId ? 'border-black bg-black/[0.02]' : 'border-neutral-100 bg-white hover:border-neutral-200'
                  }`}
                >
                  <StatusBadge status={t.status} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-mono text-neutral-400 truncate">{t.taskId}</span>
                    {t.userMessage && <span className="block text-xs text-neutral-600 truncate mt-0.5">{t.userMessage}</span>}
                  </span>
                  <ChevronRight size={14} className="text-neutral-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task ID 精确查询 - 修复布局 */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className={`flex-1 sm:max-w-md ${THEME.searchWrapper}`}>
          <Search className={THEME.searchIcon} />
          <input
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && query()}
            placeholder="输入 Task ID 精确查询..."
            className={THEME.searchInput}
          />
        </div>
        <button onClick={query} disabled={loading || !taskId.trim()} className="px-5 py-2.5 rounded-2xl bg-black text-white text-sm font-bold hover:bg-neutral-800 transition-all disabled:opacity-40 whitespace-nowrap">
          {loading ? <Loader2 size={16} className="animate-spin" /> : '查询'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-sm">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {task && (
        <TaskDetail
          task={task}
          events={events}
          traces={traces}
          acting={acting}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </div>
  );
};

export default TasksPage;
