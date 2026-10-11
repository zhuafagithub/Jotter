# 小记 Jotter

轻量的本地待办与笔记桌面应用。数据完全存储在本机，无需登录、无需联网，打开即用。

基于 Tauri 2 + Vue 3 + TypeScript 构建，安装包仅约 2.4 MB。

![Tech](https://img.shields.io/badge/Tauri-2-24C8DB) ![Tech](https://img.shields.io/badge/Vue-3-4FC08D) ![Tech](https://img.shields.io/badge/TypeScript-6.0-3178C6) ![Platform](https://img.shields.io/badge/Windows-x64-0078D4)

<!-- 截图占位：准备好截图后取消注释并替换路径
![主界面](docs/screenshot-main.png)
-->

## 功能特性

### 待办
- 三种状态流转：未开始 / 进行中 / 已完成
- 智能分组展示（按状态与截止时间自动归组，已完成默认折叠，可展开）
- 多种排序：智能分组 / 按截止时间 / 按创建时间 / 按状态
- 截止与提醒时间设置
- 与笔记共用一套文件夹体系，各自独立分类

### 笔记
- 富文本编辑：加粗、斜体、下划线、删除线、高亮、文字颜色、标题、列表、引用、分割线
- 粘贴 Markdown 自动转换为富文本
- 代码块：语法高亮（highlight.js）、语言选择、块内折叠、一键复制
- 图片：剪贴板粘贴、拖拽插入
- 超链接插入与点击打开
- 文内查找（Ctrl+F）与全局搜索
- 从代码块复制内容粘贴时自动转为纯文本，避免嵌套代码块

### 应用
- 系统托盘常驻：点关闭隐藏到托盘，托盘左键唤起，右键菜单退出
- 深色 / 浅色主题一键切换，偏好自动记忆
- 设置面板：版本信息、数据文件位置查看与一键打开
- 数据原子写入（先写临时文件再重命名），避免异常退出导致数据损坏

## 下载安装

前往 [Releases](https://github.com/zhuafagithub/Jotter/releases) 下载 `Jotter_x.y.z_x64-setup.exe`，双击安装即可。

要求：Windows 10/11 x64（应用内置 WebView2 运行时检测，系统缺少时会自动提示安装）。

## 数据存储

所有数据保存在本机单一 JSON 文件中：

```
%APPDATA%\Jotter_xiaoji\data.json
```

- 不上传、不联网、无任何遥测
- 从旧版本（`com.zhuaf.sticky-notes` 目录）升级时，首次启动会自动迁移历史数据
- 备份只需复制这一个文件；设置面板内可一键打开所在文件夹

## 从源码构建

前置要求：

- [Node.js](https://nodejs.org/) 20.19+ 或 22.12+
- [Rust](https://rustup.rs/) stable（MSVC 工具链）
- Windows 10/11

```bash
# 安装依赖
npm install

# 开发调试（热更新）
npm run tauri dev

# 打包 Windows 安装程序
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/nsis/Jotter_x.y.z_x64-setup.exe`。

## 项目结构

```
sticky-notes/
├── src/                  # 前端（Vue 3 + TypeScript）
│   ├── components/       # 界面组件（导航 / 列表 / 编辑器 / 排序等）
│   ├── stores/           # 数据与界面状态
│   ├── composables/      # 主题等组合式函数
│   └── styles/           # 全局样式与主题变量
├── src-tauri/            # 后端（Rust / Tauri 2）
│   ├── src/lib.rs        # 数据持久化与系统托盘
│   └── icons/            # 应用图标（由 scripts/gen-icon.mjs 生成）
└── scripts/              # 图标生成等辅助脚本
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2（Rust） |
| 前端框架 | Vue 3 + Vite |
| 富文本编辑 | TipTap 2 |
| 代码高亮 | lowlight / highlight.js |
| 图标 | lucide |

## 关于作者

万发（[zhuafagithub](https://github.com/zhuafagithub)）
