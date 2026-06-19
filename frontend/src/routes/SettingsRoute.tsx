import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings, useSaveSettings } from "@/hooks/useApi";
import type { SettingsData } from "@/types/api";

type SectionKey =
  | "azure"
  | "query"
  | "ai"
  | "notify"
  | "security"
  | "provider";

const SECTION_LABELS: Record<SectionKey, string> = {
  azure: "Azure DevOps 连接",
  query: "查询设置",
  ai: "AI 修复",
  notify: "通知",
  security: "安全",
  provider: "AI Provider",
};

interface FieldDef {
  key: keyof SettingsData;
  label: string;
  placeholder?: string;
  type?: string;
  hint?: string;
  sensitive?: boolean;
  restartNote?: boolean;
}

const SECTIONS: Record<SectionKey, { description: string; fields: FieldDef[] }> = {
  azure: {
    description: "连接 Azure DevOps 所需的基本信息。修改后需重启服务生效。",
    fields: [
      { key: "azure_devops_org", label: "组织 (ORG)", placeholder: "mycompany", restartNote: true },
      { key: "azure_devops_project", label: "项目 (Project)", placeholder: "MyProject", restartNote: true },
      { key: "azure_devops_team", label: "团队 (Team)", placeholder: "留空自动发现", restartNote: true },
      { key: "azure_devops_pat", label: "Personal Access Token", placeholder: "PAT", type: "password", sensitive: true, restartNote: true },
    ],
  },
  query: {
    description: "Sprint 查询策略和刷新频率。即时生效。",
    fields: [
      { key: "query_states", label: "查询状态列表", placeholder: "To Do,In Progress,Active,New,Committed", hint: "逗号分隔" },
      { key: "check_interval_minutes", label: "刷新间隔（分钟）", placeholder: "30", type: "number", hint: "最小 1 分钟" },
    ],
  },
  ai: {
    description: "AI 自动修复 Bug 的工作参数。即时生效。",
    fields: [
      { key: "work_dir", label: "代码仓库目录", placeholder: "/path/to/code/repo", hint: "Git 仓库所在目录" },
      { key: "ai_fix_timeout_seconds", label: "AI 修复超时（秒）", placeholder: "300", type: "number", hint: "默认 300 秒（5分钟）" },
      { key: "target_branch", label: "目标分支", placeholder: "develop", hint: "PR 合入的目标分支" },
    ],
  },
  notify: {
    description: "变化通知渠道配置。即时生效。",
    fields: [
      { key: "notify_desktop", label: "桌面通知", placeholder: "true/false", hint: "true 或 false" },
      { key: "notify_webhook_url", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/xxx", hint: "Slack/Teams 兼容" },
    ],
  },
  security: {
    description: "Web 访问认证。即时生效。",
    fields: [
      { key: "web_access_token", label: "Web 访问令牌", placeholder: "留空不启用认证", type: "password", sensitive: true, hint: "设置后 API 需 Bearer Token" },
      { key: "log_dir", label: "日志目录", placeholder: "留空使用默认 logs/", hint: "日志文件存放位置" },
    ],
  },
  provider: {
    description: "AI Provider 配置。用于 AI 修复功能。即时生效。",
    fields: [
      { key: "ai_provider", label: "AI Agent", placeholder: "auto / pi / claude / opencode / codex", hint: "auto 表示自动检测可用 agent" },
      { key: "ai_model", label: "AI 模型", placeholder: "claude-sonnet-4-20250514 / gpt-4o", hint: "指定使用的模型名称" },
      { key: "ai_api_base_url", label: "自定义 API Base URL", placeholder: "https://api.openai.com/v1", hint: "代理或私有部署地址" },
      { key: "ai_api_key", label: "AI API Key", placeholder: "sk-...", type: "password", sensitive: true, hint: "OpenAI / Anthropic / Azure OpenAI 等" },
    ],
  },
};

function isMaskedValue(value: string): boolean {
  return value.includes("*") && value.length > 4;
}

export default function SettingsRoute() {
  const { data: settings, isLoading, error } = useSettings();
  const saveMutation = useSaveSettings();

  const [form, setForm] = useState<SettingsData | null>(null);
  const [editedSensitive, setEditedSensitive] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<SectionKey>("azure");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings });
    }
  }, [settings, form]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-ink-muted text-sm">加载设置中...</p>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-error text-sm">无法加载设置，请确认后端服务已启动</p>
      </div>
    );
  }

  if (!form) return null;

  const handleFieldChange = (key: keyof SettingsData, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    // 敏感字段输入时清除掩码标记
    const fieldDef = getAllFields().find((f) => f.key === key);
    if (fieldDef?.sensitive) {
      setEditedSensitive((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  };

  const getAllFields = (): FieldDef[] => {
    return Object.values(SECTIONS).flatMap((s) => s.fields);
  };

  const handleSave = async () => {
    if (!form) return;
    setErrors({});

    // 客户端基础校验
    const newErrors: Record<string, string> = {};
    const org = form.azure_devops_org.trim();
    const project = form.azure_devops_project.trim();
    const pat = form.azure_devops_pat.trim();

    if (!org) newErrors.azure_devops_org = "组织不能为空";
    if (!project) newErrors.azure_devops_project = "项目不能为空";

    // PAT: 如果是掩码值（未修改）则不校验
    if (!editedSensitive.has("azure_devops_pat") && isMaskedValue(pat)) {
      // 未修改，使用原值
      form.azure_devops_pat = settings.azure_devops_pat;
    } else if (!pat) {
      newErrors.azure_devops_pat = "PAT 不能为空";
    }

    const interval = parseInt(form.check_interval_minutes, 10);
    if (isNaN(interval) || interval < 1) {
      newErrors.check_interval_minutes = "必须为正整数（>= 1）";
    }

    const timeout = parseInt(form.ai_fix_timeout_seconds, 10);
    if (isNaN(timeout) || timeout < 1) {
      newErrors.ai_fix_timeout_seconds = "必须为正整数（>= 1）";
    }

    const webhook = form.notify_webhook_url.trim();
    if (webhook && !webhook.startsWith("http://") && !webhook.startsWith("https://")) {
      newErrors.notify_webhook_url = "必须以 http:// 或 https:// 开头";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // 切换到第一个有错误的 section
      for (const key of Object.keys(newErrors)) {
        for (const [section, def] of Object.entries(SECTIONS)) {
          if (def.fields.some((f) => f.key === key)) {
            setActiveSection(section as SectionKey);
            break;
          }
        }
        break;
      }
      return;
    }

    try {
      const result = await saveMutation.mutateAsync(form);
      if (result.ok) {
        toast.success("设置已保存");
        if (result.config) {
          setForm({ ...result.config });
        }
        // 检查是否有需要重启才能生效的字段被修改
        const patChanged = editedSensitive.has("azure_devops_pat");
        const azureRestartFields = SECTIONS.azure.fields.filter(f => f.restartNote && f.key !== "azure_devops_pat");
        const azureChanged = azureRestartFields.some(f => form[f.key] !== settings[f.key]);
        if (patChanged || azureChanged) {
          toast.warning("Azure DevOps 连接设置已变更，需重启服务后生效");
        }
        setEditedSensitive(new Set());
        setErrors({});
      } else if (result.errors) {
        const mapped: Record<string, string> = {};
        for (const err of result.errors) {
          const [field, ...rest] = err.split(": ");
          mapped[field] = rest.join(": ") || err;
        }
        setErrors(mapped);
        toast.error("保存失败，请检查表单");
      } else {
        toast.error(result.error || "保存失败");
      }
    } catch {
      toast.error("保存请求失败");
    }
  };

  const renderField = (field: FieldDef) => {
    const value = form[field.key] ?? "";
    const isSensitive = field.sensitive ?? false;
    const isEditingSensitive = editedSensitive.has(field.key);
    const fieldError = errors[field.key];

    let displayValue = value;
    if (isSensitive && !isEditingSensitive && isMaskedValue(value)) {
      displayValue = value;
    }

    return (
      <div key={field.key} className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink flex items-center gap-2">
          {field.label}
          {field.restartNote && (
            <span className="text-[11px] text-accent-amber bg-accent-amber/10 px-1.5 py-0.5 rounded">
              需重启
            </span>
          )}
          {field.sensitive && (
            <span className="text-[11px] text-ink-muted">敏感</span>
          )}
        </label>
        <Input
          type={field.type || "text"}
          value={displayValue}
          onChange={(e) => handleFieldChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className={fieldError ? "border-error focus-visible:border-error focus-visible:ring-error/15" : ""}
        />
        {field.hint && !fieldError && (
          <p className="text-[12px] text-ink-soft">{field.hint}</p>
        )}
        {fieldError && (
          <p className="text-[12px] text-error">{fieldError}</p>
        )}
      </div>
    );
  };

  const sectionKeys = Object.keys(SECTIONS) as SectionKey[];

  return (
    <div className="flex flex-col gap-6">
      {/* Section tabs */}
      <div className="flex gap-1 border-b border-hairline pb-0 overflow-x-auto">
        {sectionKeys.map((key) => (
          <button
            key={key}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
              activeSection === key
                ? "text-primary border-primary bg-primary/5"
                : "text-ink-muted border-transparent hover:text-ink hover:bg-canvas-soft"
            }`}
            onClick={() => setActiveSection(key)}
          >
            {SECTION_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Active section content */}
      <div className="bg-canvas-card rounded-xl p-6 border border-hairline">
        <p className="text-sm text-ink-muted mb-5">{SECTIONS[activeSection].description}</p>
        <div className="flex flex-col gap-5 max-w-lg">
          {SECTIONS[activeSection].fields.map(renderField)}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "保存中..." : "保存设置"}
        </Button>
        {saveMutation.isError && (
          <p className="text-sm text-error">保存失败，请重试</p>
        )}
      </div>
    </div>
  );
}
