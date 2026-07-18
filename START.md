# 启动说明

这是 `study-dashboard` 项目的新手启动说明。推荐在 Windows 上用一键脚本启动，这样 PWA、桌面安装和离线能力更容易正常工作。

## 推荐方式：双击启动

双击项目根目录里的：

```bash
start-dashboard.bat
```

它会自动做这些事：

- 进入当前项目目录。
- 检查是否存在 `index.html`。
- 优先尝试 `python` 启动本地服务器。
- 如果没有 `python`，再尝试 `py`。
- 如果没有 `py`，再尝试 `python3`。
- 自动打开 `http://localhost:8000`。

黑色窗口不要关闭。它就是本地服务器窗口，关掉后页面可能还显示，但 PWA 离线测试和刷新访问会受影响。

## 手动启动方式

如果你想自己输入命令，可以在项目目录运行：

```bash
python -m http.server 8000
```

然后在浏览器打开：

```text
http://localhost:8000
```

## 备用命令

如果 `python` 不可用，可以尝试：

```bash
py -m http.server 8000
```

或：

```bash
python3 -m http.server 8000
```

## 为什么不能只双击 index.html 安装 PWA

直接双击 `index.html` 可以临时使用页面，但地址通常是 `file://...`。

PWA 的 Service Worker 通常需要在 `localhost` 或 HTTPS 环境下运行。也就是说，如果想安装为桌面 App、测试离线打开、让缓存能力更稳定，推荐用本地服务器打开：

```text
http://localhost:8000
```

## 黑窗口为什么不能关

运行 `start-dashboard.bat` 后出现的黑窗口是本地服务器。

只要这个窗口开着，浏览器就能通过 `http://localhost:8000` 访问项目。关闭窗口后，本地服务器停止，刷新页面可能会打不开。

## 常见问题

### py: command not found

说明当前环境里没有 `py` 这个命令。

可以尝试：

```bash
python -m http.server 8000
```

或：

```bash
python3 -m http.server 8000
```

如果三个命令都不可用，需要安装 Python，并在安装时勾选加入环境变量。

### 端口被占用

如果看到类似“Address already in use”或“端口被占用”，说明 `8000` 端口正在被其他程序使用。

可以先关闭之前打开的服务器黑窗口，再重新双击 `start-dashboard.bat`。

### 页面打不开

先确认黑窗口没有关闭，再确认浏览器地址是：

```text
http://localhost:8000
```

不要写成 `https://localhost:8000`。

### 缓存旧版本

如果页面还是旧版本，可以尝试：

- 按 `Ctrl + F5` 强制刷新。
- 关闭页面后重新打开。
- 在浏览器开发者工具里清理该网站的缓存。

清理浏览器数据前，记得先在页面里导出 JSON 备份，避免丢失 localStorage 学习数据。
