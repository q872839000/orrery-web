import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { ToastProvider } from './ui/ToastManager';
import { useUIStore } from '../store/useUIStore';
import '../../styles/toast.css';

const Layout: React.FC = () => {
  const location = useLocation();
  const { mobileSidebarOpen, closeMobileSidebar } = useUIStore();
  const isPortal = location.pathname === '/portal';
  const isScenario = location.pathname === '/orrery/scenario';
  const isFullPage = isPortal || isScenario;

  useEffect(() => {
    if (mobileSidebarOpen) {
      closeMobileSidebar();
    }
  }, [location.pathname, mobileSidebarOpen, closeMobileSidebar]);

  return (
    <ToastProvider>
      <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
        {!isFullPage && <Sidebar />}
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <Navbar />
          <main
            className={`min-h-0 flex-1 ${
              isFullPage
                ? 'overflow-hidden p-0'
                : 'overflow-y-auto px-4 pb-4 pt-2 sm:px-5 lg:px-6'
            }`}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
};

export default Layout;
