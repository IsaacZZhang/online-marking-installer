# 在线阅卷批改助手 · 安装器

教师在线阅卷（智学网等平台）主观题批量批改 skill 的一句话安装器。

## 安装（对 WorkBuddy 说这一句即可）

```
帮我安装在线阅卷批改助手：运行 npx -y github:IsaacZZhang/online-marking-installer install
```

需要 Node.js 18+（WorkBuddy 已自带）。支持 macOS 与 Windows。

## 它会做什么

| 情况 | 行为 |
|---|---|
| 还没购买 | 输出 skillpay 官方购买流程的指令交给 agent：你用支付宝扫码确认付款，agent 完成安装后再运行一次本命令 |
| 已购买（装在 WorkBuddy、`~/.agents/skills`、Claude Code 等任意 agent 目录） | 自动补装进 WorkBuddy，并一键初始化：阅卷 Python 环境、下载安装 ego lite 浏览器（无需自己去官网下载）、注册浏览器命令，最后打开浏览器自检 |

装好后只剩一步：在弹出的 ego lite 浏览器里登录阅卷平台，打开要批改的那道题。

## 其他命令

```bash
npx -y github:IsaacZZhang/online-marking-installer status    # 查看安装情况
npx -y github:IsaacZZhang/online-marking-installer help
```

退出码：`0` 就绪 · `10` 只差用户在界面上点一下 · `3` 需要先购买 · `1` 失败。

## 说明

- 本仓库只有安装器，不含 skill 本体；付款只经支付宝 / skillpay 官方页面，由用户本人确认。
- 商品页：https://skillpay.alipay.com/shelf/product?productId=P0806000211890959&merchantId=2088312185165963
