import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { userService } from '../services/system.service';
import { THEME } from '../styles/theme';
import { useToast } from './ui/ToastManager';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // 重置表单
  const resetForm = () => {
    setFormData({
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  // 关闭弹窗
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // 验证表单
  const validateForm = (): boolean => {
    if (!formData.oldPassword) {
      showError('请输入当前密码');
      return false;
    }
    if (!formData.newPassword) {
      showError('请输入新密码');
      return false;
    }
    if (formData.newPassword.length < 6) {
      showError('新密码长度不能少于6位');
      return false;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      showError('两次输入的密码不一致');
      return false;
    }
    if (formData.oldPassword === formData.newPassword) {
      showError('新密码不能与当前密码相同');
      return false;
    }
    return true;
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.userId) return;
    if (!validateForm()) return;

    setLoading(true);
    try {
      await userService.updatePassword({
        userId: user.userId,
        oldPassword: formData.oldPassword,
        newPassword: formData.newPassword
      });
      
      showSuccess('密码修改成功');
      handleClose();
    } catch (error: any) {
      showError(error.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[50] p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className={`relative w-full max-w-md rounded-[32px] p-8 ${THEME.glass} animate-in fade-in zoom-in-95 duration-200`}>
        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-xl transition-all"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-black text-black mb-6">修改密码</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 当前密码 */}
          <div>
            <label className={THEME.label}>当前密码</label>
            <div className="relative mt-2">
              <Lock size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={formData.oldPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, oldPassword: e.target.value }))}
                placeholder="请输入当前密码"
                className={`${THEME.input} w-full pl-12 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div>
            <label className={THEME.label}>新密码</label>
            <div className="relative mt-2">
              <Lock size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="请输入新密码（至少6位）"
                className={`${THEME.input} w-full pl-12 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 确认新密码 */}
          <div>
            <label className={THEME.label}>确认新密码</label>
            <div className="relative mt-2">
              <Lock size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="请再次输入新密码"
                className={`${THEME.input} w-full pl-12 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 密码强度提示 */}
          <div className="text-xs text-neutral-400 bg-neutral-50 rounded-xl p-3">
            <p>密码要求：</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>长度至少6位</li>
              <li>建议包含字母、数字和特殊字符</li>
            </ul>
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className={THEME.button.large}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Save size={18} />
                确认修改
              </>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ChangePasswordModal;