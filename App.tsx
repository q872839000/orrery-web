import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './src/shared/components/Layout';
import { useAuthStore } from './src/shared/store/useAuthStore';

const Login = lazy(() => import('./src/features/auth/Login'));
const Portal = lazy(() => import('./src/features/portal/Portal'));
const Dashboard = lazy(() => import('./src/features/dashboard/Dashboard'));
const KnowledgeListPage = lazy(() => import('./src/features/knowledge/KnowledgeListPage'));
const KnowledgeDetailPage = lazy(() => import('./src/features/knowledge/detail/KnowledgeDetailPage'));
const KnowledgeSearchPage = lazy(() => import('./src/features/knowledge/search/SearchPage'));
const KnowledgeChatPage = lazy(() => import('./src/features/knowledge/chat/ChatPage'));
const UserManagement = lazy(() => import('./src/features/user/UserManagement'));
const RoleManagement = lazy(() => import('./src/features/user/RoleManagement'));
const MenuManagement = lazy(() => import('./src/features/user/MenuManagement'));
const AdminPortal = lazy(() => import('./src/features/admin/AdminPortal'));
const LlmProvidersPage = lazy(() => import('./src/features/admin/LlmProvidersPage'));
const OrreryPortal = lazy(() => import('./src/features/orrery/OrreryPortal'));
const AgentsPage = lazy(() => import('./src/features/orrery/AgentsPage'));
const InvokePage = lazy(() => import('./src/features/orrery/InvokePage'));
const WorkspacePage = lazy(() => import('./src/features/orrery/WorkspacePage'));
const TasksPage = lazy(() => import('./src/features/orrery/TasksPage'));
const MemoryPage = lazy(() => import('./src/features/orrery/MemoryPage'));
const AuditPage = lazy(() => import('./src/features/admin/AuditPage'));
const ScenarioPage = lazy(() => import('./src/features/orrery/ScenarioPage'));

const LoadingScreen = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-transparent backdrop-blur-sm">
    <Loader2 className="animate-spin text-black" size={40} />
  </div>
);

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/portal" replace />} />
          <Route path="portal" element={<Portal />} />

          <Route path="dashboard" element={<Dashboard />} />
          <Route path="knowledge">
            <Route index element={<KnowledgeListPage />} />
            <Route path="search" element={<KnowledgeSearchPage />} />
            <Route path="chat" element={<KnowledgeChatPage />} />
            <Route path=":id" element={<KnowledgeDetailPage />} />
          </Route>

          <Route path="system">
            <Route index element={<AdminPortal />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="roles" element={<RoleManagement />} />
            <Route path="menus" element={<MenuManagement />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="llm-providers" element={<LlmProvidersPage />} />
            <Route
              path="settings"
              element={
                <div className="p-8 text-center">
                  <h2 className="text-2xl font-black">系统偏好设置</h2>
                  <p className="mt-2 font-medium text-neutral-400">配置中心正在建设中...</p>
                </div>
              }
            />
          </Route>

          <Route path="orrery">
            <Route index element={<OrreryPortal />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="invoke" element={<InvokePage />} />
            <Route path="workspace" element={<WorkspacePage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="scenario" element={<ScenarioPage />} />
          </Route>

          <Route path="admin" element={<Navigate to="/system" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
