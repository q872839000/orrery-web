import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database, FileText, Loader2, Search, MessageSquareText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { knowledgeAppService, knowledgeDocsService } from '../../shared/services/knowledge';
import type { KnowledgeDoc } from '../../shared/types/knowledge';
import { DocProcessStatus, docStatusMeta } from '../../shared/constants/knowledge';
import { THEME } from '../../shared/styles/theme';
import Badge from '../../shared/components/ui/Badge';
import Spinner from '../../shared/components/ui/Spinner';
import { formatDateTime } from '../../shared/utils/date';
import DocTypeIcon from '../../shared/components/DocTypeIcon';

/** 处理中状态码（待处理 + 各加工阶段 + 重建） */
const ACTIVE_STATUSES = [
  DocProcessStatus.PENDING, DocProcessStatus.PARSING, DocProcessStatus.CHUNKING,
  DocProcessStatus.VECTORIZING, DocProcessStatus.GRAPHING, DocProcessStatus.REINDEXING,
];

interface Stats {
  appCount: number;
  docCount: number;
  processing: number;
  failed: number;
  completed: number;
}

/** 数字化看板（/dashboard）：知识库模块轻量概览 */
const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentDocs, setRecentDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [apps, docsAll, docsRecent, failed, completed, ...activeCounts] = await Promise.all([
          knowledgeAppService.page({ page: 1, size: 1 }),
          knowledgeDocsService.page({ page: 1, size: 1 }),
          knowledgeDocsService.page({ page: 1, size: 8 }),
          knowledgeDocsService.page({ page: 1, size: 1, processStatus: DocProcessStatus.FAILED }),
          knowledgeDocsService.page({ page: 1, size: 1, processStatus: DocProcessStatus.COMPLETED }),
          ...ACTIVE_STATUSES.map(s => knowledgeDocsService.page({ page: 1, size: 1, processStatus: s })),
        ]);
        setStats({
          appCount: apps.totalRow ?? 0,
          docCount: docsAll.totalRow ?? 0,
          processing: activeCounts.reduce((sum, p) => sum + (p.totalRow ?? 0), 0),
          failed: failed.totalRow ?? 0,
          completed: completed.totalRow ?? 0,
        });
        setRecentDocs(docsRecent.records ?? []);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    { label: '知识库', value: stats?.appCount, icon: Database, to: '/knowledge' },
    { label: '文档总数', value: stats?.docCount, icon: FileText, to: '/knowledge' },
    { label: '处理中', value: stats?.processing, icon: Loader2, to: '/knowledge' },
    { label: '已完成', value: stats?.completed, icon: CheckCircle2, to: '/knowledge' },
    { label: '失败', value: stats?.failed, icon: AlertTriangle, to: '/knowledge' },
  ];

  return (
    <div className={THEME.page}>
      <div className={THEME.pageHeader}>
        <div>
          <h1 className={THEME.pageTitle}>数字化看板</h1>
          <p className={THEME.pageDesc}>知识库资产与摄入处理概览</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/knowledge/search" className={`${THEME.button.secondary}`}>
            <Search size={13} /> 智慧检索
          </Link>
          <Link to="/knowledge/chat" className={`${THEME.button.primary}`}>
            <MessageSquareText size={13} /> 知识问答
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={28} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {cards.map(card => (
              <Link key={card.label} to={card.to} className={`${THEME.card} ${THEME.cardHover} group p-5`}>
                <div className="flex items-center justify-between">
                  <span className={THEME.label}>{card.label}</span>
                  <card.icon size={16} className="text-neutral-300 transition-colors group-hover:text-black" />
                </div>
                <div className="mt-2 text-3xl font-black tracking-tight text-neutral-900">{card.value ?? 0}</div>
              </Link>
            ))}
          </div>

          <div className={`${THEME.card} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-neutral-800">最近文档</h3>
              <Link to="/knowledge" className="flex items-center gap-1 text-[12px] font-bold text-neutral-400 hover:text-black">
                进入知识库 <ArrowRight size={12} />
              </Link>
            </div>
            {recentDocs.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">暂无文档</div>
            ) : (
              <div className="space-y-1.5">
                {recentDocs.map(doc => {
                  const meta = docStatusMeta(doc.processStatus);
                  return (
                    <Link
                      key={doc.id}
                      to={`/knowledge/${doc.knowledgeId}?tab=docs`}
                      className="flex items-center gap-3 rounded-xl border border-neutral-100 px-4 py-2.5 transition-colors hover:border-black"
                    >
                      <DocTypeIcon name={doc.name} fileKey={doc.fileKey} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-neutral-700">{doc.name}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-[11px] font-semibold text-neutral-400">{formatDateTime(doc.createTime)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
