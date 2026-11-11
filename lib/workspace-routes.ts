export const workspaceRoutes = [
  { view: 'Overview', path: 'overview' },
  { view: 'Assignment chat', path: 'assignment-chat' },
  { view: 'My tasks', path: 'my-tasks' },
  { view: 'Milestones', path: 'milestones' },
  { view: 'Availability', path: 'availability' },
  { view: 'Files', path: 'files' },
  { view: 'Team', path: 'team' },
  { view: 'Project settings', path: 'project-settings' },
] as const;

export type WorkspaceView = (typeof workspaceRoutes)[number]['view'];
export type WorkspacePath = (typeof workspaceRoutes)[number]['path'];

export const workspacePathByView = Object.fromEntries(
  workspaceRoutes.map(({ view, path }) => [view, path]),
) as Record<WorkspaceView, WorkspacePath>;

export const workspaceViewByPath = Object.fromEntries(
  workspaceRoutes.map(({ view, path }) => [path, view]),
) as Record<WorkspacePath, WorkspaceView>;

export function isWorkspacePath(path: string): path is WorkspacePath {
  return workspaceRoutes.some((route) => route.path === path);
}
