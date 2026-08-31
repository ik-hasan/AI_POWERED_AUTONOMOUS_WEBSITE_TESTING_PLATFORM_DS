import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Eye, Trash2 } from 'lucide-react';
import { reportApi } from '@/lib/api';
import { usePersistedState } from '@/hooks/usePersistedState';

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = usePersistedState('reports-page', 1);
  const [search, setSearch] = usePersistedState('reports-search', '');
  const [status, setStatus] = usePersistedState('reports-status', '');
  const [selectedReport, setSelectedReport] = usePersistedState<string | null>('reports-selected', null);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', page, search, status],
    queryFn: () => reportApi.list({ page, search: search || undefined, status: status || undefined }).then((r) => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      if (selectedReport === id) setSelectedReport(null);
    },
  });

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Delete report "${title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(id);
  };

  const { data: reportDetail } = useQuery({
    queryKey: ['report', selectedReport],
    queryFn: () => reportApi.get(selectedReport!).then((r) => r.data.data),
    enabled: !!selectedReport,
  });

  const handleDownload = async (id: string) => {
    const res = await reportApi.download(id);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${id}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-gray-500">Execution reports and step-wise logs</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className="input pl-10" placeholder="Search reports..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-800">
                  <th className="pb-3 text-left font-medium">Title</th>
                  <th className="pb-3 text-left font-medium">Status</th>
                  <th className="pb-3 text-left font-medium">Steps</th>
                  <th className="pb-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.data?.map((r: { _id: string; title: string; status: string; metrics: { passedSteps: number; totalSteps: number }; createdAt: string }) => (
                  <tr key={r._id} className="border-b dark:border-gray-800">
                    <td className="py-3">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</p>
                    </td>
                    <td className="py-3">
                      <span className={r.status === 'passed' ? 'badge-success' : 'badge-error'}>{r.status}</span>
                    </td>
                    <td className="py-3">{r.metrics.passedSteps}/{r.metrics.totalSteps}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button className="btn-secondary py-1 px-2" onClick={() => setSelectedReport(r._id)}>
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="btn-secondary py-1 px-2" onClick={() => handleDownload(r._id)}>
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="btn-danger py-1 px-2"
                          onClick={() => handleDelete(r._id, r.title)}
                          disabled={deleteMutation.isPending}
                          title="Delete report"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {data && data.totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="flex items-center px-4 text-sm">Page {page} of {data.totalPages}</span>
              <button className="btn-secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>

        {selectedReport && reportDetail && (
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">{reportDetail.title}</h2>
            {reportDetail.errorMessage && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20">{reportDetail.errorMessage}</div>
            )}
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {reportDetail.stepLogs?.map((log: { stepOrder: number; action: string; status: string; message: string; duration: number; screenshotUrl?: string }, i: number) => (
                <div key={i} className="rounded-lg border p-3 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Step {log.stepOrder}: {log.action}</span>
                    <span className={log.status === 'passed' ? 'badge-success' : 'badge-error'}>{log.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{log.message}</p>
                  <p className="text-xs text-gray-400">{log.duration}ms</p>
                  {log.screenshotUrl && (
                    <img
                      src={`${import.meta.env.VITE_API_URL?.replace('/api', '')}${log.screenshotUrl}`}
                      alt={`Step ${log.stepOrder}`}
                      className="mt-2 max-h-32 rounded border dark:border-gray-700"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
