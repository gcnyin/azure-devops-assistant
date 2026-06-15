"""
通用常量和辅助函数 — 供 Web UI 使用
"""

# ── 类型图标 ──
_TYPE_ICONS: dict[str, str] = {
    "bug": "",
    "task": "",
    "feature": "",
    "user story": "",
    "issue": "",
    "epic": "",
}

# ── 状态颜色（HEX，Web 使用） ──
STATE_COLORS_HEX: dict[str, str] = {
    "done": "#59d499",
    "closed": "#59d499",
    "completed": "#59d499",
    "resolved": "#3aad7f",
    "in progress": "#ffc533",
    "active": "#ffc533",
    "committed": "#e5a81c",
    "to do": "#57c1ff",
    "new": "#57c1ff",
    "removed": "#ff6161",
    "blocked": "#ff6161",
}


def type_icon(wi_type: str) -> str:
    return _TYPE_ICONS.get(wi_type.lower().strip(), "")


def state_color_hex(state: str) -> str:
    return STATE_COLORS_HEX.get(state.lower().strip(), "#9ca3af")


def state_bg_hex(state: str) -> str:
    return f"{state_color_hex(state)}20"
