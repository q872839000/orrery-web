
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../shared/components/ui/Button';
import { useAuthStore } from '../../shared/store/useAuthStore';
import { Eye, EyeOff, Loader2, ShieldCheck, User, Lock as LockIcon } from 'lucide-react';
import { authService } from '../../shared/services/auth.service';

const LoginPage: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const onSubmit = async (data: any) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await authService.login(data);
      const { accessToken, ...userInfo } = response.data;
      login(userInfo as any, accessToken);
      navigate('/portal');
    } catch (error: any) {
      setErrorMsg(error.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 select-none bg-transparent overflow-hidden">
      {/* 核心登录容器 - 缩小至 380px，支持窗口自适应 */}
      <div className="w-[90vw] max-w-[380px] glass-panel rounded-[40px] p-10 sm:p-12 space-y-10 animate-in fade-in zoom-in-95 duration-1000 tilt-card">
        
        {/* 顶部 Logo - 带有 3D 悬浮感 */}
        <div className="text-center space-y-6 tilt-content">
          <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto shadow-2xl animate-float transition-transform hover:scale-110">
             <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-black tracking-tighter">Orrery 智能平台</h1>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-500/10 border border-red-200/50 text-red-600 text-[11px] font-black rounded-2xl flex items-center justify-center animate-in slide-in-from-top-2">
             {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 tilt-content">
          {/* 账号输入 */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">账号名称</label>
            <div className="relative group">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-black transition-all" size={16} />
              <input 
                {...register('username', { required: true })}
                type="text" 
                className="w-full bg-white/40 border border-white/60 rounded-[22px] pl-12 pr-6 py-4 text-xs font-bold focus:outline-none focus:bg-white focus:ring-8 focus:ring-black/5 transition-all placeholder:text-neutral-200"
                placeholder="请输入您的 ID"
              />
            </div>
          </div>

          {/* 密码输入 */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">访问密码</label>
            <div className="relative group">
              <LockIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-black transition-all" size={16} />
              <input 
                {...register('password', { required: true })}
                type={showPassword ? 'text' : 'password'} 
                className="w-full bg-white/40 border border-white/60 rounded-[22px] pl-12 pr-12 py-4 text-xs font-bold focus:outline-none focus:bg-white focus:ring-8 focus:ring-black/5 transition-all placeholder:text-neutral-200"
                placeholder="请输入登录凭证"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-black transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center space-x-3 cursor-pointer group">
              <div className="relative">
                <input type="checkbox" className="peer sr-only" />
                <div className="w-4 h-4 border-2 border-white/80 rounded-md bg-white/10 peer-checked:bg-black peer-checked:border-black transition-all"></div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 text-white transition-opacity">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              </div>
              <span className="text-[11px] font-black text-neutral-400 group-hover:text-black transition-colors tracking-wide">保持登录</span>
            </label>
          </div>

          <Button 
            type="submit" 
            disabled={loading} 
            className="w-full py-5 rounded-[22px] shadow-2xl shadow-black/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : '进入平台'}
          </Button>
        </form>

        <div className="pt-6 border-t border-white/20 text-center tilt-content">
          <p className="text-[11px] text-neutral-400 font-black tracking-widest">
            还没有账号？ <Link to="/register" className="text-black hover:opacity-60 transition-all border-b border-black/20 pb-0.5 ml-1">立即申请加入</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
