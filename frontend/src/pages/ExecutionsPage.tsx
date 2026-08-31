import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RefreshCw, ArrowLeft, OctagonX } from 'lucide-react';
import { executionApi } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { usePersistedState, EXECUTIONS_LAST_PATH_KEY } from '@/hooks/usePersistedState';
import ProgressBar from '@/components/ProgressBar';
import type { ExecutionUpdate } from '@/types';

const TERMINAL_STATUSES = new Set(['passed', 'failed', 'cancelled']);

function formatLiveLogLine(data: ExecutionUpdate): string {
  const time = new Date(data.timestamp).toLocaleTimeString();
  const stepLabel =
    data.currentStep > 0 && data.totalSteps > 0
      ? `Step ${data.currentStep}/${data.totalSteps}`
      : 'Setup';

  if (data.phase === 'start' && data.stepActivity) {
    const action = data.stepAction ? ` [${data.stepAction}]` : '';
    return `[${time}] ▶ ${stepLabel}${action} — ${data.stepActivity}`;
  }

  if (data.phase === 'done' && data.stepActivity) {
    const ms = data.durationMs != null ? ` (${(data.durationMs / 1000).toFixed(1)}s)` : '';
    return `[${time}] ✓ ${stepLabel} — ${data.stepActivity}${ms}`;
  }

  if (data.phase === 'complete' || TERMINAL_STATUSES.has(data.status)) {
    const label = TERMINAL_STATUSES.has(data.status) ? data.status.toUpperCase() : data.status;
    const detail = data.stepActivity ? ` — ${data.stepActivity}` : '';
    return `[${time}] ${label} (${data.progress}%)${detail}${data.error ? ` — ${data.error}` : ''}`;
  }

  return `[${time}] ${stepLabel} — ${data.status} (${data.progress}%)`;
}

function resolveStatus(live: ExecutionUpdate | null, dbStatus?: string): string {
  if (live && TERMINAL_STATUSES.has(live.status)) return live.status;
  if (dbStatus && TERMINAL_STATUSES.has(dbStatus)) return dbStatus;
  return live?.status ?? dbStatus ?? 'queued';
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { subscribeExecution } = useSocket();
  const [, setLastExecutionsPath] = usePersistedState(EXECUTIONS_LAST_PATH_KEY, '/executions');
  const [liveUpdate, setLiveUpdate] = useState<ExecutionUpdate | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const { data: execution, refetch } = useQuery({
    queryKey: ['execution', id],
    queryFn: () => executionApi.get(id!).then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'queued' ? 3000 : false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => executionApi.retry(id!),
    onSuccess: (res) => {
      window.location.href = `/executions/${res.data.data._id}`;
    },
  });

  const abortMutation = useMutation({
    mutationFn: () => executionApi.abort(id!),
    onSuccess: () => {
      setLastExecutionsPath('/executions');
      navigate('/executions', { replace: true });
    },
  });

  useEffect(() => {
    if (id) setLastExecutionsPath(`/executions/${id}`);
  }, [id, setLastExecutionsPath]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeExecution(id, (data) => {
      setLiveUpdate(data);
      setLogs((prev) => [...prev, formatLiveLogLine(data)]);
      if (data.status === 'cancelled') {
        setLastExecutionsPath('/executions');
        navigate('/executions', { replace: true });
        return;
      }
      if (TERMINAL_STATUSES.has(data.status)) refetch();
    });
    return unsubscribe;
  }, [id, subscribeExecution, refetch, navigate]);

  const current = liveUpdate || execution;
  const progress = liveUpdate?.progress ?? execution?.progress ?? 0;
  const status = resolveStatus(liveUpdate, execution?.status);
  const isActive = status === 'running' || status === 'queued' || status === 'retrying';

  // Fallback: if stuck at 100% running, poll until DB shows completion
  useEffect(() => {
    if (progress >= 100 && !TERMINAL_STATUSES.has(status)) {
      const timer = setInterval(() => refetch(), 2000);
      return () => clearInterval(timer);
    }
  }, [progress, status, refetch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/executions"
          className="text-gray-500 hover:text-gray-700"
          onClick={() => setLastExecutionsPath('/executions')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Execution {id?.slice(-8)}</h1>
          <p className="text-gray-500">Real-time test execution monitoring</p>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className={
            status === 'passed' ? 'badge-success'
              : status === 'failed' ? 'badge-error'
              : status === 'cancelled' ? 'badge-warning'
              : 'badge-info'
          }>
            {status}
          </span>
          <div className="flex gap-2">
            {isActive && (
              <button
                type="button"
                className="btn-secondary border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                onClick={() => abortMutation.mutate()}
                disabled={abortMutation.isPending}
              >
                <OctagonX className="h-4 w-4" /> {abortMutation.isPending ? 'Aborting...' : 'Abort'}
              </button>
            )}
            {status === 'failed' && (
              <button className="btn-primary" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            )}
          </div>
        </div>

        <ProgressBar
          value={progress}
          label={`Step ${current?.currentStep || 0} of ${current?.totalSteps || 0}`}
          color={status === 'failed' ? 'red' : status === 'passed' ? 'green' : 'brand'}
          size="lg"
        />

        {execution?.duration && (
          <p className="mt-3 text-sm text-gray-500">Duration: {(execution.duration / 1000).toFixed(1)}s</p>
        )}

        {liveUpdate?.error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {liveUpdate.error}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Live Logs</h2>
        <div className="max-h-96 overflow-y-auto rounded-lg bg-gray-950 p-4 font-mono text-xs text-green-400">
          {logs.length ? logs.map((log, i) => <div key={i}>{log}</div>) : (
            <div className="text-gray-500">Waiting for execution logs...</div>
          )}
        </div>
      </div>

      {status === 'passed' || status === 'failed' ? (
        <Link to={`/reports?executionId=${id}`} className="btn-primary inline-flex">
          View Report
        </Link>
      ) : null}
    </div>
  );
}

export function ExecutionsListPage() {
  const [page, setPage] = usePersistedState('executions-page', 1);
  const [, setLastExecutionsPath] = usePersistedState(EXECUTIONS_LAST_PATH_KEY, '/executions');

  const { data, isLoading } = useQuery({
    queryKey: ['executions', page],
    queryFn: () => executionApi.list(undefined, page).then((r) => r.data.data),
  });

  useEffect(() => {
    setLastExecutionsPath('/executions');
  }, [setLastExecutionsPath]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Executions</h1>
        <p className="text-gray-500">Test execution history</p>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-800">
                <th className="pb-3 text-left font-medium">ID</th>
                <th className="pb-3 text-left font-medium">Status</th>
                <th className="pb-3 text-left font-medium">Progress</th>
                <th className="pb-3 text-left font-medium">Duration</th>
                <th className="pb-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.map((e: { _id: string; status: string; progress: number; duration?: number; createdAt: string }) => (
                <tr key={e._id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-3">
                    <Link to={`/executions/${e._id}`} className="font-mono text-brand-600 hover:underline">
                      {e._id.slice(-8)}
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className={e.status === 'passed' ? 'badge-success' : e.status === 'failed' ? 'badge-error' : 'badge-info'}>
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3 w-48"><ProgressBar value={e.progress} showLabel={false} size="sm" /></td>
                  <td className="py-3">{e.duration ? `${(e.duration / 1000).toFixed(1)}s` : '-'}</td>
                  <td className="py-3 text-gray-500">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
