import { useState, useRef, useEffect, useCallback } from "react";
import type { NotifyCategory, CategoryToggles } from "@/hooks/useBrowserNotification";

interface NotificationPopoverProps {
  permission: NotificationPermission | "unsupported";
  enabled: boolean;
  categories: CategoryToggles;
  onToggleEnabled: () => void;
  onToggleCategory: (cat: NotifyCategory) => void;
  onRequestPermission: () => void;
}

const CATEGORY_LABELS: Record<NotifyCategory, string> = {
  new: "新增",
  changed: "状态变更",
  gone: "消失",
};

const CATEGORY_DOT_COLORS: Record<NotifyCategory, string> = {
  new: "bg-success",
  changed: "bg-accent-amber",
  gone: "bg-error",
};

export function NotificationPopover({
  permission,
  enabled,
  categories,
  onToggleEnabled,
  onToggleCategory,
  onRequestPermission,
}: NotificationPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleTriggerClick = useCallback(() => {
    if (permission !== "granted") {
      onRequestPermission();
      return;
    }
    setOpen((prev) => !prev);
  }, [permission, onRequestPermission]);

  const renderBellIcon = () => {
    if (permission === "unsupported") {
      return <span className="text-ink-soft text-sm">-</span>;
    }
    if (permission === "denied") {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          <line x1="2" y1="2" x2="22" y2="22"/>
        </svg>
      );
    }
    // granted -- normal bell, always same look (open/closed state is inside panel)
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    );
  };

  const anyCategoryOff = !categories.new || !categories.changed || !categories.gone;

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-sm transition-colors
          ${permission !== "granted"
            ? "hover:bg-surface-card text-ink-muted"
            : anyCategoryOff || !enabled
              ? "hover:bg-surface-card text-ink-muted"
              : "hover:bg-surface-card text-ink-muted"}
          ${open ? "bg-surface-card" : ""}
        `}
        onClick={handleTriggerClick}
        title={
          permission === "unsupported" ? "此浏览器不支持通知"
          : permission === "denied" ? "通知权限已被拒绝"
          : "通知设置"
        }
      >
        {renderBellIcon()}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-2 w-52 bg-canvas border border-hairline rounded-xl shadow-lg z-50 p-3"
        >
          {/* 主开关 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-ink">桌面通知</span>
            <button
              type="button"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? "bg-primary" : "bg-ink-soft/30"
              }`}
              onClick={onToggleEnabled}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 分割线 */}
          <div className="border-t border-hairline my-2" />

          {/* 分类开关 */}
          <div className="space-y-1.5">
            {(Object.entries(CATEGORY_LABELS) as [NotifyCategory, string][]).map(([cat, label]) => (
              <label
                key={cat}
                className={`flex items-center gap-2 px-1 py-1 rounded-md cursor-pointer select-none transition-colors
                  ${enabled ? "hover:bg-surface-card" : "opacity-40 pointer-events-none"}
                `}
              >
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_DOT_COLORS[cat]}`} />
                <span className="text-sm text-ink-body flex-1">{label}</span>
                <button
                  type="button"
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    categories[cat] ? "bg-primary" : "bg-ink-soft/30"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    onToggleCategory(cat);
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                      categories[cat] ? "translate-x-[14px]" : "translate-x-[2px]"
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
