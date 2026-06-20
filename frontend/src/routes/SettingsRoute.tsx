import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useSettings, useSaveSettings } from "@/hooks/useApi";
import type { SettingsData } from "@/types/api";

type SectionKey = "azure" | "query" | "ai" | "notify" | "security" | "provider";

const SECTION_LABELS: Record<SectionKey, string> = {
  azure: "Azure DevOps",
  query: "Query Settings",
  ai: "AI Fixes",
  notify: "Notifications",
  security: "Security",
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
    description: "Connection credentials for Azure DevOps. Requires restart after changes.",
    fields: [
      { key: "azure_devops_org", label: "Organization (ORG)", placeholder: "mycompany", restartNote: true },
      { key: "azure_devops_project", label: "Project", placeholder: "MyProject", restartNote: true },
      { key: "azure_devops_team", label: "Team", placeholder: "Leave empty for auto-discovery", restartNote: true },
      { key: "azure_devops_pat", label: "Personal Access Token", placeholder: "PAT", type: "password", sensitive: true, restartNote: true },
    ],
  },
  query: {
    description: "Sprint query strategy and refresh frequency. Applies immediately.",
    fields: [
      { key: "query_states", label: "Query States", placeholder: "To Do,In Progress,Active,New,Committed", hint: "Comma-separated" },
      { key: "check_interval_minutes", label: "Refresh Interval (min)", placeholder: "30", type: "number", hint: "Minimum 1 minute" },
    ],
  },
  ai: {
    description: "AI auto-fix parameters. Applies immediately.",
    fields: [
      { key: "work_dir", label: "Code Repository Directory", placeholder: "/path/to/code/repo", hint: "Git repository path" },
      { key: "ai_fix_timeout_seconds", label: "AI Fix Timeout (sec)", placeholder: "300", type: "number", hint: "Default 300s (5 min)" },
      { key: "target_branch", label: "Target Branch", placeholder: "develop", hint: "PR merge target branch" },
    ],
  },
  notify: {
    description: "Change notification channels. Applies immediately.",
    fields: [
      { key: "notify_desktop", label: "Desktop Notifications", placeholder: "true/false", hint: "true or false" },
      { key: "notify_webhook_url", label: "Webhook URL (Sprint changes)", placeholder: "https://hooks.slack.com/services/xxx", hint: "Sent on sprint changes" },
      { key: "notify_pr_webhook_url", label: "PR Webhook URL (separate)", placeholder: "https://hooks.slack.com/services/xxx", hint: "Leave empty to reuse above" },
    ],
  },
  security: {
    description: "Web access authentication. Applies immediately.",
    fields: [
      { key: "web_access_token", label: "Web Access Token", placeholder: "Leave empty to disable auth", type: "password", sensitive: true, hint: "Enables Bearer Token auth on API" },
      { key: "log_dir", label: "Log Directory", placeholder: "Default: logs/", hint: "Log file location" },
    ],
  },
  provider: {
    description: "AI Provider configuration for AI Fixes. Applies immediately.",
    fields: [
      { key: "ai_provider", label: "AI Agent", placeholder: "auto / pi / claude / opencode / codex", hint: "auto = detect available agent" },
      { key: "ai_model", label: "AI Model", placeholder: "claude-sonnet-4-20250514 / gpt-4o", hint: "Model name" },
      { key: "ai_api_base_url", label: "Custom API Base URL", placeholder: "https://api.openai.com/v1", hint: "Proxy or private deployment URL" },
      { key: "ai_api_key", label: "AI API Key", placeholder: "sk-...", type: "password", sensitive: true, hint: "OpenAI / Anthropic / Azure OpenAI" },
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
  const [activeAccordion, setActiveAccordion] = useState<string>("azure");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings && !form) {
      setForm({ ...settings });
    }
  }, [settings, form]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-ink-muted text-sm">Loading settings...</div>;
  }

  if (error || !settings) {
    return <div className="flex items-center justify-center py-24 text-error text-sm">Unable to load settings. Check that the backend is running.</div>;
  }

  if (!form) return null;

  const handleFieldChange = (key: keyof SettingsData, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    const fieldDef = getAllFields().find((f) => f.key === key);
    if (fieldDef?.sensitive) {
      setEditedSensitive((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  };

  const getAllFields = (): FieldDef[] => Object.values(SECTIONS).flatMap((s) => s.fields);

  const handleSave = async () => {
    if (!form) return;
    setErrors({});

    const newErrors: Record<string, string> = {};
    const org = form.azure_devops_org.trim();
    const project = form.azure_devops_project.trim();
    const pat = form.azure_devops_pat.trim();

    if (!org) newErrors.azure_devops_org = "Organization is required";
    if (!project) newErrors.azure_devops_project = "Project is required";

    if (!editedSensitive.has("azure_devops_pat") && isMaskedValue(pat)) {
      form.azure_devops_pat = settings.azure_devops_pat;
    } else if (!pat) {
      newErrors.azure_devops_pat = "PAT is required";
    }

    const interval = parseInt(form.check_interval_minutes, 10);
    if (isNaN(interval) || interval < 1) {
      newErrors.check_interval_minutes = "Must be a positive integer (>= 1)";
    }

    const timeout = parseInt(form.ai_fix_timeout_seconds, 10);
    if (isNaN(timeout) || timeout < 1) {
      newErrors.ai_fix_timeout_seconds = "Must be a positive integer (>= 1)";
    }

    const webhook = form.notify_webhook_url.trim();
    if (webhook && !webhook.startsWith("http://") && !webhook.startsWith("https://")) {
      newErrors.notify_webhook_url = "Must start with http:// or https://";
    }

    const prWebhook = form.notify_pr_webhook_url.trim();
    if (prWebhook && !prWebhook.startsWith("http://") && !prWebhook.startsWith("https://")) {
      newErrors.notify_pr_webhook_url = "Must start with http:// or https://";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Expand the first accordion with errors
      for (const key of Object.keys(newErrors)) {
        for (const [section, def] of Object.entries(SECTIONS)) {
          if (def.fields.some((f) => f.key === key)) {
            setActiveAccordion(section);
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
        toast.success("Settings saved");
        if (result.config) setForm({ ...result.config });
        const patChanged = editedSensitive.has("azure_devops_pat");
        const azureRestartFields = SECTIONS.azure.fields.filter(f => f.restartNote && f.key !== "azure_devops_pat");
        const azureChanged = azureRestartFields.some(f => form[f.key] !== settings[f.key]);
        if (patChanged || azureChanged) {
          toast.warning("Azure DevOps connection settings changed. Restart required.");
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
        toast.error("Validation failed");
      } else {
        toast.error(result.error || "Save failed");
      }
    } catch {
      toast.error("Save request failed");
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
      <div key={field.key} className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink flex items-center gap-2">
          {field.label}
          {field.restartNote && (
            <span className="text-[10px] text-accent-amber bg-accent-amber/10 px-1 py-0.5 rounded">Restart required</span>
          )}
          {field.sensitive && <span className="text-[10px] text-ink-muted">Sensitive</span>}
        </label>
        <Input
          type={field.type || "text"}
          value={displayValue}
          onChange={(e) => handleFieldChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className={`text-xs h-8 ${fieldError ? "border-error focus-visible:border-error focus-visible:ring-error/15" : ""}`}
        />
        {field.hint && !fieldError && <p className="text-[11px] text-ink-soft">{field.hint}</p>}
        {fieldError && <p className="text-[11px] text-error">{fieldError}</p>}
      </div>
    );
  };

  const sectionKeys = Object.keys(SECTIONS) as SectionKey[];

  return (
    <div className="max-w-2xl">
      <Accordion type="single" value={activeAccordion} onValueChange={setActiveAccordion}>
        {sectionKeys.map((key) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger>
              <span>{SECTION_LABELS[key]}</span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-ink-muted mb-4">{SECTIONS[key].description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SECTIONS[key].fields.map(renderField)}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
        {saveMutation.isError && <p className="text-xs text-error">Save failed, please retry</p>}
      </div>
    </div>
  );
}
