import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Play, Trash2, Edit, Search, Monitor, MonitorOff, Plus, FilePlus, Compass, OctagonX } from 'lucide-react';
import clsx from 'clsx';
import { projectApi, websiteApi, testCaseApi, executionApi } from '@/lib/api';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useSocket } from '@/hooks/useSocket';
import type { TestStep, ExploreUpdate } from '@/types';

const HEADLESS_STORAGE_KEY = 'playwright-headless';
const PROJECT_STORAGE_KEY = 'test-cases-project';
const SEARCH_STORAGE_KEY = 'test-cases-search';
const STEP_ACTIONS = ['navigate', 'click', 'fill', 'hover', 'press', 'assert', 'screenshot', 'wait'] as const;
const EXPLORE_DONE = new Set(['completed', 'failed', 'cannot_proceed', 'cancelled']);
const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

function screenshotSrc(path?: string) {
  if (!path) return '';
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

function emptyStep(order: number, websiteUrl = ''): TestStep {
  return {
    order,
    action: order === 0 ? 'navigate' : 'click',
    value: order === 0 ? websiteUrl : '',
    selector: '',
    description: order === 0 ? `Navigate to ${websiteUrl || 'URL'}` : `Step ${order + 1}`,
  };
}

export default function TestCasesPage() {
  const queryClient = useQueryClient();
  const { subscribeExplore } = useSocket();
  const [selectedProject, setSelectedProject] = usePersistedState(PROJECT_STORAGE_KEY, '');
  const [search, setSearch] = usePersistedState(SEARCH_STORAGE_KEY, '');
  const [showGenerate, setShowGenerate] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedWebsite, setSelectedWebsite] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState<TestStep[]>([]);
  const [headless, setHeadless] = useState(() => localStorage.getItem(HEADLESS_STORAGE_KEY) !== 'false');
  const [generateError, setGenerateError] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualWebsite, setManualWebsite] = useState('');
  const [manualSteps, setManualSteps] = useState<TestStep[]>([emptyStep(0)]);
  const [walkSite, setWalkSite] = useState(true);
  const [exploreId, setExploreId] = useState<string | null>(null);
  const [exploreLogs, setExploreLogs] = useState<string[]>([]);
  const [exploreShot, setExploreShot] = useState('');
  const [exploreStatus, setExploreStatus] = useState('');

  useEffect(() => {
    localStorage.setItem(HEADLESS_STORAGE_KEY, String(headless));
  }, [headless]);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 100).then((r) => r.data.data),
  });

  useEffect(() => {
    if (!selectedProject || !projects?.data) return;
    const exists = projects.data.some((p: { _id: string }) => p._id === selectedProject);
    if (!exists) setSelectedProject('');
  }, [projects, selectedProject]);

  const { data: websites } = useQuery({
    queryKey: ['websites', selectedProject],
    queryFn: () => websiteApi.list(selectedProject).then((r) => r.data.data),
    enabled: !!selectedProject,
  });

  const { data: testCases, isLoading } = useQuery({
    queryKey: ['test-cases', selectedProject, search],
    queryFn: () => testCaseApi.list(selectedProject, 1, search).then((r) => r.data.data),
    enabled: !!selectedProject,
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const website = websites?.find((w: { _id: string }) => w._id === selectedWebsite);
      return testCaseApi.generate({
        projectId: selectedProject,
        websiteId: selectedWebsite,
        websiteUrl: website.url,
        prompt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      setShowGenerate(false);
      setPrompt('');
      setGenerateError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'AI test generation failed. Ensure GEMINI_API_KEY is configured in .env';
      setGenerateError(msg);
    },
  });

  const exploreMutation = useMutation({
    mutationFn: () => {
      const website = websites?.find((w: { _id: string }) => w._id === selectedWebsite);
      return testCaseApi.explore({
        projectId: selectedProject,
        websiteId: selectedWebsite,
        websiteUrl: website.url,
        prompt,
        headless,
      });
    },
    onSuccess: (res) => {
      setGenerateError('');
      setExploreLogs([]);
      setExploreShot('');
      setExploreStatus('queued');
      setExploreId(res.data.data._id);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Page-aware explore failed. Ensure GEMINI_API_KEY is configured and execution-service is running.';
      setGenerateError(msg);
    },
  });

  const abortExploreMutation = useMutation({
    mutationFn: () => testCaseApi.abortExplore(exploreId!),
  });

  const applyExploreUpdate = (data: ExploreUpdate) => {
    setExploreStatus(data.status);
    setExploreLogs((prev) => [...prev, `[${new Date(data.timestamp).toLocaleTimeString()}] ${data.message}`]);
    if (data.screenshotUrl) setExploreShot(data.screenshotUrl);
    if (EXPLORE_DONE.has(data.status)) {
      queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      if (data.status === 'completed') setGenerateError('');
      if (data.status === 'failed' || data.status === 'cancelled') {
        setGenerateError(data.error || data.message);
      }
    }
  };

  useEffect(() => {
    if (!exploreId) return;
    const unsub = subscribeExplore(exploreId, (data) => {
      if (data.exploreId && data.exploreId !== exploreId) return;
      applyExploreUpdate(data);
    });
    const poll = setInterval(async () => {
      try {
        const { data } = await testCaseApi.getExplore(exploreId);
        const session = data.data;
        setExploreStatus(session.status);
        if (session.hopLog?.length) {
          setExploreLogs(session.hopLog.map((h: { timestamp: string; message: string }) =>
            `[${new Date(h.timestamp).toLocaleTimeString()}] ${h.message}`
          ));
          const lastShot = [...session.hopLog].reverse().find((h: { screenshotUrl?: string }) => h.screenshotUrl);
          if (lastShot?.screenshotUrl) setExploreShot(lastShot.screenshotUrl);
        }
        if (EXPLORE_DONE.has(session.status)) {
          queryClient.invalidateQueries({ queryKey: ['test-cases'] });
          if (session.error && session.status !== 'completed') setGenerateError(session.error);
          clearInterval(poll);
        }
      } catch {
        // keep waiting for socket
      }
    }, 2500);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [exploreId, subscribeExplore, queryClient]);

  const executeMutation = useMutation({
    mutationFn: ({ testCaseId, headless: runHeadless }: { testCaseId: string; headless: boolean }) =>
      executionApi.start(testCaseId, { headless: runHeadless }),
    onSuccess: (res) => {
      window.location.href = `/executions/${res.data.data._id}`;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, steps }: { id: string; steps: TestStep[] }) =>
      testCaseApi.update(id, { steps }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => testCaseApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-cases'] }),
  });

  const createManualMutation = useMutation({
    mutationFn: () =>
      testCaseApi.create({
        projectId: selectedProject,
        websiteId: manualWebsite,
        title: manualTitle.trim(),
        description: manualDescription.trim(),
        steps: manualSteps.map((s, i) => ({
          ...s,
          order: i,
          description: s.description?.trim() || `${s.action} step ${i + 1}`,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases'] });
      setShowManual(false);
      setManualTitle('');
      setManualDescription('');
      setManualWebsite('');
      setManualSteps([emptyStep(0)]);
      setManualError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to create test case. Check title and steps.';
      setManualError(msg);
    },
  });

  const openManualForm = () => {
    setShowGenerate(false);
    setShowManual(true);
    setManualError('');
    const firstWebsite = websites?.[0];
    const url = firstWebsite?.url || '';
    setManualWebsite(firstWebsite?._id || '');
    setManualSteps([emptyStep(0, url)]);
  };

  const openGenerateForm = () => {
    setShowManual(false);
    setShowGenerate(true);
    setGenerateError('');
    setExploreId(null);
    setExploreLogs([]);
    setExploreShot('');
    setExploreStatus('');
  };

  const exploring = !!exploreId && !EXPLORE_DONE.has(exploreStatus);
  const generateBusy = generateMutation.isPending || exploreMutation.isPending || exploring;

  const startEdit = async (id: string) => {
    const { data } = await testCaseApi.get(id);
    setEditSteps(data.data.steps);
    setEditingId(id);
  };

  const updateManualStep = (index: number, patch: Partial<TestStep>) => {
    setManualSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const canSubmitManual =
    !!manualTitle.trim() &&
    !!manualWebsite &&
    manualSteps.length > 0 &&
    manualSteps.every((s) => s.action && (s.description?.trim() || s.action));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Cases</h1>
          <p className="text-gray-500">AI-generated and manual test cases</p>
        </div>
        {selectedProject && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={openManualForm}>
              <FilePlus className="h-4 w-4" /> Create Manual
            </button>
            <button className="btn-primary" onClick={openGenerateForm}>
              <Sparkles className="h-4 w-4" /> Generate with AI
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <select className="input max-w-xs" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
          <option value="">Select Project</option>
          {projects?.data?.map((p: { _id: string; name: string }) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className="input pl-10" placeholder="Search test cases..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={() => setHeadless((h) => !h)}
          className={clsx(
            'btn-secondary shrink-0',
            !headless && 'ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-900/20'
          )}
          title={headless
            ? 'Headless ON — browser background mein. Click karke Live browser ON karo.'
            : 'Live browser ON — Chrome window dikhegi. Click karke Headless ON karo.'}
        >
          {headless ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          <span>{headless ? 'Headless' : 'Live Browser'}</span>
        </button>
      </div>

      {showGenerate && (
        <div className="card space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-600" /> AI Test Generation</h3>
          <p className="text-sm text-gray-500">
            Page-aware mode opens the live site, batches actions on each page, then continues after navigation.
            Requires <code className="text-xs">GEMINI_API_KEY</code>.
          </p>
          {generateError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{generateError}</div>
          )}
          <select className="input" value={selectedWebsite} onChange={(e) => setSelectedWebsite(e.target.value)} disabled={generateBusy}>
            <option value="">Select Website</option>
            {websites?.map((w: { _id: string; name: string; url: string }) => (
              <option key={w._id} value={w._id}>{w.name} ({w.url})</option>
            ))}
          </select>
          <textarea
            className="input"
            rows={4}
            placeholder="Describe your test in natural language, e.g. 'Navigate to the login page, enter valid credentials, and verify the dashboard loads'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={generateBusy}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={walkSite} onChange={(e) => setWalkSite(e.target.checked)} disabled={generateBusy} />
            <Compass className="h-4 w-4 text-brand-600" />
            Walk the live site (page-aware) — recommended
          </label>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => walkSite ? exploreMutation.mutate() : generateMutation.mutate()}
              disabled={!prompt || !selectedWebsite || generateBusy}
            >
              {exploring || exploreMutation.isPending
                ? 'Walking site...'
                : generateMutation.isPending
                  ? 'Generating...'
                  : walkSite ? 'Explore & Generate' : 'Quick Generate'}
            </button>
            {exploring && (
              <button className="btn-secondary text-red-600" onClick={() => abortExploreMutation.mutate()} disabled={abortExploreMutation.isPending}>
                <OctagonX className="h-4 w-4" /> Abort
              </button>
            )}
            <button className="btn-secondary" onClick={() => { setShowGenerate(false); setExploreId(null); }} disabled={exploring}>Cancel</button>
          </div>

          {exploreStatus === 'completed' && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              Page-aware walk finished. The recorded test case is in the list below — review steps, then run it.
            </div>
          )}
          {exploreStatus === 'cannot_proceed' && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              Walk stopped early. Partial steps were saved as a draft if any actions succeeded. Check the reason in the log.
            </div>
          )}
          {(exploreLogs.length > 0 || exploring) && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-950 p-3 font-mono text-xs text-green-400">
                {exploreStatus && <div className="mb-2 text-brand-400">status: {exploreStatus}</div>}
                {exploreLogs.length ? exploreLogs.map((line, i) => <div key={i}>{line}</div>) : (
                  <div className="text-gray-500">Waiting for explore hops...</div>
                )}
              </div>
              {exploreShot ? (
                <img src={screenshotSrc(exploreShot)} alt="Current page snapshot" className="max-h-64 w-full rounded-lg border object-contain dark:border-gray-800" />
              ) : (
                <div className="flex max-h-64 items-center justify-center rounded-lg border text-sm text-gray-400 dark:border-gray-800">
                  Page snapshot appears after the first hop
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showManual && (
        <div className="card space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FilePlus className="h-5 w-5 text-brand-600" /> Create Manual Test Case
          </h3>
          <p className="text-sm text-gray-500">
            Write Playwright steps yourself — no Gemini required.
          </p>
          {manualError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{manualError}</div>
          )}
          <input
            className="input"
            placeholder="Test title"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
          />
          <textarea
            className="input"
            rows={2}
            placeholder="Description (optional)"
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
          />
          <select
            className="input"
            value={manualWebsite}
            onChange={(e) => {
              const id = e.target.value;
              setManualWebsite(id);
              const website = websites?.find((w: { _id: string }) => w._id === id);
              if (website && manualSteps[0]?.action === 'navigate') {
                updateManualStep(0, {
                  value: website.url,
                  description: `Navigate to ${website.url}`,
                });
              }
            }}
          >
            <option value="">Select Website</option>
            {websites?.map((w: { _id: string; name: string; url: string }) => (
              <option key={w._id} value={w._id}>{w.name} ({w.url})</option>
            ))}
          </select>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Steps</h4>
              <button
                type="button"
                className="btn-secondary py-1 px-2 text-sm"
                onClick={() => setManualSteps((prev) => [...prev, emptyStep(prev.length)])}
              >
                <Plus className="h-3.5 w-3.5" /> Add step
              </button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {manualSteps.map((step, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-6 text-gray-400">{i}</span>
                  <select
                    className="input w-28 py-1"
                    value={step.action}
                    onChange={(e) => updateManualStep(i, { action: e.target.value })}
                  >
                    {STEP_ACTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <input
                    className="input min-w-[100px] flex-1 py-1"
                    value={step.selector || ''}
                    placeholder="Selector"
                    onChange={(e) => updateManualStep(i, { selector: e.target.value })}
                  />
                  <input
                    className="input min-w-[100px] flex-1 py-1"
                    value={step.value || ''}
                    placeholder="Value / URL"
                    onChange={(e) => updateManualStep(i, { value: e.target.value })}
                  />
                  <input
                    className="input min-w-[120px] flex-1 py-1"
                    value={step.description || ''}
                    placeholder="Description"
                    onChange={(e) => updateManualStep(i, { description: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-danger py-1 px-2"
                    disabled={manualSteps.length <= 1}
                    onClick={() => setManualSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })))}
                    title="Remove step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => createManualMutation.mutate()}
              disabled={!canSubmitManual || createManualMutation.isPending}
            >
              {createManualMutation.isPending ? 'Creating...' : 'Create Test Case'}
            </button>
            <button className="btn-secondary" onClick={() => setShowManual(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!selectedProject ? (
        <p className="text-gray-500">Select a project to view test cases.</p>
      ) : isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {testCases?.data?.map((tc: { _id: string; title: string; description: string; status: string; steps: TestStep[]; naturalLanguagePrompt?: string; generatedBy?: string }) => (
            <div key={tc._id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{tc.title}</h3>
                  <p className="text-sm text-gray-500">{tc.description}</p>
                  {tc.naturalLanguagePrompt && (
                    <p className="mt-1 text-xs text-gray-400 italic">&quot;{tc.naturalLanguagePrompt}&quot;</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <span className={tc.status === 'ready' ? 'badge-success' : 'badge-warning'}>{tc.status}</span>
                    <span className="badge-info">{tc.steps.length} steps</span>
                    {tc.generatedBy === 'explore' && <span className="badge-info">page-aware</span>}
                    {tc.generatedBy === 'prompt' && <span className="badge-info">quick AI</span>}
                    {tc.generatedBy === 'manual' && <span className="badge-info">manual</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary py-1.5 px-3"
                    onClick={() => executeMutation.mutate({ testCaseId: tc._id, headless })}
                    disabled={executeMutation.isPending}
                    title={headless ? 'Run (headless)' : 'Run (live browser)'}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button className="btn-secondary py-1.5 px-3" onClick={() => startEdit(tc._id)}>
                    <Edit className="h-4 w-4" />
                  </button>
                  <button className="btn-danger py-1.5 px-3" onClick={() => deleteMutation.mutate(tc._id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {editingId === tc._id && (
                <div className="mt-4 border-t pt-4 dark:border-gray-800">
                  <h4 className="mb-2 text-sm font-medium">Edit Steps</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {editSteps.map((step, i) => (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="w-8 text-gray-400">{i}</span>
                        <select
                          className="input w-28 py-1"
                          value={step.action}
                          onChange={(e) => {
                            const updated = [...editSteps];
                            updated[i] = { ...step, action: e.target.value };
                            setEditSteps(updated);
                          }}
                        >
                          {STEP_ACTIONS.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                        <input className="input flex-1 py-1" value={step.selector || ''} placeholder="Selector"
                          onChange={(e) => { const u = [...editSteps]; u[i] = { ...step, selector: e.target.value }; setEditSteps(u); }} />
                        <input className="input flex-1 py-1" value={step.value || ''} placeholder="Value"
                          onChange={(e) => { const u = [...editSteps]; u[i] = { ...step, value: e.target.value }; setEditSteps(u); }} />
                        <button
                          type="button"
                          className="btn-danger py-1 px-2"
                          disabled={editSteps.length <= 1}
                          onClick={() =>
                            setEditSteps((prev) =>
                              prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx }))
                            )
                          }
                          title="Remove step"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary" onClick={() => updateMutation.mutate({ id: tc._id, steps: editSteps })}>Save</button>
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!testCases?.data?.length && <p className="text-gray-500">No test cases found.</p>}
        </div>
      )}
    </div>
  );
}
