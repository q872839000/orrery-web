# orrery-web

Orrery 智能平台前端控制台。知识库是平台的一个模块，与智能管家（Orrery）、系统管理并列。

## 模块

- **智能管家** `/orrery`：管家对话、多智能体路由、记忆档案、协作任务、想定推演、Workspace 配置
- **知识库** `/knowledge`：知识库管理、文档摄入、智慧检索、知识问答、本体 / Wiki / 图谱浏览
- **系统管理** `/system`：成员、角色、菜单、审计

## 技术栈

React 19 + Vite 6 + TypeScript + Tailwind CSS 4 + zustand + react-router 7；图谱/流程图用 @xyflow/react + dagre。

## 开发

```bash
npm install
npm run dev    # http://localhost:3000
```

默认直连本地服务：知识库服务 `http://localhost:8999`、Orrery 网关 `http://localhost:8582`（见 `src/shared/config/index.ts`）。

## 规范

- 常量集中在 `src/shared/constants/`，禁止散落魔法字符串
- 接口访问集中在 `src/shared/services/`（按域拆分），组件不直接调 axios
- 样式统一走 `src/shared/styles/theme.ts` 的 token，UI 原语在 `src/shared/components/ui/`
- 后端 VO 对齐类型在 `src/shared/types/knowledge.ts`（ID 均为 string）
