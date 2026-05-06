import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'outreachos.activeProjectId';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const qc = useQueryClient();
  const [activeProjectId, setActiveProjectIdState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => base44.entities.Project.list('-created_date', 200),
  });

  // If the stored ID no longer exists, clear it
  useEffect(() => {
    if (!activeProjectId || isLoading) return;
    if (!projects.some(p => p.id === activeProjectId)) {
      setActiveProjectIdState(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [activeProjectId, projects, isLoading]);

  const setActiveProjectId = useCallback((id) => {
    setActiveProjectIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
    // Invalidate everything so all scoped views refetch in the new context
    qc.invalidateQueries();
  }, [qc]);

  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) || null : null;

  return (
    <ProjectContext.Provider value={{
      activeProjectId,
      activeProject,
      setActiveProjectId,
      projects,
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useActiveProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useActiveProject must be used within ProjectProvider');
  return ctx;
}