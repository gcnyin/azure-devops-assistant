import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useSettings, useSaveSettings } from "@/hooks/useApi";
import type { SettingsData } from "@/types/api";

type SectionKey = "azure" | "query" | "ai" | "notify" | "security" | "provider";
const SECTION_LABELS: Record<SectionKey, string> = {
  azure: "Azure DevOps", query: "Query Settings", ai: "AI Fixes", notify: "Notifications", security: "Security", provider: "AI Provider",
};

interface FieldDef { key: keyof SettingsData; label: string; placeholder?: string; type?: string; hint?: string; sensitive?: boolean; restartNote?: boolean; }

const SECTIONS: Record<SectionKey, { description: string; fields: FieldDef[] }> = {
  azure: { description: "Connection credentials for Azure DevOps. Requires restart after changes.", fields: [
    { key: "azure_devops_org", label: "Organization (ORG)", placeholder: "mycompany", restartNote: true },
    { key: "azure_devops_project", label: "Project", placeholder: "MyProject", restartNote: true },
    { key: "azure_devops_team", label: "Team", placeholder: "Leave empty for auto-discovery", restartNote: true },
    { key: "azure_devops_pat", label: "Personal Access Token", placeholder: "PAT", type: "password", sensitive: true, restartNote: true },
  ]},
  query: { description: "Sprint query strategy and refresh frequency. Applies immediately.", fields: [
    { key: "query_states", label: "Query States", placeholder: "To Do,In Progress,Active,New,Committed", hint: "Comma-separated" },
    { key: "check_interval_minutes", label: "Refresh Interval (min)", placeholder: "30", type: "number", hint: "Minimum 1 minute" },
  ]},
  ai: { description: "AI auto-fix parameters. Applies immediately.", fields: [
    { key: "work_dir", label: "Code Repository Directory", placeholder: "/path/to/code/repo", hint: "Git repository path" },
    { key: "ai_fix_timeout_seconds", label: "AI Fix Timeout (sec)", placeholder: "300", type: "number", hint: "Default 300s (5 min)" },
    { key: "target_branch", label: "Target Branch", placeholder: "develop", hint: "PR merge target branch" },
  ]},
  notify: { description: "Change notification channels. Applies immediately.", fields: [
    { key: "notify_desktop", label: "Desktop Notifications", placeholder: "true/false", hint: "true or false" },
    { key: "notify_webhook_url", label: "Webhook URL (Sprint changes)", placeholder: "https://hooks.slack.com/services/xxx" },
    { key: "notify_pr_webhook_url", label: "PR Webhook URL (separate)", placeholder: "https://hooks.slack.com/services/xxx", hint: "Leave empty to reuse above" },
  ]},
  security: { description: "Web access authentication. Applies immediately.", fields: [
    { key: "web_access_token", label: "Web Access Token", placeholder: "Leave empty to disable auth", type: "password", sensitive: true, hint: "Enables Bearer Token auth" },
    { key: "log_dir", label: "Log Directory", placeholder: "Default: logs/", hint: "Log file location" },
  ]},
  provider: { description: "AI Agent used for auto-fix. Applies immediately.", fields: [
    { key: "ai_provider", label: "AI Agent", placeholder: "auto / pi / claude / opencode / codex", hint: "auto = detect available agent" },
  ]},
};

function isMaskedValue(v: string): boolean { return v.includes("*") && v.length > 4; }

export default function SettingsRoute() {
  const { data: settings, isLoading, error } = useSettings();
  const saveMutation = useSaveSettings();
  const [form, setForm] = useState<SettingsData | null>(null);
  const [editedSensitive, setEditedSensitive] = useState<Set<string>>(new Set());
  const [activeAccordion, setActiveAccordion] = useState<string>("azure");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (settings && !form) setForm({ ...settings }); }, [settings, form]);
  if (isLoading) return <div className="flex items-center justify-center py-24 text-ink-muted text-[14px]">Loading settings...</div>;
  if (error || !settings) return <div className="flex items-center justify-center py-24 text-error text-[14px]">Unable to load settings.</div>;
  if (!form) return null;

  const handleFieldChange = (key: keyof SettingsData, value: string) => {
    setForm(prev => prev ? { ...prev, [key]: value } : prev);
    const fd = Object.values(SECTIONS).flatMap(s => s.fields).find(f => f.key === key);
    if (fd?.sensitive) setEditedSensitive(prev => { const n = new Set(prev); n.add(key); return n; });
  };

  const handleSave = async () => {
    if (!form) return; setErrors({});
    const newErrors: Record<string, string> = {};
    const org = form.azure_devops_org.trim(), project = form.azure_devops_project.trim(), pat = form.azure_devops_pat.trim();
    if (!org) newErrors.azure_devops_org = "Organization is required";
    if (!project) newErrors.azure_devops_project = "Project is required";
    if (!editedSensitive.has("azure_devops_pat") && isMaskedValue(pat)) form.azure_devops_pat = settings.azure_devops_pat;
    else if (!pat) newErrors.azure_devops_pat = "PAT is required";
    const interval = parseInt(form.check_interval_minutes, 10);
    if (isNaN(interval) || interval < 1) newErrors.check_interval_minutes = "Must be a positive integer (>= 1)";
    const timeout = parseInt(form.ai_fix_timeout_seconds, 10);
    if (isNaN(timeout) || timeout < 1) newErrors.ai_fix_timeout_seconds = "Must be a positive integer (>= 1)";
    const wh = form.notify_webhook_url.trim();
    if (wh && !wh.startsWith("http://") && !wh.startsWith("https://")) newErrors.notify_webhook_url = "Must start with http:// or https://";
    const pwh = form.notify_pr_webhook_url.trim();
    if (pwh && !pwh.startsWith("http://") && !pwh.startsWith("https://")) newErrors.notify_pr_webhook_url = "Must start with http:// or https://";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      for (const key of Object.keys(newErrors))
        for (const [section, def] of Object.entries(SECTIONS))
          if (def.fields.some(f => f.key === key)) { setActiveAccordion(section); break; }
      return;
    }
    try {
      const result = await saveMutation.mutateAsync(form);
      if (result.ok) {
        toast.success("Settings saved"); if (result.config) setForm({ ...result.config });
        const patChanged = editedSensitive.has("azure_devops_pat");
        const azureChanged = SECTIONS.azure.fields.filter(f=>f.restartNote&&f.key!=="azure_devops_pat").some(f=>form[f.key]!==settings[f.key]);
        if (patChanged||azureChanged) toast.warning("Azure DevOps settings changed. Restart required.");
        setEditedSensitive(new Set()); setErrors({});
      } else if (result.errors) {
        const mapped: Record<string,string> = {};
        for (const err of result.errors) { const [field, ...rest] = err.split(": "); mapped[field] = rest.join(": ") || err; }
        setErrors(mapped); toast.error("Validation failed");
      } else toast.error(result.error || "Save failed");
    } catch { toast.error("Save request failed"); }
  };

  const renderField = (field: FieldDef) => {
    const val = form[field.key] ?? "", isSensitive = field.sensitive ?? false;
    const isEditingSensitive = editedSensitive.has(field.key), fieldError = errors[field.key];
    let display = val;
    if (isSensitive && !isEditingSensitive && isMaskedValue(val)) display = val;
    return (
      <div key={field.key} className="flex flex-col gap-1">
        <label className="text-[13px] font-medium text-ink flex items-center gap-2">
          {field.label}
          {field.restartNote && <span className="text-[10px] text-accent-amber bg-accent-amber/10 px-1 py-0.5 rounded-full">Restart required</span>}
          {field.sensitive && <span className="text-[10px] text-ink-muted">Sensitive</span>}
        </label>
        <Input type={field.type||"text"} value={display} onChange={e=>handleFieldChange(field.key, e.target.value)}
          placeholder={field.placeholder} className={`text-[13px] h-8 ${fieldError?"border-error focus-visible:border-error focus-visible:ring-error/15":""}`} />
        {field.hint && !fieldError && <p className="text-[11px] text-ink-soft">{field.hint}</p>}
        {fieldError && <p className="text-[11px] text-error">{fieldError}</p>}
      </div>
    );
  };

  const sectionKeys = Object.keys(SECTIONS) as SectionKey[];

  return (
    <div className="max-w-2xl">
      <Accordion type="single" value={activeAccordion} onValueChange={setActiveAccordion}>
        {sectionKeys.map(key => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger><span className="text-[14px] font-medium">{SECTION_LABELS[key]}</span></AccordionTrigger>
            <AccordionContent>
              <p className="text-[13px] text-ink-muted mb-4">{SECTIONS[key].description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{SECTIONS[key].fields.map(renderField)}</div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">{saveMutation.isPending?"Saving...":"Save Settings"}</Button>
        {saveMutation.isError && <p className="text-[13px] text-error">Save failed, please retry</p>}
      </div>
    </div>
  );
}
