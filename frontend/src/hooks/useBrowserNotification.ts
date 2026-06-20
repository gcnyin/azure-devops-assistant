import { useEffect, useRef, useState, useCallback } from "react";
import type { BoardData, DiffInfo } from "@/types/api";

const LS_MAIN_KEY = "browserNotifyEnabled";
const LS_CATEGORY_KEY = "browserNotifyCategories";

export type NotifyCategory = "new" | "changed" | "gone";

export type CategoryToggles = Record<NotifyCategory, boolean>;

const DEFAULT_CATEGORIES: CategoryToggles = { new: true, changed: true, gone: true };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore
  }
}

export interface BrowserNotificationState {
  permission: NotificationPermission | "unsupported";
  enabled: boolean;
  categories: CategoryToggles;
  requestPermission: () => Promise<void>;
  toggleEnabled: () => void;
  toggleCategory: (cat: NotifyCategory) => void;
  notifyRefresh: (diff: DiffInfo) => void;
}

export function useBrowserNotification(
  data: BoardData | undefined,
  onNavigate?: (params: Record<string, string>) => void,
): BrowserNotificationState {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [enabled, setEnabled] = useState(() => loadJson(LS_MAIN_KEY, true));
  const [categories, setCategories] = useState<CategoryToggles>(() =>
    loadJson(LS_CATEGORY_KEY, DEFAULT_CATEGORIES),
  );

  const prevDiffRef = useRef<{ newCount: number; changedCount: number; goneCount: number } | null>(null);
  const isInitialRef = useRef(true);
  const prevSprintRef = useRef<string>("");

  // 用于通知点击时导航 -- 存最近一次通知的上下文
  const lastNotifyCtx = useRef<{ diffType: NotifyCategory | null; sprint: string }>({
    diffType: null,
    sprint: "",
  });

  // 跟踪 sprint 切换，切换时重置 isInitial
  const currentSprint = data?.iteration?.name || "";
  useEffect(() => {
    if (currentSprint && currentSprint !== prevSprintRef.current) {
      prevSprintRef.current = currentSprint;
      isInitialRef.current = true;
      prevDiffRef.current = null;
    }
  }, [currentSprint]);

  // 监听 permission 变化
  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
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
      saveJson(LS_MAIN_KEY, next);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: NotifyCategory) => {
    setCategories((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      saveJson(LS_CATEGORY_KEY, next);
      return next;
    });
  }, []);

  // 从 DiffInfo 提取计数
  const extractCounts = useCallback((diff: DiffInfo) => {
    const newCount = diff.new_items?.length || 0;
    const changedCount = (diff.continuing_items || []).filter((it) => it._state_changed).length;
    const goneCount = diff.gone_items?.length || 0;
    return { newCount, changedCount, goneCount };
  }, []);

  // 判断哪些启用的分类有变化，返回触发类型列表
  const getTriggerCategories = useCallback(
    (prev: { newCount: number; changedCount: number; goneCount: number } | null, curr: {
      newCount: number; changedCount: number; goneCount: number;
    }) => {
      if (!prev) return { types: [] as NotifyCategory[], hasChange: true };
      const types: NotifyCategory[] = [];
      if (categories.new && curr.newCount !== prev.newCount) types.push("new");
      if (categories.changed && curr.changedCount !== prev.changedCount) types.push("changed");
      if (categories.gone && curr.goneCount !== prev.goneCount) types.push("gone");
      return { types, hasChange: types.length > 0 };
    },
    [categories],
  );

  // 构建通知标题和正文
  const buildNotificationContent = useCallback(
    (counts: { newCount: number; changedCount: number; goneCount: number }, triggerTypes: NotifyCategory[]) => {
      const sprint = data?.iteration?.name || "";
      const project = data?.project || "Azure DevOps";

      const title = sprint ? `${project} / ${sprint}` : project;

      const parts: string[] = [];
      if (triggerTypes.includes("new") && counts.newCount) parts.push(`+${counts.newCount} 新增`);
      if (triggerTypes.includes("changed") && counts.changedCount) parts.push(`~${counts.changedCount} 状态变化`);
      if (triggerTypes.includes("gone") && counts.goneCount) parts.push(`-${counts.goneCount} 消失`);

      let body = parts.join("  ");

      // 纯新增且仅 1-3 条时，附标题
      if (
        triggerTypes.length === 1 &&
        triggerTypes[0] === "new" &&
        counts.newCount <= 3 &&
        counts.newCount > 0 &&
        data?.diff_info
      ) {
        const titles = data.diff_info.new_items
          .slice(0, 3)
          .map((it) => it.title)
          .join(", ");
        body = `+${counts.newCount} 新增: ${titles}`;
      }

      return { title, body };
    },
    [data],
  );

  // 发送通知
  const sendNotification = useCallback(
    (title: string, body: string, primaryType: NotifyCategory | null, sprint: string) => {
      lastNotifyCtx.current = { diffType: primaryType, sprint };
      try {
        const notification = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: "sprint-monitor",
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
          const ctx = lastNotifyCtx.current;
          if (ctx.diffType && onNavigate) {
            const params: Record<string, string> = { diff: ctx.diffType };
            if (ctx.sprint) params.sprint = ctx.sprint;
            onNavigate(params);
          }
        };

        setTimeout(() => notification.close(), 8000);
      } catch {
        // 通知创建失败，静默忽略
      }
    },
    [onNavigate],
  );

  // 主通知逻辑（提取为独立函数，供轮询和 refresh 共用）
  const processDiff = useCallback(
    (diff: DiffInfo, isRefresh: boolean) => {
      if (permission !== "granted" || !enabled) return;
      if (!diff) return;

      const counts = extractCounts(diff);
      const { types, hasChange } = getTriggerCategories(isRefresh ? null : prevDiffRef.current, counts);

      // 刷新模式强制通过（isRefresh 时 prevDiffRef 传 null，hasChange 恒为 true）
      if (!hasChange) return;

      // 仅前台时除外（手动 refresh 允许前台通知）
      if (!document.hidden && !isRefresh) {
        prevDiffRef.current = counts;
        return;
      }

      // 首次加载：仅记录状态，不触发通知
      if (isInitialRef.current && !isRefresh) {
        isInitialRef.current = false;
        prevDiffRef.current = counts;
        return;
      }

      // 没有任何启用的分类有变化
      if (types.length === 0) {
        prevDiffRef.current = counts;
        return;
      }

      const { title, body } = buildNotificationContent(counts, types);
      // 主触发类型：优先取第一个，用于点击导航
      const primaryType = types[0];

      sendNotification(title, body, primaryType, data?.iteration?.name || "");

      if (!isRefresh) {
        isInitialRef.current = false;
      }
      prevDiffRef.current = counts;
    },
    [
      permission, enabled, extractCounts, getTriggerCategories,
      buildNotificationContent, sendNotification, data,
    ],
  );

  // 轮询触发：监听 data 变化
  useEffect(() => {
    if (!data?.diff_info) return;
    processDiff(data.diff_info, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // 手动 refresh 入口
  const notifyRefresh = useCallback(
    (diff: DiffInfo) => {
      processDiff(diff, true);
    },
    [processDiff],
  );

  return {
    permission,
    enabled,
    categories,
    requestPermission,
    toggleEnabled,
    toggleCategory,
    notifyRefresh,
  };
}
