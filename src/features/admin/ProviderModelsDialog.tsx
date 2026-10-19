import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  llmProviderAdminService,
  type LlmProviderSaveRequest, type LlmProviderVO,
} from '../../shared/services/ai.service';
import { THEME } from '../../shared/styles/theme';
import { useToast } from '../../shared/components/ui/ToastManager';
import Modal from '../../shared/components/ui/Modal';
import ModelConfigTable, { type ModelConfigValue } from './ModelConfigTable';
import { toSaveRequest } from './ProviderEditDialog';

interface ProviderModelsDialogProps {
  provider: LlmProviderVO;
  onClose: () => void;
  onSaved: () => void;
}

/** 获取模型列表弹窗（卡片直出：按已存配置拉取远程清单，勾选/调配后保存即热生效） */
const ProviderModelsDialog: React.FC<ProviderModelsDialogProps> = ({ provider, onClose, onSaved }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<string[]>([]);
  const [value, setValue] = useState<ModelConfigValue>(() => ({
    chatModels: provider.chatModels ?? [],
    chatModel: provider.chatModel ?? '',
    embeddingModel: provider.embeddingModel ?? '',
    rerankModel: provider.rerankModel ?? '',
  }));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // apiKey 留空：后端回退已存密钥（与测试连接同口径）
        const ids = await llmProviderAdminService.listModels({
          name: provider.name,
          baseUrl: provider.baseUrl ?? '',
          apiVersion: provider.apiVersion,
        });
        if (!alive) return;
        // 远程清单 ∪ 已配置清单（远程下架的已配置模型仍保留行，避免误丢配置）
        const merged = [...ids];
        [provider.chatModel, ...(provider.chatModels ?? []), provider.embeddingModel, provider.rerankModel]
          .forEach(m => { if (m && !merged.includes(m)) merged.push(m); });
        setRows(merged);
        if (ids.length === 0) setError('连接成功，但端点返回了空的模型清单');
      } catch (e: any) {
        if (alive) setError(e.message || '获取模型列表失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [provider]);

  const save = async () => {
    if ((provider.chatEnabled ?? true) && !value.chatModel) {
      toast.showError('请选择一个默认对话模型');
      return;
    }
    setSaving(true);
    try {
      const req: LlmProviderSaveRequest = {
        ...toSaveRequest(provider),
        chatModels: value.chatModels,
        chatModel: value.chatModel,
        embeddingEnabled: !!value.embeddingModel,
        embeddingModel: value.embeddingModel,
        rerankEnabled: !!value.rerankModel,
        rerankModel: value.rerankModel,
      };
      await llmProviderAdminService.update(provider.name, req);
      toast.showSuccess('模型配置已保存（各服务热生效）');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.showError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`模型列表 · ${provider.name}`}
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <button className={THEME.button.secondary} onClick={onClose}>取消</button>
          <button className={THEME.button.primary} onClick={save} disabled={saving || loading || !!error}>
            {saving ? '保存中…' : '保存配置'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] font-bold text-neutral-400">
          <RefreshCw size={14} className="animate-spin" /> 正在拉取模型清单…
        </div>
      ) : error ? (
        <p className="py-10 text-center text-[12px] font-bold text-red-500">{error}</p>
      ) : (
        <ModelConfigTable
          rows={rows}
          value={value}
          onChange={setValue}
          emptyHint="端点未返回模型清单"
        />
      )}
      <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
        勾选对话模型并指定默认；向量/重排各选一个（再点取消）。保存即写入共享注册，各服务热生效
      </p>
    </Modal>
  );
};

export default ProviderModelsDialog;
