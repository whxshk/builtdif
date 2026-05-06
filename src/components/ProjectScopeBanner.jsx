import { useActiveProject } from '@/lib/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, Globe } from 'lucide-react';

export default function ProjectScopeBanner({ className = '' }) {
  const { activeProject } = useActiveProject();

  if (activeProject) {
    return (
      <Badge variant="outline" className={`gap-1.5 border-primary/30 bg-primary/5 text-primary font-medium ${className}`}>
        <FolderKanban className="w-3 h-3" />
        Project: {activeProject.project_name}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`gap-1.5 text-muted-foreground ${className}`}>
      <Globe className="w-3 h-3" /> Global view
    </Badge>
  );
}