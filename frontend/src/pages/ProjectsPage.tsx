import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2, FolderKanban } from 'lucide-react';
import { projectApi } from '@/lib/api';
import { PROJECTS_LAST_PATH_KEY, usePersistedState } from '@/hooks/usePersistedState';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = usePersistedState('projects-page', 1);
  const [, setLastProjectsPath] = usePersistedState(PROJECTS_LAST_PATH_KEY, '/projects');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', page],
    queryFn: () => projectApi.list(page).then((r) => r.data.data),
  });

  useEffect(() => {
    setLastProjectsPath('/projects');
  }, [setLastProjectsPath]);

  const createMutation = useMutation({
    mutationFn: () => projectApi.create({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-gray-500">Manage your testing projects</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {showCreate && (
        <div className="card">
          <h3 className="mb-4 font-semibold">Create Project</h3>
          <div className="space-y-3">
            <input className="input" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="input" placeholder="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={!name}>Create</button>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.data?.map((project: { _id: string; name: string; description: string; createdAt: string }) => (
            <div key={project._id} className="card group relative">
              <Link to={`/projects/${project._id}`}>
                <div className="flex items-start gap-3">
                  <FolderKanban className="h-8 w-8 text-brand-600" />
                  <div>
                    <h3 className="font-semibold">{project.name}</h3>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{project.description || 'No description'}</p>
                    <p className="mt-2 text-xs text-gray-400">{new Date(project.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </Link>
              <button
                className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                onClick={() => deleteMutation.mutate(project._id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="flex items-center px-4 text-sm">Page {page} of {data.totalPages}</span>
          <button className="btn-secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
