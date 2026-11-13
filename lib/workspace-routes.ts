export const workspaceRoutes = [
  { view: 'Overview', path: 'overview' },
  { view: 'AI planning', path: 'ai-planning' },
  { view: 'Invites', path: 'invites' },
  { view: 'My tasks', path: 'my-tasks' },
  { view: 'Milestones', path: 'milestones' },
  { view: 'Availability', path: 'availability' },
  { view: 'Files', path: 'files' },
  { view: 'Team', path: 'team' },
] as const;

export type WorkspaceView = (typeof workspaceRoutes)[number]['view'];
export type WorkspacePath = (typeof workspaceRoutes)[number]['path'];

export const workspacePathByView = Object.fromEntries(
  workspaceRoutes.map(({ view, path }) => [view, path]),
) as Record<WorkspaceView, WorkspacePath>;

export const workspaceViewByPath = {
  ...Object.fromEntries(workspaceRoutes.map(({ view, path }) => [path, view])),
  // Older bookmarks and links still open AI planning.
  'assignment-chat': 'AI planning',
} as Record<string, WorkspaceView>;

export function isWorkspacePath(path: string): path is WorkspacePath | 'assignment-chat' {
  return path in workspaceViewByPath;
}
