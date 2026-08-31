import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Globe, Trash2, ArrowLeft } from 'lucide-react';
import { projectApi, websiteApi } from '@/lib/api';
import { PROJECTS_LAST_PATH_KEY, usePersistedState } from '@/hooks/usePersistedState';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [, setLastProjectsPath] = usePersistedState(PROJECTS_LAST_PATH_KEY, '/projects');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectApi.get(id!).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: websites } = useQuery({
    queryKey: ['websites', id],
    queryFn: () => websiteApi.list(id!).then((r) => r.data.data),
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: () => websiteApi.create({ projectId: id!, name, url, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites', id] });
      setShowCreate(false);
      setName(''); setUrl(''); setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (websiteId: string) => websiteApi.delete(websiteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['websites', id] }),
  });

  useEffect(() => {
    if (id) setLastProjectsPath(`/projects/${id}`);
  }, [id, setLastProjectsPath]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link
          to="/projects"
          className="mt-1 text-gray-500 hover:text-gray-700"
          onClick={() => setLastProjectsPath('/projects')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{project?.name}</h1>
          <p className="text-gray-500">{project?.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Websites</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add Website
        </button>
      </div>

      {showCreate && (
        <div className="card space-y-3">
          <input className="input" placeholder="Website name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <textarea className="input" placeholder="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={!name || !url}>Add</button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {websites?.map((w: { _id: string; name: string; url: string; description?: string }) => (
          <div key={w._id} className="card group relative">
            <div className="flex items-start gap-3">
              <Globe className="h-6 w-6 text-brand-600" />
              <div>
                <h3 className="font-semibold">{w.name}</h3>
                <a href={w.url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:underline">{w.url}</a>
                {w.description && <p className="mt-1 text-sm text-gray-500">{w.description}</p>}
              </div>
            </div>
            <button className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 text-red-500" onClick={() => deleteMutation.mutate(w._id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!websites?.length && <p className="text-sm text-gray-500">No websites added yet.</p>}
      </div>
    </div>
  );
}
