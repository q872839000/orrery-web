import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, User, Mail, Phone, Save, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { userService } from '../services/system.service';
import { THEME } from '../styles/theme';
import { useToast } from './ui/ToastManager';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, login, token } = useAuthStore();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    phone: '',
    avatar: ''
  });

  // 初始化表单数据
  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        nickname: user.nickname || '',
        email: '',
        phone: '',
        avatar: user.avatar || ''
      });
      setAvatarPreview(user.avatar || null);
      
      // 获取完整用户信息
      loadUserInfo();
    }
  }, [user, isOpen]);

  const loadUserInfo = async () => {
    if (!user?.userId) return;
    try {
      const res = await userService.getInfo(user.userId);
      if (res.data) {
        setFormData({
          nickname: res.data.nickname || '',
          email: res.data.email || '',
          phone: res.data.phone || '',
          avatar: res.data.avatar || ''
        });
        setAvatarPreview(res.data.avatar || null);
      }
    } catch (error) {
      console.error('获取用户信息失败', error);
    }
  };

  // 处理头像选择
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      showError('请选择图片文件');
      return;
    }

    // 验证文件大小（限制2MB）
    if (file.size > 2 * 1024 * 1024) {
      showError('图片大小不能超过2MB');
      return;
    }

    // 转换为 BASE64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAvatarPreview(base64);
      setFormData(prev => ({ ...prev, avatar: base64 }));
    };
    reader.readAsDataURL(file);
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.userId) return;

    setLoading(true);
    try {
      await userService.update({
        id: user.userId,
        nickname: formData.nickname,
        email: formData.email,
        phone: formData.phone,
        avatar: formData.avatar
      });

      // 更新本地存储的用户信息
      const updatedUser = {
        ...user,
        nickname: formData.nickname,
        avatar: formData.avatar
      };
      login(updatedUser, token || '');
      
      showSuccess('个人信息更新成功');
      onClose();
    } catch (error: any) {
      showError(error.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[50] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`relative w-full max-w-md rounded-[32px] p-8 ${THEME.glass} animate-in fade-in zoom-in-95 duration-200`}>
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-xl transition-all"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-black text-black mb-6">个人信息</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 头像上传 */}
          <div className="flex justify-center">
            <div className="relative group">
              <div 
                onClick={handleAvatarClick}
                className="w-24 h-24 rounded-2xl bg-neutral-100 flex items-center justify-center overflow-hidden cursor-pointer border-2 border-white shadow-xl group-hover:shadow-2xl transition-all"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User size={40} className="text-neutral-300" />
                )}
              </div>
              <div 
                onClick={handleAvatarClick}
                className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
              >
                <Camera size={24} className="text-white" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
          <p className="text-center text-xs text-neutral-400">点击更换头像（支持jpg、png，不超过2MB）</p>

          {/* 用户名（只读） */}
          <div>
            <label className={THEME.label}>用户名</label>
            <div className="mt-2 px-5 py-3 bg-neutral-50 rounded-2xl text-sm text-neutral-500 border border-neutral-100">
              {user?.username || '-'}
            </div>
          </div>

          {/* 昵称 */}
          <div>
            <label className={THEME.label}>昵称</label>
            <div className="relative mt-2">
              <User size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                placeholder="请输入昵称"
                className={`${THEME.input} w-full pl-12`}
              />
            </div>
          </div>

          {/* 邮箱 */}
          <div>
            <label className={THEME.label}>邮箱</label>
            <div className="relative mt-2">
              <Mail size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="请输入邮箱"
                className={`${THEME.input} w-full pl-12`}
              />
            </div>
          </div>

          {/* 手机号 */}
          <div>
            <label className={THEME.label}>手机号</label>
            <div className="relative mt-2">
              <Phone size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="请输入手机号"
                className={`${THEME.input} w-full pl-12`}
              />
            </div>
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
                保存中...
              </>
            ) : (
              <>
                <Save size={18} />
                保存修改
              </>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ProfileModal;