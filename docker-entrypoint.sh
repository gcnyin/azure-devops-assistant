#!/bin/sh
set -e

# 默认值
WEB_PORT="${WEB_PORT:-8080}"
BIND_PUBLIC="${BIND_PUBLIC:-true}"
CHECK_INTERVAL="${CHECK_INTERVAL_MINUTES:-30}"

echo "=== Azure DevOps Sprint Monitor (Docker) ==="
echo "Web 端口: $WEB_PORT"
echo "公开访问: $BIND_PUBLIC"
echo "检查间隔: ${CHECK_INTERVAL} 分钟"

# 检查必要的环境变量
if [ -z "$AZURE_DEVOPS_ORG" ] || [ -z "$AZURE_DEVOPS_PROJECT" ] || [ -z "$AZURE_DEVOPS_PAT" ]; then
    if [ ! -f /app/.env ]; then
        echo "错误: 未设置 AZURE_DEVOPS_ORG / AZURE_DEVOPS_PROJECT / AZURE_DEVOPS_PAT 环境变量，且未挂载 .env 文件"
        echo "请通过以下方式之一提供配置:"
        echo "  1. docker-compose.yml 中的 environment 字段"
        echo "  2. 挂载 .env 文件到 /app/.env:  -v ./env:/app/.env"
        echo "  3. 通过 --env-file 参数:  docker run --env-file .env ..."
        exit 1
    fi
fi

# 确保数据库文件通过持久化数据目录保存（避免容器重建后丢失）
# db.py 默认写入 /app/sprint_history.db，通过软链接指向 /app/data/ 下的持久化目录
if [ ! -f /app/data/sprint_history.db ]; then
    echo "首次启动：初始化数据库文件 /app/data/sprint_history.db"
    touch /app/data/sprint_history.db
fi
if [ ! -L /app/sprint_history.db ]; then
    rm -f /app/sprint_history.db
    ln -sf /app/data/sprint_history.db /app/sprint_history.db
fi

# 构建启动参数
CMD_ARGS="-w $WEB_PORT"
if [ "$BIND_PUBLIC" = "true" ] || [ "$BIND_PUBLIC" = "1" ]; then
    CMD_ARGS="$CMD_ARGS --public"
fi

# 传递额外的自定义参数（如 --ai-fix）
if [ -n "$EXTRA_ARGS" ]; then
    CMD_ARGS="$CMD_ARGS $EXTRA_ARGS"
fi

echo "启动命令: python main.py $CMD_ARGS"
echo ""

exec python main.py $CMD_ARGS
