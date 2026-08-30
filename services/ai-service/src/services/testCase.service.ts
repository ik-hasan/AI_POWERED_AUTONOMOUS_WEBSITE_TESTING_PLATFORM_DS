import { Logger, TestStep, PaginatedResponse, normalizeTestSteps } from '@platform/shared';
import { ITestCaseRepository, validateTestSteps } from '../repositories/testCase.repository';
import { GeminiService, TestPlanCache } from './gemini.service';
import { ITestCaseDocument } from '../models/testCase.model';

export class TestCaseService {
  private logger = new Logger('test-case-service');

  constructor(
    private readonly repo: ITestCaseRepository,
    private readonly gemini: GeminiService,
    private readonly cache: TestPlanCache
  ) {}

  async generateFromPrompt(
    projectId: string,
    websiteId: string,
    websiteUrl: string,
    prompt: string,
    title: string | undefined,
    userId: string
  ) {
    let plan = await this.cache.get(prompt, websiteUrl);
    if (!plan) {
      plan = await this.gemini.generateTestPlan(prompt, websiteUrl);
      await this.cache.set(prompt, websiteUrl, plan);
    }

    const validation = validateTestSteps(plan.steps);
    if (!validation.valid) {
      this.logger.warn('Generated plan has validation warnings', { errors: validation.errors });
    }

    const testCase = await this.repo.create({
      projectId,
      websiteId,
      title: title || plan.title,
      description: plan.description,
      naturalLanguagePrompt: prompt,
      steps: plan.steps,
      createdBy: userId,
      status: validation.valid ? 'ready' : 'draft',
      generatedBy: 'prompt',
    });

    return { testCase, validation };
  }

  async getById(id: string) {
    const testCase = await this.repo.findById(id);
    if (!testCase) throw new Error('Test case not found');
    return testCase;
  }

  async listByProject(projectId: string, page: number, limit: number, search?: string): Promise<PaginatedResponse<ITestCaseDocument>> {
    const { data, total } = await this.repo.findByProject(projectId, page, limit, search);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async update(id: string, updates: { title?: string; description?: string; steps?: TestStep[]; status?: string }) {
    if (updates.steps) {
      updates.steps = normalizeTestSteps(updates.steps);
      const validation = validateTestSteps(updates.steps);
      if (!validation.valid) {
        throw new Error(`Invalid steps: ${validation.errors.join(', ')}`);
      }
    }
    const testCase = await this.repo.update(id, updates as Partial<ITestCaseDocument>);
    if (!testCase) throw new Error('Test case not found');
    return testCase;
  }

  async createManual(data: {
    projectId: string;
    websiteId: string;
    title: string;
    description?: string;
    steps: TestStep[];
    createdBy: string;
  }) {
    const steps = normalizeTestSteps(data.steps);
    const validation = validateTestSteps(steps);
    if (!validation.valid) {
      throw new Error(`Invalid steps: ${validation.errors.join(', ')}`);
    }
    return this.repo.create({ ...data, steps, status: 'ready', generatedBy: 'manual' });
  }

  async delete(id: string) {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new Error('Test case not found');
  }

  async createFromExplore(data: {
    projectId: string;
    websiteId: string;
    title: string;
    description: string;
    prompt: string;
    steps: TestStep[];
    createdBy: string;
    status: 'draft' | 'ready';
    exploreId: string;
    hops: number;
    geminiCalls: number;
  }) {
    return this.repo.create({
      projectId: data.projectId,
      websiteId: data.websiteId,
      title: data.title,
      description: data.description,
      naturalLanguagePrompt: data.prompt,
      steps: data.steps,
      createdBy: data.createdBy,
      status: data.status,
      generatedBy: 'explore',
      exploreMeta: {
        exploreId: data.exploreId,
        hops: data.hops,
        geminiCalls: data.geminiCalls,
      },
    });
  }
}
