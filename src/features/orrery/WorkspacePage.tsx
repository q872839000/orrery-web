
import React, { useEffect, useState } from 'react';
import { workspaceService, WorkspaceLayerInfo } from '../../shared/services/orrery.service';
import { Save, RefreshCw, Layers, ChevronRight, AlertCircle } from 'lucide-react';
import { THEME } from '../../shared/styles/theme';

const WorkspacePage: React.FC = () => {
  const [layers, setLayers]         = useState<WorkspaceLayerInfo[]>([]);
  const [active, setActive]         = useState<string | null>(null);
  const [content, setContent]       = useState('');
  const [origContent, setOrigContent] = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [reloading, setReloading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadLayers = async () => {
    setLoading(true); setError(null);
    try {
      const data = await workspaceService.listLayers();
      setLayers(data);
      if (data.length > 0 && !active) setActive(data[0].layer);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLayers(); }, []);

  useEffect(() => {
    if (!active) return;
    workspaceService.getLayer(active).then(info => {
      const body = info.body ?? '';
      setContent(body);
      setOrigContent(body);
    }).catch(e => setError(e.message));
  }, [active]);

  const save = async () => {
    if (!active) return;
    setSaving(true); setError(null); setSuccessMsg(null);
    try {
      await workspaceService.updateLayer(active, content);
      setOrigContent(content);
      setSuccessMsg(`${active} 层已更新`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    try {
      await workspaceService.reload();
      setSuccessMsg('Workspace 热重载成功');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReloading(false);
    }
  };

  const isDirty = content !== origContent;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-black tracking-tighter">Workspace 配置</h1>
          <p className="text-neutral-400 text-sm font-medium mt-1">协同环境、知识与工具的分层管理</p>
        </div>
        <button onClick={reload} disabled={reloading} className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-neutral-500 bg-white/60 border border-white/40 shadow-sm hover:text-black transition-all disabled:opacity-50">
          <RefreshCw size={13} className={reloading ? 'animate-spin' : ''} />
          热重载
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-sm flex-shrink-0">
          <AlertCircle size={15} />{error}
        </div>
      )}
      {successMsg && (
        <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm flex-shrink-0">{successMsg}</div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        {/* 层列表 */}
        <div className={`w-52 flex-shrink-0 ${THEME.card} p-3 flex flex-col gap-1 overflow-y-auto`}>
          <p className={`${THEME.label} mb-2 px-3`}>层列表</p>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-neutral-300 text-xs">加载中...</div>
          ) : layers.map(layer => (
            <button
              key={layer.layer}
              onClick={() => setActive(layer.layer)}
              className={`flex items-center justify-between w-full px-3 py-2.5 rounded-2xl text-xs font-bold text-left transition-all ${
                active === layer.layer
                  ? 'bg-black text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers size={13} />
                {layer.layer}
              </span>
              <ChevronRight size={12} className="opacity-50" />
            </button>
          ))}
        </div>

        {/* 编辑区 */}
        <div className={`flex-1 ${THEME.card} flex flex-col overflow-hidden`}>
          {active ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 flex-shrink-0">
                <div>
                  <span className="text-sm font-black text-black">{active}</span>
                  {isDirty && <span className="ml-2 text-[10px] text-amber-500 font-bold">未保存</span>}
                </div>
                <button
                  onClick={save}
                  disabled={saving || !isDirty}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-neutral-800 transition-all disabled:opacity-40"
                >
                  <Save size={13} />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="flex-1 resize-none px-5 py-4 font-mono text-xs text-neutral-700 outline-none bg-transparent"
                spellCheck={false}
                placeholder={`${active} 层内容为空`}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-300 text-sm">选择左侧层级查看内容</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
