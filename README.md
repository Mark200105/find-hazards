# 火眼金睛 · 安全隐患大排查

H5 互动科普小游戏 —— 第十届青岛市"安全在我心中"应急安全文化教育活动中 新媒体类参赛作品。

在学生宿舍、实验室、居家厨房三个手绘场景中限时找出 24 处安全隐患，学习对应整改知识，并通过应急处置情景测验赢取"安全称号"。纯原生 HTML/CSS/JS 实现，零外部依赖、无任何第三方素材，手机 / 电脑均可直接打开游玩。

## 在线游玩

部署到 GitHub Pages 后的访问地址：`https://<你的用户名>/github.io/find-hazards/`（以实际仓库名为准）

## 本地运行

无需安装任何东西，直接双击 `index.html` 即可在浏览器中游玩；或在本目录执行：

```bash
python -m http.server 8899
# 然后访问 http://127.0.0.1:8899
```

## 部署到 GitHub Pages（网页上传方式，无需命令行）

1. 登录 [github.com](https://github.com)，右上角 `+` → **New repository**；
2. 仓库名填 `find-hazards`，选择 **Public**，点击 **Create repository**；
3. 在新仓库页面点击 **uploading an existing file** 链接；
4. 把本目录下的 `index.html`、`css` 文件夹、`js` 文件夹一起拖入上传区（保持目录结构），点击 **Commit changes**；
5. 进入仓库 **Settings → Pages**，在 Branch 下选择 `main` / `(root)`，点击 **Save**；
6. 等待 1~2 分钟，访问 `https://<用户名>.github.io/find-hazards/` 验证。

## 目录结构

```
h5-game/
├── index.html      # 页面结构 + 三个手绘 SVG 场景
├── css/style.css   # 样式（自适应手机/桌面）
└── js/
    ├── data.js     # 24 处隐患知识 + 6 道应急题 + 称号规则
    └── app.js      # 游戏逻辑（计时/判分/音效/结算）
```

## 说明

- 科普内容依据公开消防安全常识整理，仅供学习参考；
- 全部代码与画面均为原创绘制，无第三方版权素材；字体使用系统自带字体。
