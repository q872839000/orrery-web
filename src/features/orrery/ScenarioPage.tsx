import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  agentService,
  AgentChatRequest,
  ChatHistoryMessage,
  EquipmentInfo,
} from '../../shared/services/orrery.service';
import {
  Send, RotateCcw, Map as MapIcon, ChevronsLeftRight, ChevronsRightLeft, Upload, Loader2,
} from 'lucide-react';
import Select from '../../shared/components/ui/Select';

// Cesium 通过 index.html CDN 加载，通过 window.Cesium 访问
declare const Cesium: any;

// ─── 阵营常量 ─────────────────────────────────────────────────
const CLASSIFY_CESIUM: Record<string, string> = {
  red: 'RED', blue: 'DODGERBLUE', green: 'LIMEGREEN', white: 'WHITE',
};
const CLASSIFY_LABEL: Record<string, string> = {
  red: '红方', blue: '蓝方', green: '绿方', white: '白方',
};
const CLASSIFY_HEX: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', white: '#e2e8f0',
};
const CLASSIFY_TAG: Record<string, string> = {
  red: 'bg-red-500/18 text-red-300',
  blue: 'bg-blue-500/18 text-blue-300',
  green: 'bg-emerald-500/18 text-emerald-300',
  white: 'bg-white/12 text-slate-200',
};
const PHASE_LABEL: Record<string, string> = {
  thinking: '理解需求', planning: '生成方案',
  deploying: '部署装备', filling_params: '补全参数',
};

const HISTORY_LIMIT = 50;

// ─── 类型 ────────────────────────────────────────────────────
type DebugLevel = 'off' | 'minimal' | 'verbose' | 'trace';
type EquipStatus = 'loading' | 'ok' | 'error' | 'initing';

interface StageItem { stage: string; message: string; done: boolean; }

type ChatMsg =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'ai'; text: string }
  | { id: string; kind: 'tip'; text: string }
  | { id: string; kind: 'error'; text: string }
  | { id: string; kind: 'stages'; items: StageItem[]; finalized: boolean; pending: boolean }
  | {
      id: string;
      kind: 'approval';
      approvalId: string;
      summary: string;
      diff: any;
      state: 'pending' | 'processing' | 'approved' | 'rejected' | 'error';
      errorMsg?: string;
    };

interface ParsedPort { portName: string; params: any; }
interface GeoLocation { found: boolean; lon: number; lat: number; alt: number; }
interface InstanceView {
  raw: any;
  name: string;
  classify: string;
  equipName: string;
  parsedInits: ParsedPort[];
  geo: GeoLocation;
  entityId: string | null;
}

// ─── 工具函数 ─────────────────────────────────────────────────
const classifyKey = (c?: string) => (c ?? '').toLowerCase();
const cesiumColor = (c?: string) =>
  Cesium.Color[CLASSIFY_CESIUM[classifyKey(c)] ?? 'DODGERBLUE'];
const classifyTagClass = (c?: string) =>
  CLASSIFY_TAG[classifyKey(c)] ?? 'bg-white/10 text-slate-200';
const classifyHex = (c?: string) =>
  CLASSIFY_HEX[classifyKey(c)] ?? '#3b82f6';
const classifyLabel = (c?: string) =>
  CLASSIFY_LABEL[classifyKey(c)] ?? (c || '-');

function parseMaybeJson(value: any): any {
  if (value == null || value === '') return {};
  let parsed = value;
  for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
    try { parsed = JSON.parse(parsed); } catch { return value; }
  }
  return parsed;
}

function pickNumber(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const n = parseFloat(obj[k]);
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return null;
}

function findGeoInObject(value: any): GeoLocation {
  const empty: GeoLocation = { found: false, lon: 0, lat: 0, alt: 0 };
  if (!value || typeof value !== 'object') return empty;
  if (Array.isArray(value)) {
    for (const it of value) {
      const g = findGeoInObject(it);
      if (g.found) return g;
    }
    return empty;
  }
  const lon = pickNumber(value, ['lon', 'longitude', 'lng']);
  const lat = pickNumber(value, ['lat', 'latitude']);
  if (lon != null && lat != null && (lon !== 0 || lat !== 0)) {
    return { found: true, lon, lat, alt: pickNumber(value, ['alt', 'altitude', 'height']) ?? 0 };
  }
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (v && typeof v === 'object') {
      const g = findGeoInObject(v);
      if (g.found) return g;
    }
  }
  return empty;
}

function collectInitParams(item: any): ParsedPort[] {
  if (!item || !Array.isArray(item.inits)) return [];
  return item.inits.map((init: any, i: number): ParsedPort => ({
    portName: init?.portName || init?.name || `端口_${i + 1}`,
    params: init?.params !== undefined ? init.params : parseMaybeJson(init?.initJson),
  }));
}

function findInstanceGeo(item: any, parsedInits: ParsedPort[]): GeoLocation {
  const direct = findGeoInObject(item);
  if (direct.found) return direct;
  for (const p of parsedInits) {
    const g = findGeoInObject(p.params);
    if (g.found) return g;
  }
  return { found: false, lon: 0, lat: 0, alt: 0 };
}

function payloadMessage(payload: any): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try { return JSON.stringify(payload); } catch { return ''; }
}

function suggestionText(suggestions?: string[]): string {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return '';
  return '\n建议：\n- ' + suggestions.join('\n- ');
}

function toolEndMessage(d: { success?: boolean; error?: string; result?: any; durationMs?: number }): string {
  if (!d.success) return d.error || '执行失败';
  if (d.result && typeof d.result === 'object' && (d.result as any).message) return (d.result as any).message;
  return `执行成功，耗时 ${d.durationMs ?? 0}ms`;
}

function escapeHtml(s: any): string {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s == null ? '' : String(s)));
  return d.innerHTML;
}

function buildInstanceDescription(item: any, name: string, geo: GeoLocation, parsedInits: ParsedPort[]): string {
  let html =
    '<table class="cesium-infoBox-defaultTable"><tbody>' +
    `<tr><th>名称</th><td>${escapeHtml(name)}</td></tr>` +
    `<tr><th>装备</th><td>${escapeHtml(item.equipName ?? '-')}</td></tr>` +
    `<tr><th>阵营</th><td>${escapeHtml(classifyLabel(item.classify))}</td></tr>` +
    `<tr><th>经度</th><td>${escapeHtml(geo.lon.toFixed(6))}</td></tr>` +
    `<tr><th>纬度</th><td>${escapeHtml(geo.lat.toFixed(6))}</td></tr>` +
    `<tr><th>高度</th><td>${escapeHtml(String(geo.alt || 0))}</td></tr>` +
    '</tbody></table>';
  html += '<div style="margin:10px 0 6px;font-weight:600;">初始化参数</div>';
  if (!parsedInits.length) {
    html += '<div style="color:#94a3b8;">无初始化参数</div>';
  } else {
    html += '<table class="cesium-infoBox-defaultTable"><thead><tr><th>端口</th><th>参数</th><th>值</th></tr></thead><tbody>';
    for (const p of parsedInits) {
      const params = p.params;
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        const keys = Object.keys(params);
        if (!keys.length) {
          html += `<tr><td>${escapeHtml(p.portName)}</td><td>-</td><td>{}</td></tr>`;
        }
        for (const k of keys) {
          const val = params[k];
          const text = val == null ? '-'
            : typeof val === 'object' ? JSON.stringify(val, null, 2)
            : String(val);
          html += `<tr><td>${escapeHtml(p.portName)}</td><td>${escapeHtml(k)}</td>` +
            `<td><pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:inherit;">${escapeHtml(text)}</pre></td></tr>`;
        }
      } else {
        const text = params == null ? '-' : typeof params === 'object' ? JSON.stringify(params, null, 2) : String(params);
        html += `<tr><td>${escapeHtml(p.portName)}</td><td>initJson</td>` +
          `<td><pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:inherit;">${escapeHtml(text)}</pre></td></tr>`;
      }
    }
    html += '</tbody></table>';
  }
  return html;
}

// ─── 主组件 ──────────────────────────────────────────────────
const ScenarioPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef    = useRef<any>(null);
  const abortRef     = useRef<AbortController | null>(null);
  // entityId → Cesium entity，用于点击实例时聚焦
  const entitiesMapRef = useRef<Map<string, any>>(new Map());

  // taskId/scenarioId 用 ref 保存以便在 SSE 回调内读取最新值；React state 仅用于 UI 提示
  const taskIdRef    = useRef<string>(`task-${Date.now()}`);
  const scenarioIdRef = useRef<string>(`sc-${Date.now()}`);
  const libraryIdRef  = useRef<string>('knowledge-web-default-lib');
  const userIdRef     = useRef<string>('knowledge-web-user');

  // 流式状态
  const runIdRef     = useRef<string | null>(null);
  const lastSeqRef   = useRef<number>(0);
  // 前端自管历史
  const chatHistoryRef = useRef<ChatHistoryMessage[]>([]);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const chatBodyRef    = useRef<HTMLDivElement>(null);
  // 当前正在追加阶段事件的 stages 消息 ID
  const activeStagesIdRef = useRef<string | null>(null);

  const [cesiumReady,   setCesiumReady]   = useState(false);
  const [equipStatus,   setEquipStatus]   = useState<EquipStatus>('loading');
  const [equipCount,    setEquipCount]    = useState(0);
  const [equipmentList, setEquipmentList] = useState<EquipmentInfo[] | null>(null);
  const [messages,      setMessages]      = useState<ChatMsg[]>([
    {
      id: 'welcome',
      kind: 'ai',
      text: '你好，我是想定智能编排助手。\n你可以用自然语言描述想定需求，例如：\n\n"在台湾附近部署一场红蓝对抗"',
    },
  ]);
  const [instances,     setInstances]     = useState<InstanceView[]>([]);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [debugLevel, setDebugLevel] = useState<DebugLevel>('minimal');
  const [frontHistory, setFrontHistory] = useState(true);

  // ─── Cesium 初始化 ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof Cesium === 'undefined') {
      console.error('Cesium 未加载，请确认 index.html 已引入 Cesium CDN');
      return;
    }
    const viewer = new Cesium.Viewer(containerRef.current, {
      sceneMode: Cesium.SceneMode.SCENE2D,
      animation: false, baseLayerPicker: false, fullscreenButton: false,
      vrButton: false, geocoder: false, homeButton: false, infoBox: true,
      sceneModePicker: false, selectionIndicator: false, timeline: false,
      navigationHelpButton: false, navigationInstructionsInitiallyVisible: false,
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          { enablePickFeatures: false }
        )
      ),
    });
    viewer.cesiumWidget.creditContainer.style.display = 'none';
    viewerRef.current = viewer;
    setCesiumReady(true);
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  // ─── 自动滚动 ──────────────────────────────────────────────
  useEffect(() => {
    chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ─── 消息工具 ──────────────────────────────────────────────
  const appendMsg = useCallback((m: ChatMsg) => {
    setMessages(prev => [...prev, m]);
  }, []);

  const appendTip = useCallback((text: string) => {
    appendMsg({ id: `tip-${Date.now()}-${Math.random()}`, kind: 'tip', text });
  }, [appendMsg]);

  const appendError = useCallback((text: string) => {
    appendMsg({ id: `err-${Date.now()}-${Math.random()}`, kind: 'error', text });
  }, [appendMsg]);

  const appendAssistantReply = useCallback((text: string) => {
    if (!text) return;
    appendMsg({ id: `ai-${Date.now()}-${Math.random()}`, kind: 'ai', text });
    pushChatHistory('assistant', text);
  }, [appendMsg]);

  const pushChatHistory = (role: 'user' | 'assistant', content: string) => {
    const t = (content ?? '').trim();
    if (!t) return;
    const item: ChatHistoryMessage = { role, content: t };
    if (role === 'user') item.name = userIdRef.current;
    chatHistoryRef.current.push(item);
    if (chatHistoryRef.current.length > HISTORY_LIMIT) {
      chatHistoryRef.current = chatHistoryRef.current.slice(-HISTORY_LIMIT);
    }
  };

  // ─── 阶段时间轴 ────────────────────────────────────────────
  const ensureStageGroup = useCallback((): string => {
    let id = activeStagesIdRef.current;
    if (id) return id;
    id = `stages-${Date.now()}-${Math.random()}`;
    activeStagesIdRef.current = id;
    setMessages(prev => [
      ...prev,
      { id: id!, kind: 'stages', items: [], finalized: false, pending: true },
    ]);
    return id;
  }, []);

  const addStageItem = useCallback((stage: string, message: string) => {
    const id = ensureStageGroup();
    setMessages(prev => prev.map(m => {
      if (m.id !== id || m.kind !== 'stages') return m;
      const items: StageItem[] = m.items.map(s => ({ ...s, done: true }));
      items.push({ stage, message, done: false });
      return { ...m, items };
    }));
  }, [ensureStageGroup]);

  const finalizeStageGroup = useCallback(() => {
    const id = activeStagesIdRef.current;
    if (!id) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== id || m.kind !== 'stages') return m;
      return {
        ...m,
        finalized: true,
        pending: false,
        items: m.items.map(s => ({ ...s, done: true })),
      };
    }));
    activeStagesIdRef.current = null;
  }, []);

  // ─── 装备库初始化（缓存到 /agent/init） ────────────────────
  const initEquipmentOnServer = useCallback(async (list: EquipmentInfo[]) => {
    if (!list || list.length === 0) throw new Error('equipmentList 不能为空');
    setEquipStatus('initing');
    const data = await agentService.initEquipment({
      taskId: taskIdRef.current,
      libraryId: libraryIdRef.current,
      equipmentList: list,
    });
    setEquipCount(data.equipmentCount ?? list.length);
    setEquipStatus('ok');
  }, []);

  const loadEquipment = useCallback(async () => {
    setEquipStatus('loading');
    try {
      const data = await agentService.fetchSampleEquipment();
      setEquipmentList(data);
      await initEquipmentOnServer(data);
    } catch (e: any) {
      console.warn('装备库加载失败:', e);
      setEquipStatus('error');
      appendTip('装备库自动加载失败，可点击右上角装备状态选择 equipment.json。');
    }
  }, [appendTip, initEquipmentOnServer]);

  useEffect(() => { void loadEquipment(); /* eslint-disable-next-line */ }, []);

  // ─── 渲染 Cesium 实例 + 计算 InstanceView 列表 ─────────────
  const renderScenario = useCallback((arr: any[]) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    viewer.entities.removeAll();
    entitiesMapRef.current.clear();

    const list: any[] = Array.isArray(arr) ? arr : [];
    const rendered: InstanceView[] = [];
    const noGeo: string[] = [];
    let withGeo = 0;

    list.forEach((item, i) => {
      const name = item.otherName || item.equipName || `实例_${i}`;
      const parsedInits = collectInitParams(item);
      const geo = findInstanceGeo(item, parsedInits);
      const view: InstanceView = {
        raw: item, name,
        classify: item.classify || '',
        equipName: item.equipName || '',
        parsedInits, geo, entityId: null,
      };
      if (geo.found) {
        const eid = `e_${name}_${i}`;
        const color = cesiumColor(item.classify);
        const ent = viewer.entities.add({
          id: eid,
          position: Cesium.Cartesian3.fromDegrees(geo.lon, geo.lat, geo.alt || 0),
          point: { pixelSize: 10, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
          label: {
            text: name, font: '12px Inter, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12), fillColor: color,
          },
          description: buildInstanceDescription(item, name, geo, parsedInits),
        });
        entitiesMapRef.current.set(eid, ent);
        view.entityId = eid;
        withGeo++;
      } else {
        noGeo.push(name);
      }
      rendered.push(view);
    });

    if (withGeo > 0) {
      viewer.flyTo(viewer.entities, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, -Math.PI / 2, 5_000_000),
      });
    }
    setInstances(rendered);
    if (noGeo.length > 0) {
      setTimeout(() => appendTip(`以下实体无坐标，未在地图标出（可在右侧 Inspector 查看完整参数）：${noGeo.join('、')}`), 400);
    }
  }, [appendTip]);

  const refreshScenario = useCallback(async () => {
    try {
      const arr = await agentService.exportScenario(taskIdRef.current);
      renderScenario(arr);
    } catch (e) {
      // 404（任务无状态）等场景属正常情况，不阻塞用户
      console.debug('想定导出失败（可忽略）:', e);
    }
  }, [renderScenario]);

  const focusEntity = useCallback((entityId: string | null) => {
    if (!entityId) return;
    const viewer = viewerRef.current;
    const ent = entitiesMapRef.current.get(entityId);
    if (!viewer || !ent) return;
    viewer.selectedEntity = ent;
    viewer.flyTo(ent, {
      duration: 1.2,
      offset: new Cesium.HeadingPitchRange(0, -Math.PI / 2, 600_000),
    });
  }, []);

  // ─── 装备 JSON 文件上传 ────────────────────────────────────
  const handleEquipmentFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const list: EquipmentInfo[] = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.data) ? parsed.data : null;
        if (!list) throw new Error('JSON 顶层既不是数组也不是 {data: [...]}');
        setEquipmentList(list);
        await initEquipmentOnServer(list);
      } catch (e: any) {
        setEquipStatus('error');
        appendError(`装备库解析或初始化失败：${e.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // ─── 审批 ──────────────────────────────────────────────────
  const decideApproval = useCallback(async (approvalId: string, decision: 'approve' | 'reject') => {
    setMessages(prev => prev.map(m =>
      m.id === approvalId && m.kind === 'approval' ? { ...m, state: 'processing' } : m
    ));
    try {
      const result = await agentService.approveDecision(approvalId, decision, userIdRef.current);
      const summaryMsg = (result as any)?.message || (decision === 'approve' ? '审批已通过' : '审批已拒绝');
      appendAssistantReply(summaryMsg);
      setMessages(prev => prev.map(m =>
        m.id === approvalId && m.kind === 'approval'
          ? { ...m, state: decision === 'approve' ? 'approved' : 'rejected' }
          : m
      ));
      await refreshScenario();
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.id === approvalId && m.kind === 'approval'
          ? { ...m, state: 'error', errorMsg: e.message }
          : m
      ));
      appendError(`审批失败：${e.message}`);
    }
  }, [appendAssistantReply, appendError, refreshScenario]);

  // ─── SSE 事件回调 ──────────────────────────────────────────
  const buildStreamCallbacks = useCallback(() => ({
    onRunId: (runId: string) => { runIdRef.current = runId; },
    onSeq:   (seq: number)   => { if (seq > lastSeqRef.current) lastSeqRef.current = seq; },

    onThinking: (text: string) => addStageItem('思考', text || ''),
    onProgress: (d: any) => {
      const label = PHASE_LABEL[d.phase] ?? d.phase ?? '进度';
      let msg = d.message ?? '';
      if (d.total && d.total > 0) msg += `（${d.current}/${d.total}）`;
      addStageItem(label, msg);
    },
    onMilestone: (d: any) =>
      addStageItem(d.title || d.kind || '里程碑', payloadMessage(d.payload)),
    onClarification: (d: any) => {
      appendAssistantReply((d.question || '需要补充信息') + suggestionText(d.suggestions));
      setStreaming(false);
    },
    onApprovalRequired: (d: any) => {
      addStageItem('等待审批', d.summary || d.approvalId);
      appendMsg({
        id: d.approvalId,
        kind: 'approval',
        approvalId: d.approvalId,
        summary: d.summary || '检测到需要确认的操作',
        diff: d.diff,
        state: 'pending',
      });
    },
    onBusinessError: (d: any) => {
      appendError(`错误[${d.code ?? '-'}]: ${d.message ?? ''}`);
      setStreaming(false);
    },
    onStateChanged: (d: any) => {
      addStageItem('状态更新', `想定状态已保存，版本 ${d.version}`);
      void refreshScenario();
    },
    onFinal: (d: any) => {
      if (d.summary) appendAssistantReply(d.summary);
      finalizeStageGroup();
    },
    onToolCallStart: (d: any) =>
      addStageItem(d.tool || '工具调用', d.narration || '开始执行'),
    onToolCallEnd: (d: any) =>
      addStageItem(d.tool || '工具完成', toolEndMessage(d)),
    onLlmCall: (d: any) =>
      addStageItem('模型调用', `${d.model ?? '-'}，耗时 ${d.latencyMs ?? 0}ms`),
    onSystemTrace: (d: any) =>
      addStageItem(d.category || '系统追踪', d.message || payloadMessage(d.meta)),
    onUnknown: (eventType: string, data: any) => {
      // TokenDelta / RawLlmChunk / 未识别事件均打到控制台便于排障
      console.debug('[Agent unknown event]', eventType, data);
    },
    onClose: () => {
      finalizeStageGroup();
      setStreaming(false);
      void refreshScenario();
    },
  }), [addStageItem, appendAssistantReply, appendError, appendMsg, finalizeStageGroup, refreshScenario]);

  // ─── 断线续传 ──────────────────────────────────────────────
  const resumeCurrentRun = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    appendTip(`事件流中断，尝试从 seq=${lastSeqRef.current} 续传。`);
    abortRef.current = new AbortController();
    await agentService.resumeStream(
      runId, lastSeqRef.current, debugLevel,
      buildStreamCallbacks(),
      abortRef.current.signal,
    );
  }, [appendTip, buildStreamCallbacks, debugLevel]);

  // ─── 发送消息 ──────────────────────────────────────────────
  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    if (equipStatus === 'loading' || equipStatus === 'initing') {
      appendTip('装备库尚未初始化完成，请稍候。');
      return;
    }
    if (equipStatus === 'error' || !equipmentList || equipmentList.length === 0) {
      appendError('装备库未初始化，请点击右上角装备状态选择 equipment.json。');
      return;
    }
    setInput('');
    setStreaming(true);
    activeStagesIdRef.current = null;
    runIdRef.current = null;
    lastSeqRef.current = 0;

    appendMsg({ id: `u-${Date.now()}`, kind: 'user', text: msg });
    pushChatHistory('user', msg);

    const body: AgentChatRequest = {
      taskId:     taskIdRef.current,
      scenarioId: scenarioIdRef.current,
      libraryId:  libraryIdRef.current,
      userId:     userIdRef.current,
      message:    msg,
      debug:      debugLevel,
    };
    if (frontHistory) {
      body.messages       = chatHistoryRef.current.slice();
      body.useLocalMemory = false;
    } else {
      body.useLocalMemory = true;
    }

    abortRef.current = new AbortController();
    try {
      await agentService.streamChat(body, buildStreamCallbacks(), abortRef.current.signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      if (runIdRef.current) {
        try {
          await resumeCurrentRun();
          return;
        } catch (resumeErr: any) {
          appendError(`请求失败：${e.message}；续传失败：${resumeErr.message}`);
          setStreaming(false);
          return;
        }
      }
      appendError(`请求失败：${e.message}`);
      setStreaming(false);
    }
  };

  // ─── 重置 ─────────────────────────────────────────────────
  const reset = async () => {
    abortRef.current?.abort();
    const oldTaskId = taskIdRef.current;
    taskIdRef.current    = `task-${Date.now()}`;
    scenarioIdRef.current = `sc-${Date.now()}`;
    runIdRef.current     = null;
    lastSeqRef.current   = 0;
    activeStagesIdRef.current = null;
    chatHistoryRef.current = [];
    if (viewerRef.current && !viewerRef.current.isDestroyed?.()) {
      viewerRef.current.entities.removeAll();
    }
    entitiesMapRef.current.clear();
    setInstances([]);
    setMessages([{ id: 'welcome', kind: 'ai', text: '想定已重置。请输入新的部署指令。' }]);
    setStreaming(false);

    void agentService.resetTask(oldTaskId).catch(() => {});
    if (equipmentList && equipmentList.length > 0) {
      try {
        await initEquipmentOnServer(equipmentList);
      } catch (e: any) {
        appendError(`重置后装备初始化失败：${e.message}`);
      }
    }
  };

  // ─── 装备状态徽章文案 ─────────────────────────────────────
  const equipBadge = useMemo(() => {
    switch (equipStatus) {
      case 'loading': return { text: '装备加载中', cls: 'bg-amber-500/15 text-amber-300' };
      case 'initing': return { text: '装备初始化中', cls: 'bg-amber-500/15 text-amber-300' };
      case 'ok':      return { text: `${equipCount} 种装备`, cls: 'bg-emerald-500/15 text-emerald-300' };
      case 'error':   return { text: '选择装备库', cls: 'bg-red-500/15 text-red-300' };
    }
  }, [equipStatus, equipCount]);

  // ─── 按阵营分组的 Inspector 视图 ──────────────────────────
  const groupedInstances = useMemo(() => {
    const map = new Map<string, InstanceView[]>();
    for (const v of instances) {
      const k = classifyKey(v.classify) || 'unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(v);
    }
    const order = ['red', 'blue', 'green', 'white'];
    const keys = [
      ...order.filter(k => map.has(k)),
      ...Array.from(map.keys()).filter(k => !order.includes(k)),
    ];
    return keys.map(k => ({ key: k, list: map.get(k) ?? [] }));
  }, [instances]);

  // ─────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Cesium 容器 */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* 隐藏的文件选择 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={e => {
          handleEquipmentFile(e.target.files?.[0]);
          if (e.target) e.target.value = '';
        }}
      />

      {/* 聊天面板 */}
      <div
        className="absolute top-4 left-4 z-[1000] flex flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl text-slate-200 text-sm"
        style={{ width: 420, maxHeight: 'calc(100% - 32px)', background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(20px)' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2 font-semibold text-[15px] text-slate-100">
            <MapIcon size={18} className="text-blue-400" />
            想定智能编排
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="点击选择 equipment.json"
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium transition-all cursor-pointer ${equipBadge.cls}`}
            >
              {(equipStatus === 'loading' || equipStatus === 'initing') ? <Loader2 size={11} className="animate-spin" />
                : equipStatus === 'error' ? <Upload size={11} />
                : null}
              {equipBadge.text}
            </button>
            <button
              onClick={() => { void reset(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/6 border border-white/10 text-slate-400 hover:text-rose-300 hover:border-rose-400/30 hover:bg-rose-500/10 text-xs transition-all cursor-pointer"
            >
              <RotateCcw size={12} /> 重置
            </button>
          </div>
        </div>

        {/* 消息体 */}
        <div ref={chatBodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 180, maxHeight: 520 }}>
          {messages.map(m => {
            if (m.kind === 'tip') {
              return (
                <div key={m.id} className="self-center text-xs text-slate-500 bg-white/4 px-4 py-1.5 rounded-full">
                  {m.text}
                </div>
              );
            }
            if (m.kind === 'user') {
              return (
                <div key={m.id} className="self-end max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </div>
              );
            }
            if (m.kind === 'ai') {
              return (
                <div key={m.id} className="self-start max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white/6 border border-white/6 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </div>
              );
            }
            if (m.kind === 'error') {
              return (
                <div key={m.id} className="self-start max-w-[92%] px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </div>
              );
            }
            if (m.kind === 'stages') {
              return (
                <div key={m.id} className="bg-white/4 border border-white/6 rounded-xl px-3.5 py-2.5 text-xs">
                  <div className="text-blue-400 font-semibold mb-2 flex items-center gap-1.5">
                    {m.pending && <Loader2 size={12} className="animate-spin" />}
                    处理流程
                  </div>
                  <ul className="space-y-1.5">
                    {m.items.map((s, i) => (
                      <li
                        key={i}
                        className={`relative pl-4 leading-relaxed ${s.done ? 'text-emerald-300' : 'text-blue-300'}`}
                      >
                        <span
                          className={`absolute left-0.5 top-[7px] w-1.5 h-1.5 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-blue-400'}`}
                          style={s.done ? {} : { boxShadow: '0 0 6px rgba(96,165,250,0.6)' }}
                        />
                        <strong>{s.stage}</strong> {s.message}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            // approval
            const affected: string[] = Array.isArray(m.diff?.affected_instance_names)
              ? m.diff.affected_instance_names : [];
            const disabled = m.state !== 'pending';
            return (
              <div key={m.id} className="self-stretch bg-amber-500/8 border border-amber-400/30 text-amber-100 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed">
                <div className="font-semibold text-amber-300 mb-1.5">需要人工审批</div>
                <div className="whitespace-pre-wrap">{m.summary}</div>
                <div className="text-slate-300 mt-1.5 break-all text-[12px]">审批单：{m.approvalId}</div>
                {affected.length > 0 && (
                  <div className="text-slate-300 mt-1.5 text-[12px]">
                    影响实例：{affected.join('、')}
                  </div>
                )}
                {m.state === 'error' && m.errorMsg && (
                  <div className="text-red-300 mt-2 text-[12px]">错误：{m.errorMsg}</div>
                )}
                <div className="flex gap-2 mt-2.5">
                  <button
                    disabled={disabled}
                    onClick={() => void decideApproval(m.approvalId, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  >
                    {m.state === 'processing' && <Loader2 size={11} className="animate-spin" />}
                    {m.state === 'approved' ? '已同意'
                      : m.state === 'rejected' ? '已拒绝（无法再操作）'
                      : '同意'}
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => void decideApproval(m.approvalId, 'reject')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 运行选项 */}
        <div className="px-4 py-2 flex gap-3 items-center flex-wrap border-t border-white/6 text-[12px] text-slate-400">
          <label className="flex items-center gap-1.5">
            调试
            <Select
              compact
              className="min-w-[96px]"
              value={debugLevel}
              onChange={v => setDebugLevel(v as DebugLevel)}
              options={[
                { value: 'off', label: 'off' },
                { value: 'minimal', label: 'minimal' },
                { value: 'verbose', label: 'verbose' },
                { value: 'trace', label: 'trace' },
              ]}
            />
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={frontHistory}
              onChange={e => setFrontHistory(e.target.checked)}
              className="accent-blue-500"
            />
            前端传完整历史
          </label>
        </div>

        {/* 输入区 */}
        <div className="px-3 py-3 border-t border-white/6 flex gap-2 flex-shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !streaming) void send(); }}
            disabled={streaming}
            placeholder="输入部署指令..."
            className="flex-1 px-4 py-2.5 bg-white/6 border border-white/10 rounded-xl text-slate-100 text-sm outline-none focus:border-blue-400/40 placeholder:text-slate-500 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-br from-blue-500 to-blue-600 hover:brightness-110 rounded-xl text-white text-sm font-semibold disabled:opacity-40 transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
          >
            {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {streaming ? '处理中' : '发送'}
          </button>
        </div>
      </div>

      {/* Inspector 面板 */}
      <div
        className={`absolute top-4 right-4 z-[1000] flex flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl text-slate-200 text-[13px] transition-all duration-200`}
        style={{
          width: inspectorCollapsed ? 200 : 380,
          maxHeight: 'calc(100% - 32px)',
          background: 'rgba(15,23,42,0.88)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className={`flex items-center justify-between px-4 py-3.5 flex-shrink-0 ${inspectorCollapsed ? '' : 'border-b border-white/8'}`}>
          <div className="flex items-center gap-2 font-semibold text-[15px] text-slate-100">
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            实例 <span className="text-slate-400 font-medium">({instances.length})</span>
          </div>
          <button
            onClick={() => setInspectorCollapsed(v => !v)}
            title={inspectorCollapsed ? '展开' : '折叠'}
            className="text-slate-400 hover:text-slate-100 px-1 cursor-pointer"
          >
            {inspectorCollapsed ? <ChevronsRightLeft size={14} /> : <ChevronsLeftRight size={14} />}
          </button>
        </div>

        {!inspectorCollapsed && (
          <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3.5 flex flex-col gap-2.5 min-h-[80px]">
            {instances.length === 0 ? (
              <div className="text-center text-slate-500 py-5 text-xs leading-relaxed">
                暂无已部署实例。
                <br />
                下达指令后会自动列出每个实例的全部参数。
              </div>
            ) : (
              groupedInstances.map(group => (
                <React.Fragment key={group.key}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.4px] pl-1 pt-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: classifyHex(group.key) }}
                    />
                    {classifyLabel(group.key)}
                    <span className="text-slate-600 font-medium">×{group.list.length}</span>
                  </div>
                  {group.list.map((v, i) => (
                    <InstanceCard key={`${group.key}-${v.name}-${i}`} view={v} onFocus={focusEntity} />
                  ))}
                </React.Fragment>
              ))
            )}
          </div>
        )}
      </div>

      {/* Cesium 未加载提示 */}
      {!cesiumReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-50">
          <div className="text-center text-slate-400">
            <MapIcon size={48} strokeWidth={1} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">Cesium 地图加载中，请确认 index.html 已引入 Cesium CDN...</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Inspector 单个实例卡 ──────────────────────────────────
const InstanceCard: React.FC<{ view: InstanceView; onFocus: (eid: string | null) => void }> = ({ view, onFocus }) => {
  const tagCls = classifyTagClass(view.classify);
  const canFocus = !!view.entityId;

  return (
    <div className={`bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 flex flex-col gap-1.5 ${view.geo.found ? '' : 'border-dashed opacity-80'}`}>
      <div className="flex items-center justify-between gap-2">
        <div
          className={`text-[13px] font-semibold flex-1 truncate ${canFocus ? 'cursor-pointer hover:text-blue-300 text-slate-100' : 'text-slate-400'}`}
          title={canFocus ? '点击在地图上聚焦' : '该实例无坐标，无法在地图上定位'}
          onClick={() => canFocus && onFocus(view.entityId)}
        >
          {view.name}
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tracking-[0.3px] flex-shrink-0 ${tagCls}`}>
          {classifyLabel(view.classify)}
        </span>
      </div>
      <div className="text-[11px] text-slate-500">装备: {view.equipName || '-'}</div>
      <div className={`text-[11px] font-mono ${view.geo.found ? 'text-slate-400' : 'text-amber-300 italic'}`}>
        {view.geo.found
          ? `经 ${view.geo.lon.toFixed(6)}  纬 ${view.geo.lat.toFixed(6)}  高 ${view.geo.alt || 0}`
          : '⚠ 无坐标信息'}
      </div>

      <div className="mt-1 bg-black/20 rounded-lg px-2.5 py-2">
        {view.parsedInits.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic">该实例没有初始化参数</div>
        ) : (
          view.parsedInits.map((port, i) => <PortBlock key={i} port={port} />)
        )}
      </div>
    </div>
  );
};

const PortBlock: React.FC<{ port: ParsedPort }> = ({ port }) => {
  const params = port.params;
  const isObj  = params && typeof params === 'object' && !Array.isArray(params);
  const keys   = isObj ? Object.keys(params) : [];

  return (
    <div className="flex flex-col gap-0.5 [&:not(:first-child)]:mt-1.5 [&:not(:first-child)]:pt-1.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-white/5">
      <div className="text-[11px] font-semibold text-blue-300 tracking-[0.3px]">
        {port.portName || '默认端口'}
      </div>
      {isObj && keys.length === 0 && <div className="text-[11px] italic text-slate-500">空参数 {'{}'}</div>}
      {isObj && keys.length > 0 && keys.map(k => <ParamRow key={k} k={k} v={(params as any)[k]} />)}
      {!isObj && Array.isArray(params) && <ParamRow k="(数组)" v={params} />}
      {!isObj && !Array.isArray(params) && <ParamRow k="initJson" v={params} />}
    </div>
  );
};

const ParamRow: React.FC<{ k: string; v: any }> = ({ k, v }) => {
  let cls = 'text-slate-200';
  let text: string;
  if (v == null) { cls = 'text-slate-500 italic'; text = v === null ? 'null' : '-'; }
  else if (typeof v === 'string')  { cls = 'text-emerald-300'; text = v; }
  else if (typeof v === 'number')  { cls = 'text-amber-300';   text = String(v); }
  else if (typeof v === 'boolean') { cls = 'text-violet-300';  text = v ? 'true' : 'false'; }
  else if (typeof v === 'object')  {
    cls = 'text-sky-300';
    try { text = JSON.stringify(v, null, 2); } catch { text = '[unserializable]'; }
  } else { text = String(v); }

  return (
    <div className="grid gap-2 py-0.5 text-[11px] leading-snug border-b border-white/5 last:border-b-0"
      style={{ gridTemplateColumns: 'minmax(70px, max-content) 1fr' }}
    >
      <div className="text-slate-400 break-all">{k}</div>
      <div className={`font-mono whitespace-pre-wrap break-words ${cls}`}>{text}</div>
    </div>
  );
};

export default ScenarioPage;
