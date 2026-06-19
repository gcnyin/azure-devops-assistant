import { useEffect, useRef, useState, useCallback } from "react";
import type { BoardData } from "@/types/api";

const LS_KEY = "browserNotifyEnabled";

function loadEnabled(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

function saveEnabled(v: boolean) {
  try {
    localStorage.setItem(LS_KEY, String(v));
  } catch {
    // ignore
  }
}

export interface BrowserNotificationState {
  permission: NotificationPermission | "unsupported";
  enabled: boolean;
  requestPermission: () => Promise<void>;
  toggleEnabled: () => void;
}

export function useBrowserNotification(
  data: BoardData | undefined,
): BrowserNotificationState {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [enabled, setEnabled] = useState(loadEnabled);
  const prevDiffRef = useRef<{ newCount: number; changedCount: number; goneCount: number } | null>(null);
  const isInitialRef = useRef(true);
  const prevSprintRef = useRef<string>("");

  // 跟踪 sprint 切换，切换时重置 isInitial
  const currentSprint = data?.iteration?.name || "";
  useEffect(() => {
    if (currentSprint && currentSprint !== prevSprintRef.current) {
      prevSprintRef.current = currentSprint;
      isInitialRef.current = true;
      prevDiffRef.current = null;
    }
  }, [currentSprint]);

  // 监听 permission 变化（用户可能在浏览器设置中修改）
  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    // 某些浏览器不支持 onpermissionchange 事件
    const checkPermission = () => setPermission(Notification.permission);
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "notifications" })
        .then((status) => {
          status.addEventListener("change", checkPermission);
        })
        .catch(() => {
          // 不支持 query，fallback
        });
    }
    return () => {
      // cleanup 由浏览器处理
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission("denied");
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      saveEnabled(next);
      return next;
    });
  }, []);

  // 主逻辑：对比 diff 并发送通知
  useEffect(() => {
    if (permission !== "granted" || !enabled) return;
    if (!data || !data.diff_info) return;

    const diff = data.diff_info;
    const newCount = diff.new_items?.length || 0;
    const changedCount =
      (diff.continuing_items || []).filter((it) => it._state_changed).length;
    const goneCount = diff.gone_items?.length || 0;

    // 首次加载：仅记录状态，不触发通知
    if (isInitialRef.current) {
      isInitialRef.current = false;
      prevDiffRef.current = { newCount, changedCount, goneCount };
      return;
    }

    // 仅在标签页后台时通知
    if (!document.hidden) {
      prevDiffRef.current = { newCount, changedCount, goneCount };
      return;
    }

    const prev = prevDiffRef.current;

    // 没有变化则跳过
    if (
      prev &&
      prev.newCount === newCount &&
      prev.changedCount === changedCount &&
      prev.goneCount === goneCount
    ) {
      return;
    }

    prevDiffRef.current = { newCount, changedCount, goneCount };

    // 无实际变化量
    if (newCount === 0 && changedCount === 0 && goneCount === 0) return;

    const sprint = data.iteration?.name || "";
    const project = data.project || "Azure DevOps";

    const parts: string[] = [];
    if (newCount) parts.push(`+${newCount} 新增`);
    if (changedCount) parts.push(`~${changedCount} 状态变化`);
    if (goneCount) parts.push(`-${goneCount} 消失`);

    const title = `${project} / ${sprint}`;
    let body = parts.join("  ");
    const firstNewItem = diff.new_items?.[0];
    if (newCount === 1 && firstNewItem) {
      body += `\n${firstNewItem.title}`;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "sprint-monitor", // 同一 tag 会替换已有通知
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 8 秒后自动关闭
      setTimeout(() => notification.close(), 8000);
    } catch {
      // 通知创建失败，静默忽略
    }
  }, [data, permission, enabled]);

  return { permission, enabled, requestPermission, toggleEnabled };
}
