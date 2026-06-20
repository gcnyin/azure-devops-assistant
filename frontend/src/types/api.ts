export interface WorkItem {
  id: number;
  title: string;
  state: string;
  type: string;
  assignedTo: string;
  description: string;
  htmlUrl?: string;
  _state_changed?: boolean;
  _prev_state?: string;
  createdDate?: string;
  changedDate?: string;
  fix_status?: string | null;
  fix_created_at?: string | null;
  fix_started_at?: string | null;
}

export interface Iteration {
  id: string;
  name: string;
  path: string;
  startDate: string;
  finishDate: string;
}

export interface DiffInfo {
  prev_time: string;
  new_items: WorkItem[];
  continuing_items: WorkItem[];
  gone_items: WorkItem[];
}

export interface BoardData {
  iteration: Iteration;
  items: WorkItem[];
  diff_info: DiffInfo | null;
  last_update: string;
  assigned_to: string;
  team_name: string;
  project: string;
  offline: boolean;
  error: string;
  view_mode: "all" | "me";
}

export interface FixRepoResult {
  path: string;
  commit_sha?: string;
  files_modified?: string[];
  branch?: string;
  pr_url?: string | null;
  repo_name?: string;
  push_error?: string;
  pr_error?: string;
}

export interface FixItem {
  id: number;
  bug_id: number;
  bug_title: string;
  work_item_type: string;
  sprint_name: string;
  status: string;
  agent_name: string | null;
  prompt: string | null;
  response: string | null;
  error: string | null;
  repo_results: FixRepoResult[] | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SnapshotItem {
  id: number;
  sprint_name: string;
  fetched_at: string;
  item_count: number;
  team_name: string;
}

export interface SnapshotDetail {
  meta: {
    id: number;
    sprint_name: string;
    fetched_at: string;
    team_name: string;
    item_count: number;
  };
  items: WorkItem[];
}

export interface DiffSnapshotData {
  snapshot_a: {
    id: number;
    sprint_name: string;
    fetched_at: string;
  };
  snapshot_b: {
    id: number;
    sprint_name: string;
    fetched_at: string;
  };
  diff: DiffInfo;
}

export interface AppConfig {
  incomplete_states: string[];
  state_colors: Record<string, string>;
}

export interface SprintSummary {
  sprint_name: string;
  team_name: string;
  snapshot_count: number;
}

export interface SprintsResponse {
  sprints: SprintSummary[];
  current_sprint: string;
}

export type DiffFilterType = "new" | "changed" | "gone";

export type KanbanSortKey =
  | "default"
  | "id-asc" | "id-desc"
  | "title-asc" | "title-desc"
  | "type-asc" | "type-desc"
  | "state-asc" | "state-desc"
  | "created-asc" | "created-desc"
  | "assignee-asc" | "assignee-desc";

export const KANBAN_SORT_OPTIONS: { key: KanbanSortKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "id-asc", label: "ID ↑" },
  { key: "id-desc", label: "ID ↓" },
  { key: "title-asc", label: "Title A-Z" },
  { key: "title-desc", label: "Title Z-A" },
  { key: "type-asc", label: "Type A-Z" },
  { key: "type-desc", label: "Type Z-A" },
  { key: "state-asc", label: "State A-Z" },
  { key: "state-desc", label: "State Z-A" },
  { key: "created-asc", label: "Created ↑" },
  { key: "created-desc", label: "Created ↓" },
  { key: "assignee-asc", label: "Assignee A-Z" },
  { key: "assignee-desc", label: "Assignee Z-A" },
];

export interface SettingsData {
  azure_devops_org: string;
  azure_devops_project: string;
  azure_devops_team: string;
  azure_devops_pat: string;
  query_states: string;
  check_interval_minutes: string;
  work_dir: string;
  ai_fix_timeout_seconds: string;
  target_branch: string;
  notify_desktop: string;
  notify_webhook_url: string;
  notify_pr_webhook_url: string;
  web_access_token: string;
  ai_provider: string;
}

export interface AgentInfo {
  name: string;
  available: boolean;
  description: string;
}

export interface AgentsResponse {
  agents: AgentInfo[];
  error?: string;
}

export interface SaveSettingsResult {
  ok: boolean;
  config?: SettingsData;
  errors?: string[];
  error?: string;
}
