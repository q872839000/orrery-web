import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { graphApi } from '../../graph/studioMock';
import type { GraphStats, KnowledgeApp } from '../../../../shared/types/knowledge';
import EmptyState from '../../../../shared/components/ui/EmptyState';
import GraphExplorer from '../../graph/GraphExplorer';

interface GraphTabProps {
  app: KnowledgeApp;
  active?: boolean;
}

/** 图谱 tab：无数据时给空态引导，有数据进入知识库的图谱探索视图。 */
const GraphTab: React.FC<GraphTabProps> = ({ app, active = true }) => {
  const api = useMemo(() => graphApi(app.id), [app.id]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setError('');
    try {
      setStats(await api.stats(app.id));
    } catch (e: any) {
      setStats(null);
      setError(e.message || '图谱统计加载失败');
    } finally {
      setStatsLoading(false);
    }
  }, [api, app.id]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const hasGraphData = (stats?.entityCount ?? 0) > 0;

  if (error) return <div className="knowledge-studio studio-error">{error}<button className="studio-button is-small" onClick={loadStats}>重新加载</button></div>;

  if (!statsLoading && !hasGraphData) {
    return (
      <EmptyState
        icon={<Network size={24} />}
        title={app.graphEnabled ? '图谱尚无数据' : '图谱未开启'}
        desc={app.graphEnabled
          ? '文档入库并完成图谱抽取后，这里会出现实体与关系。'
          : '在「设置」页开启图谱开关后，新摄入的文档将进行实体关系抽取。'}
      />
    );
  }

  return <GraphExplorer app={app} stats={stats} statsLoading={statsLoading} active={active} />;
};

export default GraphTab;
