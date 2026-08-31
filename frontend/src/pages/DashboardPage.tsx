import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, FlaskConical, Play, CheckCircle, XCircle, Clock } from 'lucide-react';
import { projectApi, analyticsApi, executionApi } from '@/lib/api';

export default function DashboardPage() {
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 5).then((r) => r.data.data),
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => analyticsApi.get().then((r) => r.data.data),
  });

  const { data: executions } = useQuery({
    queryKey: ['recent-executions'],
    queryFn: () => executionApi.list(undefined, 1).then((r) => r.data.data),
  });

  const stats = [
    { label: 'Total Executions', value: analytics?.totalExecutions ?? 0, icon: Play, color: 'text-brand-600' },
    { label: 'Passed', value: analytics?.passedExecutions ?? 0, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Failed', value: analytics?.failedExecutions ?? 0, icon: XCircle, color: 'text-red-600' },
    { label: 'Success Rate', value: `${analytics?.successRate ?? 0}%`, icon: Clock, color: 'text-yellow-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500">Overview of your testing platform</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`rounded-lg bg-gray-100 p-3 dark:bg-gray-800 ${color}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Link to="/projects" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          {projects?.data?.length ? (
            <div className="space-y-3">
              {projects.data.map((p: { _id: string; name: string; description: string }) => (
                <Link key={p._id} to={`/projects/${p._id}`} className="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <FolderKanban className="h-5 w-5 text-brand-600" />
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-gray-500 truncate">{p.description || 'No description'}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No projects yet. <Link to="/projects" className="text-brand-600">Create one</Link></p>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Executions</h2>
            <Link to="/executions" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          {executions?.data?.length ? (
            <div className="space-y-3">
              {executions.data.slice(0, 5).map((e: { _id: string; status: string; progress: number; createdAt: string }) => (
                <Link key={e._id} to={`/executions/${e._id}`} className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <FlaskConical className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-mono">{e._id.slice(-8)}</span>
                  </div>
                  <span className={e.status === 'passed' ? 'badge-success' : e.status === 'failed' ? 'badge-error' : 'badge-info'}>
                    {e.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No executions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
