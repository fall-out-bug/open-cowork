---
name: projects
description: Project management for organizing chat sessions. Use when the user wants to create projects, organize sessions into projects, filter sessions by project, or manage project metadata. Triggers on: "project", "organize chats", "create project", "delete project", "assign to project", "filter by project", "project color".
---

# Project Management

This skill provides the agent with capabilities to manage projects for organizing chat sessions.

## Capabilities

1. **Create projects** - Create new projects with name, color, and optional description
2. **Edit projects** - Update project name, color, or description
3. **Delete projects** - Remove projects (sessions become unassigned)
4. **Assign sessions** - Move sessions between projects
5. **Filter sessions** - Show only sessions from a specific project
6. **List projects** - Show all projects with session counts

## When to Use This Skill

Use this skill when the user:
- Mentions "project" or "projects"
- Wants to organize or group chats/sessions
- Asks to create, edit, or delete a project
- Wants to filter sessions by category
- Mentions colors or labels for organization

## Workflow

### 1. List Projects

Check current projects from the store state:
- `projects` - array of `Project` objects
- Each project has: `id`, `name`, `color`, `description`, `createdAt`, `updatedAt`

### 2. Create Project

Use IPC event `project.create` with `{ name, color?, description? }`:
- `name` is required (1-100 characters)
- `color` is optional (hex string, e.g., "#3B82F6")
- `description` is optional
- Returns the created `Project` object

### 3. Update Project

Use IPC event `project.update` with `{ id, name?, color?, description? }`:
- Only provided fields are updated
- Returns the updated `Project` object

### 4. Delete Project

Use IPC event `project.delete` with `{ id }`:
- All sessions in this project become unassigned (projectId = null)
- Returns `{ success: true }`

### 5. Assign Session to Project

Use IPC event `project.assignSession` with `{ sessionId, projectId }`:
- `projectId` can be a project ID or `null` to unassign
- Session is moved to the specified project

### 6. Filter Sessions by Project

In the UI, the sidebar shows:
- "All Sessions" - shows all sessions
- Each project - shows only sessions with matching `projectId`
- Active filter is stored in the sidebar state

## Data Structure

```typescript
interface Project {
  id: string;
  name: string;
  color: string;        // Hex color code
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface Session {
  id: string;
  title: string;
  projectId: string | null;  // null = unassigned
  // ... other fields
}
```

## Error Handling

- **Duplicate name**: Suggest a different name or append a number
- **Invalid color**: Use a default color or ask for a valid hex code
- **Project not found**: Check if the project was deleted
- **Session not found**: Verify the session ID is correct

## Best Practices

- Suggest meaningful project names based on user's work
- Use distinct colors for easy visual identification
- Keep project names concise (under 30 characters for sidebar)
- When deleting, warn that sessions will become unassigned
- Encourage organizing sessions as they are created
