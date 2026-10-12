import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, KeyRound, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Search, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useUIStore } from '../store/useUIStore';
import { THEME } from '../styles/theme';
import ProfileModal from './ProfileModal';
import ChangePasswordModal from './ChangePasswordModal';

const Navbar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed, mobileSidebarOpen, toggleSidebar, toggleMobileSidebar } = useUIStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const isPortal = location.pathname === '/portal';
  const isScenario = location.pathname === '/orrery/scenario';
  const isFullPage = isPortal || isScenario;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={`${
        isFullPage ? 'absolute left-0 top-0 z-50 h-20 w-full' : 'relative z-20 h-20'
      } flex flex-shrink-0 items-center justify-between bg-transparent px-4 sm:px-6 lg:px-8`}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {!isFullPage && (
          <>
            <button
              onClick={toggleMobileSidebar}
              className="mr-2 inline-flex rounded-xl p-2 text-neutral-500 transition-all hover:bg-white/70 hover:text-black sm:hidden"
              aria-label={mobileSidebarOpen ? '关闭导航菜单' : '打开导航菜单'}
            >
              {mobileSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>

            <button
              onClick={toggleSidebar}
              className="mr-2 hidden rounded-xl p-2 text-neutral-500 transition-all hover:bg-white/70 hover:text-black sm:inline-flex lg:hidden"
              aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>

            <Link
              to="/portal"
              className="mr-4 rounded-xl p-2 text-neutral-500 transition-all hover:bg-white/70 hover:text-black"
              title="返回工作台"
            >
              <LayoutGrid size={20} />
            </Link>
          </>
        )}

        {!isFullPage && (
          <div className={`hidden max-w-xl flex-1 lg:block ${THEME.searchWrapper}`}>
            <Search className={THEME.searchIcon} />
            <input
              type="text"
              placeholder="搜索知识、日志、系统..."
              className={THEME.searchInputGlass}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className={`relative ${THEME.buttonIcon}`} aria-label="通知">
          <Bell size={20} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-black ring-4 ring-neutral-100" />
        </button>

        <div className="relative flex items-center border-l border-neutral-300/40 pl-3" ref={menuRef}>
          <button onClick={() => setShowUserMenu((value) => !value)} className="group" aria-label="用户菜单">
            <div className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-black shadow-lg transition-transform group-hover:scale-105">
              {user?.avatar ? (
                <img src={user.avatar} alt="用户头像" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white">
                  {user?.nickname ? user.nickname.slice(0, 2) : 'U'}
                </span>
              )}
            </div>
          </button>

          {showUserMenu && (
            <div className={`absolute right-0 top-full z-50 mt-3 w-56 overflow-hidden ${THEME.dropdown}`}>
              <div className="border-b border-neutral-100 p-4">
                <p className="text-sm font-bold text-black">{user?.nickname || '用户'}</p>
                <p className="mt-0.5 text-xs text-neutral-400">{user?.username}</p>
              </div>
              {!user?.superAdmin && (
                <div className="py-2">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowProfileModal(true);
                    }}
                    className="flex w-full items-center px-4 py-3 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black"
                  >
                    <User size={16} className="mr-3 text-neutral-400" />
                    个人信息
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowPasswordModal(true);
                    }}
                    className="flex w-full items-center px-4 py-3 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black"
                  >
                    <KeyRound size={16} className="mr-3 text-neutral-400" />
                    修改密码
                  </button>
                </div>
              )}
              <div className="border-t border-neutral-100 py-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center px-4 py-3 text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut size={16} className="mr-3" />
                  安全退出
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
      <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </header>
  );
};

export default Navbar;
