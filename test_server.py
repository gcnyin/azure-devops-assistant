"""启动带测试数据的 Web 服务器"""
import sqlite3
from web import app, update_cached_data, run_web_server
from utils import find_available_port, setup_logging

setup_logging()

# ── 注入测试数据 ──
update_cached_data(
    iteration={'name': 'Sprint 26', 'startDate': '2026-06-01', 'finishDate': '2026-06-15'},
    items=[
        {'id': 12345, 'title': '登录页面样式错乱', 'state': 'To Do', 'type': 'Bug', 'assignedTo': '张三', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12345'},
        {'id': 12346, 'title': '用户头像上传功能', 'state': 'In Progress', 'type': 'Feature', 'assignedTo': '李四', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12346'},
        {'id': 12347, 'title': 'API 响应超时优化', 'state': 'Active', 'type': 'Task', 'assignedTo': '张三', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12347'},
        {'id': 12348, 'title': '数据库迁移脚本', 'state': 'Done', 'type': 'Task', 'assignedTo': '王五', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12348'},
        {'id': 12349, 'title': '导航栏高亮当前页', 'state': 'Committed', 'type': 'Bug', 'assignedTo': '李四', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12349'},
        {'id': 12350, 'title': '周报邮件模板更新', 'state': 'Closed', 'type': 'User Story', 'assignedTo': '赵六', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12350'},
        {'id': 12351, 'title': '移动端适配首页', 'state': 'New', 'type': 'Task', 'assignedTo': '王五', 'htmlUrl': 'https://dev.azure.com/org/proj/_workitems/edit/12351'},
    ],
    diff_info={
        'prev_time': '2026-06-15 10:00:00',
        'new_items': [
            {'id': 12345, 'title': '登录页面样式错乱', 'state': 'To Do', 'type': 'Bug', 'assignedTo': '张三'},
            {'id': 12351, 'title': '移动端适配首页', 'state': 'New', 'type': 'Task', 'assignedTo': '王五'},
        ],
        'continuing_items': [
            {'id': 12346, 'title': '用户头像上传功能', 'state': 'In Progress', 'type': 'Feature', 'assignedTo': '李四', '_prev_state': 'To Do', '_state_changed': True},
            {'id': 12347, 'title': 'API 响应超时优化', 'state': 'Active', 'type': 'Task', 'assignedTo': '张三', '_prev_state': 'Active', '_state_changed': False},
        ],
        'gone_items': [
            {'id': 12352, 'title': '旧版登录页清理', 'state': 'Removed', 'type': 'Task', 'assignedTo': '张三'},
        ],
    },
    assigned_to='张三',
    team_name='DevTeam',
    project='MyProject',
)

# ── 写入 AI 修复测试数据 ──
db = sqlite3.connect('sprint_history.db')
db.execute("""CREATE TABLE IF NOT EXISTS ai_fixes (
    bug_id INTEGER PRIMARY KEY, bug_title TEXT, response TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
)""")
fix_response = """[agent: pi]

## 问题分析
登录页面的 CSS 样式存在以下问题：
- `.login-form` 的 margin-top 使用了固定像素值
- Flex 布局的 align-items 未设置

## 修复方案

### 文件: src/pages/Login.jsx

    - .login-form { margin-top: 120px; }
    + .login-form { margin-top: 10vh; display: flex; align-items: center; }

建议修改后运行测试确保登录流程正常。"""
db.execute(
    "INSERT OR REPLACE INTO ai_fixes (bug_id, bug_title, response, updated_at) VALUES (?, ?, ?, datetime('now'))",
    (12345, '登录页面样式错乱', fix_response),
)
db.commit()
db.close()

port = find_available_port(8080)
print(f"测试数据已就绪，启动服务器 http://localhost:{port} ...")
run_web_server(start_port=port, debug=False)
