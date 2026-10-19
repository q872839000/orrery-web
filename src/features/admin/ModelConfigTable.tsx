import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { THEME } from '../../shared/styles/theme';
import { Button } from '../../shared/components/ui/Button';
import Checkbox from '../../shared/components/ui/Checkbox';
import Radio from '../../shared/components/ui/Radio';

/** 模型配置值（四类能力的统一编辑态；向量/重排为单选，空串 = 不配） */
export interface ModelConfigValue {
  chatModels: string[];
  chatModel: string;
  embeddingModel: string;
  rerankModel: string;
}

interface ModelConfigTableProps {
  /** 展示行（远程拉取清单 ∪ 已配置清单 ∪ 自定义补充，调用方负责去重保序） */
  rows: string[];
  value: ModelConfigValue;
  onChange: (next: ModelConfigValue) => void;
  /** 传入则表尾展示自定义模型添加行 */
  onAddCustom?: (name: string) => void;
  emptyHint?: string;
}

/** 模型选择与配置表（对话勾选 / 默认单选 / 向量单选 / 重排单选 同表操作） */
const ModelConfigTable: React.FC<ModelConfigTableProps> = ({ rows, value, onChange, onAddCustom, emptyHint }) => {
  const [customModel, setCustomModel] = useState('');

  const toggleChat = (id: string) => {
    const current = value.chatModels;
    const next = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
    // 默认模型一致性：取消勾选默认模型则回退剩余首个；勾选首个且无默认时补默认
    let chatModel = value.chatModel;
    if (current.includes(id) && chatModel === id) chatModel = next[0] ?? '';
    if (!current.includes(id) && !chatModel) chatModel = id;
    onChange({ ...value, chatModels: next, chatModel });
  };

  const pickDefault = (id: string) => onChange({
    ...value,
    chatModel: id,
    chatModels: value.chatModels.includes(id) ? value.chatModels : [...value.chatModels, id],
  });

  /** 向量/重排单选：点已中行 = 取消配置 */
  const pickSingle = (field: 'embeddingModel' | 'rerankModel', id: string) =>
    onChange({ ...value, [field]: value[field] === id ? '' : id });

  const addCustom = () => {
    const name = customModel.trim();
    if (!name || !onAddCustom) return;
    onAddCustom(name);
    setCustomModel('');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100">
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        <span className="w-8 text-center">对话</span>
        <span className="flex-1">模型名称</span>
        <span className="w-10 text-center" title="未指定模型时的对话落点">默认</span>
        <span className="w-10 text-center">向量</span>
        <span className="w-10 text-center">重排</span>
      </div>
      <div className={`max-h-56 overflow-y-auto ${THEME.scrollbar}`}>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-center text-[11px] font-medium text-neutral-400">
            {emptyHint ?? '先点「获取模型列表」拉取远程清单，或在下方直接添加自定义模型'}
          </p>
        ) : rows.map(m => {
          const isChat = value.chatModels.includes(m);
          return (
            <div key={m} className="flex items-center gap-3 border-b border-neutral-50 px-3 py-1.5 transition-colors last:border-0 hover:bg-neutral-50/60">
              <span className="flex w-8 flex-shrink-0 justify-center">
                <Checkbox checked={isChat} onChange={() => toggleChat(m)} title="勾选后出现在各对话页的选择器中" />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-neutral-700" title={m}>
                {m}
              </span>
              <span className="flex w-10 flex-shrink-0 justify-center">
                <Radio on={value.chatModel === m} onClick={() => pickDefault(m)} title="设为默认对话模型" />
              </span>
              <span className="flex w-10 flex-shrink-0 justify-center">
                <Radio on={value.embeddingModel === m} onClick={() => pickSingle('embeddingModel', m)} title="设为向量模型（再点取消）" />
              </span>
              <span className="flex w-10 flex-shrink-0 justify-center">
                <Radio on={value.rerankModel === m} onClick={() => pickSingle('rerankModel', m)} title="设为重排模型（再点取消）" />
              </span>
            </div>
          );
        })}
      </div>
      {onAddCustom && (
        <div className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2">
          <input
            className={`${THEME.input} min-w-0 flex-1`}
            placeholder="添加自定义模型（回车确认）"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          />
          <Button variant="secondary" size="sm" onClick={addCustom} disabled={!customModel.trim()}>
            <Plus size={13} className="mr-1" /> 添加
          </Button>
        </div>
      )}
    </div>
  );
};

export default ModelConfigTable;
