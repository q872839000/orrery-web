import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { knowledgeDocsService } from '../../../../shared/services/knowledge';
import type { DocumentChunk, ChunkEntityMention } from '../../../../shared/types/knowledge';
import { BLOCK_TYPE_LABELS } from '../../../../shared/constants/knowledge';
import { THEME } from '../../../../shared/styles/theme';
import Drawer from '../../../../shared/components/ui/Drawer';
import ChunkContent from '../../shared/ChunkContent';
import Badge from '../../../../shared/components/ui/Badge';
import Spinner from '../../../../shared/components/ui/Spinner';
import EmptyState from '../../../../shared/components/ui/EmptyState';

interface ChunkPreviewDrawerProps {
  open: boolean;
  docId: string | null;
  docName?: string;
  onClose: () => void;
  /** 定位高亮：引擎块 ID（{docId}_{chunkIdx}）或 DB 块 ID 均可 */
  highlightChunkId?: string;
}

/** 解析块实体提及 JSON（[{name,type}]），非法数据返回空 */
export const parseChunkEntities = (raw?: string | null): ChunkEntityMention[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.name === 'string') : [];
  } catch {
    return [];
  }
};

/** 从引擎块 ID 提取 chunkIndex（{docId}_{chunkIdx}），非该格式返回 undefined */
export const chunkIndexOf = (chunkId?: string): number | undefined => {
  if (!chunkId) return undefined;
  const idx = chunkId.lastIndexOf('_');
  if (idx < 0) return undefined;
  const n = Number(chunkId.slice(idx + 1));
  return Number.isFinite(n) ? n : undefined;
};

/** 单块卡片 */
const ChunkCard: React.FC<{ chunk: DocumentChunk; highlighted: boolean }> = ({ chunk, highlighted }) => {
  const entities = parseChunkEntities(chunk.entities);
  return (
    <div
      id={`chunk-${chunk.chunkIndex}`}
      className={`rounded-2xl border p-4 transition-all ${
        highlighted ? 'border-black bg-amber-50/60 shadow-md' : 'border-neutral-100 bg-white/70'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="black">#{chunk.chunkIndex}</Badge>
        {chunk.isParent && <Badge tone="purple">父块</Badge>}
        {chunk.blockType && <Badge tone="blue">{BLOCK_TYPE_LABELS[chunk.blockType] ?? chunk.blockType}</Badge>}
        {chunk.pageNo != null && <Badge tone="neutral">第 {chunk.pageNo} 页</Badge>}
        {chunk.chapterPath && (
          <span className="text-[11px] font-semibold text-neutral-400">{chunk.chapterPath}</span>
        )}
      </div>
      <ChunkContent content={chunk.chunkText} />
      {entities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1 border-t border-neutral-100 pt-2.5">
          {entities.map((e, i) => (
            <Badge key={`${e.name}-${i}`} tone="teal">{e.name}{e.type ? ` · ${e.type}` : ''}</Badge>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 分块预览抽屉（文档详情/检索/对话/Wiki/图谱的"回原文"统一入口）。
 * 父子块按文档顺序铺排，子块相对父块缩进。
 */
const ChunkPreviewDrawer: React.FC<ChunkPreviewDrawerProps> = ({ open, docId, docName, onClose, highlightChunkId }) => {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !docId) return;
    setLoading(true);
    knowledgeDocsService.chunks(docId)
      .then(setChunks)
      .catch(() => setChunks([]))
      .finally(() => setLoading(false));
  }, [open, docId]);

  const highlightIndex = chunkIndexOf(highlightChunkId);

  const ordered = useMemo(() => [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex), [chunks]);

  useEffect(() => {
    if (loading || highlightIndex === undefined) return;
    const el = document.getElementById(`chunk-${highlightIndex}`);
    el?.scrollIntoView({ block: 'center' });
  }, [loading, highlightIndex, ordered]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2">
          <FileText size={15} />
          {docName ? `分块预览 · ${docName}` : '分块预览'}
        </span>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : ordered.length === 0 ? (
        <EmptyState icon={<FileText size={24} />} title="暂无分块" desc="文档尚未完成处理或没有任何分块数据。" />
      ) : (
        <div className="space-y-3">
          {ordered.map(chunk => (
            <div key={chunk.id} className={chunk.isParent ? '' : 'ml-5 border-l-2 border-neutral-100 pl-4'}>
              <ChunkCard chunk={chunk} highlighted={highlightIndex === chunk.chunkIndex} />
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
};

export default ChunkPreviewDrawer;
