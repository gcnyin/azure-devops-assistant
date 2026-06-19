# Azure DevOps Sprint Monitor
# 基于 Python 3.10-slim，匹配 pyproject.toml 中的最低版本要求
FROM python:3.10-slim

LABEL org.opencontainers.image.title="Azure DevOps Sprint Monitor"
LABEL org.opencontainers.image.description="定时监控 Azure DevOps Sprint 看板，Web UI + 增量对比 + AI 修复建议"
LABEL org.opencontainers.image.source="https://github.com/steycode/azure-devops-assistant"

# 从 uv 官方镜像复制 uv 二进制（多阶段构建，不增加最终镜像层的体积）
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# 设置工作目录
WORKDIR /app

# 安装系统依赖，清理 apt 缓存以减小镜像体积
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        # notify-send 桌面通知依赖
        libnotify-bin \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存加速构建
COPY pyproject.toml uv.lock ./

# 使用 uv 安装依赖（--frozen 确保精确复现 lockfile）
# --no-dev 仅安装生产依赖，减小镜像体积
RUN uv sync --frozen --no-dev

# 复制项目源码
COPY *.py .
COPY static/ static/

# 创建运行时目录（logs、数据库等通过 volume 挂载到宿主机）
RUN mkdir -p /app/logs

# 复制入口脚本并设置可执行权限
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 暴露 Web UI 端口
EXPOSE 8080

# 健康检查：通过 /health 端点确认 Web 服务存活
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD .venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')" || exit 1

# 使用非 root 用户运行（安全最佳实践）
RUN useradd --create-home --shell /bin/bash sprintmon \
    && chown -R sprintmon:sprintmon /app
USER sprintmon

ENTRYPOINT ["docker-entrypoint.sh"]
