import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, FileText, GitFork, Settings2, Shapes } from 'lucide-react';
import { knowledgeAppService } from '../../../shared/services/knowledge';
import type { KnowledgeApp } from '../../../shared/types/knowledge';
import { KB_MODE_LABELS, ROLE_LABELS } from '../../../shared/constants/knowledge';
import { THEME } from '../../../shared/styles/theme';
import { useToast } from '../../../shared/components/ui/ToastManager';
import Tabs from '../../../shared/components/ui/Tabs';
import Badge from '../../../shared/components/ui/Badge';
import Spinner from '../../../shared/components/ui/Spinner';
import EmptyState from '../../../shared/components/ui/EmptyState';
import DocumentsTab from './tabs/DocumentsTab';
import WikiTab from './tabs/WikiTab';
import GraphTab from './tabs/GraphTab';
import OntologyTab from './tabs/OntologyTab';
import SettingsTab from './tabs/SettingsTab';

const TAB_KEYS = ['docs', 'wiki', 'graph', 'ontology', 'settings'] as const;
type TabKey = typeof TAB_KEYS[number];

/** 知识库详情页（/knowledge/:id?tab=docs|wiki|graph|ontology|settings） */
const KnowledgeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [app, setApp] = useState<KnowledgeApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'docs';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setApp(await knowledgeAppService.detail(id));
    } catch (e: any) {
      toast.showError(e.message || '加载知识库详情失败');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const switchTab = (key: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', key);
      return next;
    }, { replace: true });
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size={28} /></div>;
  }

  if (notFound || !app) {
    return (
      <EmptyState
        icon={<FileText size={24} />}
        title="知识库不存在或无权限访问"
        action={<button className={THEME.button.secondary} onClick={() => navigate('/knowledge')}>返回列表</button>}
      />
    );
  }

  return (
    <div className={THEME.page}>
      {/* 页头 */}
      <div className="flex flex-wrap items-center gap-3">
        <button className={THEME.buttonIcon} onClick={() => navigate('/knowledge')} title="返回列表" aria-label="返回列表">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-neutral-950">{app.name}</h1>
            <Badge tone="neutral">{KB_MODE_LABELS[app.mode] ?? app.mode}</Badge>
            {app.disabled && <Badge tone="error">已停用</Badge>}
            {app.graphEnabled && <Badge tone="teal">图谱已开启</Badge>}
            {app.myRole && <Badge tone="black">{ROLE_LABELS[app.myRole]}</Badge>}
          </div>
          {app.remark && <p className="mt-0.5 truncate text-[13px] font-medium text-neutral-500">{app.remark}</p>}
        </div>
      </div>

      <Tabs
        active={activeTab}
        onChange={switchTab}
        items={[
          { key: 'docs', label: '文档', icon: <FileText size={14} /> },
          { key: 'wiki', label: 'Wiki', icon: <BookOpen size={14} /> },
          { key: 'graph', label: '图谱', icon: <GitFork size={14} /> },
          { key: 'ontology', label: '本体', icon: <Shapes size={14} /> },
          { key: 'settings', label: '设置', icon: <Settings2 size={14} /> },
        ]}
      />

      {activeTab === 'docs' && <DocumentsTab app={app} />}
      {activeTab === 'wiki' && <WikiTab app={app} />}
      {activeTab === 'graph' && <GraphTab app={app} />}
      {activeTab === 'ontology' && <OntologyTab app={app} />}
      {activeTab === 'settings' && <SettingsTab app={app} onChanged={load} />}
    </div>
  );
};

export default KnowledgeDetailPage;
