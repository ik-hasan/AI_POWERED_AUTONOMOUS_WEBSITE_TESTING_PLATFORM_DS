import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { analyticsApi } from '@/lib/api';

const COLORS = ['#22c55e', '#ef4444', '#3b82f6'];

export default function AnalyticsPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => analyticsApi.get().then((r) => r.data.data),
  });

  const pieData = [
    { name: 'Passed', value: analytics?.passedExecutions ?? 0 },
    { name: 'Failed', value: analytics?.failedExecutions ?? 0 },
  ];

  if (isLoading) return <p className="text-gray-500">Loading analytics...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-gray-500">Execution performance metrics and trends</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Executions', value: analytics?.totalExecutions ?? 0 },
          { label: 'Success Rate', value: `${analytics?.successRate ?? 0}%` },
          { label: 'Avg Duration', value: `${((analytics?.averageDuration ?? 0) / 1000).toFixed(1)}s` },
          { label: 'Failed Tests', value: analytics?.failedExecutions ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Executions Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics?.executionsByDay ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="passed" fill="#22c55e" name="Passed" stackId="a" />
              <Bar dataKey="failed" fill="#ef4444" name="Failed" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Pass / Fail Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
