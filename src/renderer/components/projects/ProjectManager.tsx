import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { useIPC } from '../../hooks/useIPC';
import {
  Folder,
  Plus,
  MoreVertical,
  Edit3,
  Trash2,
  X,
  Check,
  FolderOpen,
} from 'lucide-react';
import type { Project } from '../../types';

const PROJECT_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

export function ProjectManager() {
  const { t } = useTranslation();
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const sessions = useAppStore((s) => s.sessions);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const { invoke } = useIPC();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [editName, setEditName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const sessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of sessions) {
      if (session.projectId) {
        counts[session.projectId] = (counts[session.projectId] || 0) + 1;
      }
    }
    return counts;
  }, [sessions]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;

    await invoke<Project>({
      type: 'project.create',
      payload: {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        color: newColor,
      },
    });

    setNewName('');
    setNewDescription('');
    setNewColor(PROJECT_COLORS[0]);
    setShowCreate(false);
  }, [newName, newDescription, newColor, invoke]);

  const handleUpdate = useCallback(
    async (projectId: string) => {
      if (!editName.trim()) return;

      await invoke<Project>({
        type: 'project.update',
        payload: {
          projectId,
          updates: { name: editName.trim() },
        },
      });

      setEditingId(null);
      setEditName('');
    },
    [editName, invoke]
  );

  const handleDelete = useCallback(
    async (projectId: string) => {
      await invoke<boolean>({
        type: 'project.delete',
        payload: { projectId },
      });

      setMenuOpenId(null);
    },
    [invoke]
  );

  const startEdit = useCallback((project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setMenuOpenId(null);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('projects.title')}
        </h3>
        <button
          onClick={() => setShowCreate(true)}
          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
          title={t('projects.newProject')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border-subtle bg-background/60 p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('projects.projectNamePlaceholder')}
            className="w-full rounded-lg border border-transparent bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border transition-colors"
            autoFocus
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t('projects.projectDescriptionPlaceholder')}
            className="w-full rounded-lg border border-transparent bg-surface px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border transition-colors"
          />
          <div className="flex items-center gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewColor(color)}
                className={`w-5 h-5 rounded-full transition-transform ${
                  newColor === color ? 'scale-110 ring-2 ring-offset-1 ring-text-primary' : ''
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              {t('projects.createProject')}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName('');
                setNewDescription('');
              }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {/* All chats */}
        <button
          onClick={() => setActiveProjectId(null)}
          className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
            activeProjectId === null
              ? 'bg-accent-muted/20 text-accent'
              : 'hover:bg-surface-hover/60 text-text-primary'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[13px] font-medium flex-1 truncate">
            {t('projects.allChats')}
          </span>
          <span className="text-[11px] text-text-muted">{sessions.length}</span>
        </button>

        {/* Project list */}
        {projects.map((project) => {
          const isActive = activeProjectId === project.id;
          const isEditing = editingId === project.id;
          const count = sessionCounts[project.id] || 0;

          return (
            <div
              key={project.id}
              className={`group relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                isActive
                  ? 'bg-accent-muted/20'
                  : 'hover:bg-surface-hover/60'
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: project.color || PROJECT_COLORS[0] }}
              />

              {isEditing ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[13px] text-text-primary focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(project.id);
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditName('');
                      }
                    }}
                  />
                  <button
                    onClick={() => handleUpdate(project.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-accent hover:bg-accent/10"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditName('');
                    }}
                    className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:bg-surface-hover"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setActiveProjectId(isActive ? null : project.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span
                      className={`text-[13px] font-medium truncate flex-1 ${
                        isActive ? 'text-accent' : 'text-text-primary'
                      }`}
                    >
                      {project.name}
                    </span>
                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {count}
                    </span>
                  </button>

                  <div className="relative">
                    <button
                      onClick={() =>
                        setMenuOpenId(menuOpenId === project.id ? null : project.id)
                      }
                      className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>

                    {menuOpenId === project.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setMenuOpenId(null)}
                        />
                        <div className="absolute right-0 top-6 z-50 w-36 rounded-xl border border-border-subtle bg-surface shadow-lg py-1">
                          <button
                            onClick={() => startEdit(project)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-hover transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            {t('projects.editProject')}
                          </button>
                          <button
                            onClick={() => handleDelete(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-error hover:bg-error/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('projects.deleteProject')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {projects.length === 0 && !showCreate && (
          <div className="px-3 py-4 text-center">
            <Folder className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-[12px] text-text-muted">
              {t('projects.noProjectsHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
