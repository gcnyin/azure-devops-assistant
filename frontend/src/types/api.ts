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

export type DiffFilterType = "new" | "changed" | "gone";
