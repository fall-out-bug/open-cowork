/**
 * @module main/projects/project-manager
 *
 * Project management for organizing sessions into groups.
 *
 * Responsibilities:
 * - CRUD operations for projects
 * - Assign sessions to projects
 * - Emit state changes to renderer
 */
import type { DatabaseInstance } from '../db/database';
import type { Project, ServerEvent } from '../../renderer/types';
import { log, logError } from '../utils/logger';

export class ProjectManager {
  private db: DatabaseInstance;
  private sendToRenderer: (event: ServerEvent) => void;

  constructor(db: DatabaseInstance, sendToRenderer: (event: ServerEvent) => void) {
    this.db = db;
    this.sendToRenderer = sendToRenderer;
    log('[ProjectManager] Initialized');
  }

  createProject(name: string, description?: string, color?: string): Project {
    const now = Date.now();
    const project: Project = {
      id: `project-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      color,
      createdAt: now,
      updatedAt: now,
    };

    this.db.projects.create({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      color: project.color ?? null,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    });

    this.sendToRenderer({
      type: 'project.list',
      payload: { projects: this.listProjects() },
    });

    log('[ProjectManager] Created project:', project.id, project.name);
    return project;
  }

  updateProject(projectId: string, updates: Partial<Project>): Project | null {
    const existing = this.db.projects.get(projectId);
    if (!existing) {
      logError('[ProjectManager] Project not found:', projectId);
      return null;
    }

    this.db.projects.update(projectId, {
      name: updates.name ?? undefined,
      description: updates.description ?? undefined,
      color: updates.color ?? undefined,
    });

    const updated = this.db.projects.get(projectId);
    if (!updated) return null;

    const project = this.rowToProject(updated);

    this.sendToRenderer({
      type: 'project.update',
      payload: { projectId, updates: project },
    });

    log('[ProjectManager] Updated project:', projectId);
    return project;
  }

  deleteProject(projectId: string): boolean {
    const existing = this.db.projects.get(projectId);
    if (!existing) {
      logError('[ProjectManager] Project not found:', projectId);
      return false;
    }

    this.db.projects.delete(projectId);

    this.sendToRenderer({
      type: 'project.delete',
      payload: { projectId },
    });

    log('[ProjectManager] Deleted project:', projectId);
    return true;
  }

  listProjects(): Project[] {
    const rows = this.db.projects.getAll();
    return rows.map((row) => this.rowToProject(row));
  }

  assignSessionToProject(sessionId: string, projectId: string | null): boolean {
    this.db.sessions.update(sessionId, {
      project_id: projectId,
    });

    log('[ProjectManager] Assigned session', sessionId, 'to project', projectId);
    return true;
  }

  private rowToProject(row: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    created_at: number;
    updated_at: number;
  }): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      color: row.color ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
