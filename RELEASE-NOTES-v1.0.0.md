# v1.0.0 — Windows 桌面提醒卡片

首个正式版本。所有提醒统一从屏幕右下角弹出。

## 它做什么

DSH 需要你介入的时候，你不用一直盯着窗口：

- **需要你确认决策**时弹一张卡片 —— 提问（含选项 / 计划审批）、权限申请（approval）
- **一轮任务结束**时弹一张卡片 —— 正常完成、失败、被中断（失败会带上错误摘要）
- 子代理（subagent）会话默认不打扰，可配置打开

## 卡片长什么样

- 深色圆角卡片，右下角浮出，按类型配色：确认蓝 / 审批橙 / 完成绿 / 失败红
- 左侧强调条 + 圆形角标 + 标题 + 会话/项目信息 + 正文摘要（自动裁剪、合并空白）
- 淡入 + 轻微上滑进场，到时间淡出消失
- **点一下就回到 DSH 窗口**（也可以配置成打开某个 URL 或纯展示）
- 多张卡片自动向上堆叠，最多同屏 3 张，其余排队；两次之间最短间隔 1.2 秒，避免刷屏

## 配置

在 profile 的 `cordis.patch.yml` 里给 `windows-notify` 这一行写 `config`，例如：

```yaml
- insert:
    - id: windows-notify
      name: dsh-desktop-alerts
      config:
        position: bottom-right      # bottom-right | bottom-left | top-right | top-left | center
        durationMs: 12000
        questions: true             # 提问
        approvals: true             # 权限申请
        completed: true             # 完成
        errors: true                # 失败
        includeSubagents: false
        sound: true
        soundName: asterisk         # asterisk | beep | exclamation | hand | question | none
        clickAction: focus          # focus | url | none
        maxVisible: 3
        language: auto              # auto | zh | en
```

所有键都有默认值，不写也能用。

## 安装

```bash
dsh plugin --profile web add dsh-desktop-alerts
```

源码安装：

```bash
git clone https://github.com/depthinker925/dsh-desktop-alerts.git
cd dsh-desktop-alerts
dsh plugin --profile web add .
```

## 兼容与限制

- Windows 10 / 11（其他平台自动不生效），需要 Node.js >= 22，PowerShell 5.1（系统自带）
- 不使用 Windows 原生 toast：未注册 AUMID 的进程发 toast 会被系统静默丢弃，所以改用自绘的 WPF 卡片
- 因此卡片只在屏幕上停留，不会进入通知中心（历史记录）
- 只在本地渲染，不联网、不改注册表、不改系统通知设置

## 验证

- `node scripts/selftest.mjs` → 17 tests / 0 fail
- `docs/preview.png` 是真机渲染截图
- 开发期已在 DeepSeek Harness 桌面版实测：提问、完成两条链路均正常弹卡

**完整变更**：首个版本。
