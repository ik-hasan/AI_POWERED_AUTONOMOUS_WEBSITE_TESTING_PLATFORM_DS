import { ITestCaseDocument } from '../models/testCase.model';
import { TestStep } from '@platform/shared';

export interface ITestCaseRepository {
  findById(id: string): Promise<ITestCaseDocument | null>;
  findByProject(projectId: string, page: number, limit: number, search?: string): Promise<{ data: ITestCaseDocument[]; total: number }>;
  create(data: Partial<ITestCaseDocument>): Promise<ITestCaseDocument>;
  update(id: string, data: Partial<ITestCaseDocument>): Promise<ITestCaseDocument | null>;
  delete(id: string): Promise<boolean>;
}

export class TestCaseRepository implements ITestCaseRepository {
  constructor(private readonly model: typeof import('../models/testCase.model').TestCaseModel) {}

  async findById(id: string) {
    return this.model.findById(id);
  }

  async findByProject(projectId: string, page: number, limit: number, search?: string) {
    const filter: Record<string, unknown> = { projectId };
    if (search) {
      filter.$text = { $search: search };
    }
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { data, total };
  }

  async create(data: Partial<ITestCaseDocument>) {
    return this.model.create(data);
  }

  async update(id: string, data: Partial<ITestCaseDocument>) {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async delete(id: string) {
    const result = await this.model.findByIdAndDelete(id);
    return !!result;
  }
}

export function validateTestSteps(steps: TestStep[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validActions = ['navigate', 'click', 'fill', 'hover', 'press', 'drag', 'upload', 'download', 'assert', 'screenshot', 'wait'];
  const needsSelector = ['click', 'fill', 'hover', 'press', 'drag', 'upload', 'assert'];

  steps.forEach((step, i) => {
    if (!validActions.includes(step.action)) {
      errors.push(`Step ${i + 1}: Invalid action "${step.action}"`);
    }
    if (needsSelector.includes(step.action) && !step.selector) {
      errors.push(`Step ${i + 1}: Action "${step.action}" requires a selector`);
    }
    if (step.action === 'navigate' && !step.value) {
      errors.push(`Step ${i + 1}: Navigate action requires a URL value`);
    }
    if (step.action === 'assert' && !step.assertion) {
      errors.push(`Step ${i + 1}: Assert action requires an assertion`);
    }
  });

  return { valid: errors.length === 0, errors };
}
