import Redis from 'ioredis';
import { AnalyticsSummary, PaginatedResponse } from '@platform/shared';
import { ProjectModel, WebsiteModel, ReportModel, IProjectDocument, IWebsiteDocument, IReportDocument } from '../models';

export class ProjectService {
  async create(data: { name: string; description?: string; ownerId: string }) {
    return ProjectModel.create({ ...data, members: [data.ownerId] });
  }

  async list(userId: string, page: number, limit: number) {
    const filter = { $or: [{ ownerId: userId }, { members: userId }] };
    const [data, total] = await Promise.all([
      ProjectModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ProjectModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(id: string) {
    const project = await ProjectModel.findById(id);
    if (!project) throw new Error('Project not found');
    return project;
  }

  async update(id: string, data: Partial<IProjectDocument>) {
    const project = await ProjectModel.findByIdAndUpdate(id, data, { new: true });
    if (!project) throw new Error('Project not found');
    return project;
  }

  async delete(id: string) {
    const result = await ProjectModel.findByIdAndDelete(id);
    if (!result) throw new Error('Project not found');
    await WebsiteModel.deleteMany({ projectId: id });
  }
}
 
export class WebsiteService {
  async create(data: { projectId: string; name: string; url: string; description?: string }) {
    return WebsiteModel.create(data);
  }

  async listByProject(projectId: string) {
    return WebsiteModel.find({ projectId }).sort({ createdAt: -1 });
  }

  async getById(id: string) {
    const website = await WebsiteModel.findById(id);
    if (!website) throw new Error('Website not found');
    return website;
  }

  async update(id: string, data: Partial<IWebsiteDocument>) {
    const website = await WebsiteModel.findByIdAndUpdate(id, data, { new: true });
    if (!website) throw new Error('Website not found');
    return website;
  }

  async delete(id: string) {
    const result = await WebsiteModel.findByIdAndDelete(id);
    if (!result) throw new Error('Website not found');
  }
}

export class ReportService {
  constructor(private readonly redis: Redis) {}

  async create(data: Partial<IReportDocument>) {
    const report = await ReportModel.create(data);
    await this.redis.del(`report:${data.executionId}`);
    return report;
  }

  async getById(id: string) {
    const cached = await this.redis.get(`report:${id}`);
    if (cached) return JSON.parse(cached);

    const report = await ReportModel.findById(id);
    if (!report) throw new Error('Report not found');
    await this.redis.setex(`report:${id}`, 300, JSON.stringify(report));
    return report;
  }

  async getByExecutionId(executionId: string) {
    const cached = await this.redis.get(`report:exec:${executionId}`);
    if (cached) return JSON.parse(cached);

    const report = await ReportModel.findOne({ executionId });
    if (!report) throw new Error('Report not found');
    await this.redis.setex(`report:exec:${executionId}`, 300, JSON.stringify(report));
    return report;
  }

  async deleteByExecutionId(executionId: string): Promise<boolean> {
    const report = await ReportModel.findOneAndDelete({ executionId });
    await this.redis.del(`report:exec:${executionId}`);
    if (report) {
      await this.redis.del(`report:${report._id}`);
      await this.invalidateAnalyticsCache();
    }
    return !!report;
  }

  async deleteById(id: string): Promise<boolean> {
    const report = await ReportModel.findByIdAndDelete(id);
    if (!report) return false;
    await this.redis.del(`report:${id}`);
    await this.redis.del(`report:exec:${report.executionId}`);
    await this.invalidateAnalyticsCache();
    return true;
  }

  private async invalidateAnalyticsCache(): Promise<void> {
    const keys = await this.redis.keys('analytics:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }

  async list(projectId: string | undefined, page: number, limit: number, search?: string, status?: string): Promise<PaginatedResponse<IReportDocument>> {
    const filter: Record<string, unknown> = {};
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (search) filter.$text = { $search: search };

    const [data, total] = await Promise.all([
      ReportModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ReportModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAnalytics(projectId?: string): Promise<AnalyticsSummary> {
    const cacheKey = `analytics:${projectId || 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const filter = projectId ? { projectId } : {};
    const reports = await ReportModel.find(filter).sort({ createdAt: -1 }).limit(1000);

    const totalExecutions = reports.length;
    const passedExecutions = reports.filter((r) => r.status === 'passed').length;
    const failedExecutions = reports.filter((r) => r.status === 'failed').length;
    const averageDuration = totalExecutions > 0
      ? reports.reduce((sum, r) => sum + (r.metrics?.duration || 0), 0) / totalExecutions
      : 0;

    const dayMap = new Map<string, { count: number; passed: number; failed: number }>();
    reports.forEach((r) => {
      const date = r.createdAt.toISOString().split('T')[0];
      const entry = dayMap.get(date) || { count: 0, passed: 0, failed: 0 };
      entry.count++;
      if (r.status === 'passed') entry.passed++;
      if (r.status === 'failed') entry.failed++;
      dayMap.set(date, entry);
    });

    const analytics: AnalyticsSummary = {
      totalExecutions,
      passedExecutions,
      failedExecutions,
      averageDuration: Math.round(averageDuration),
      successRate: totalExecutions > 0 ? Math.round((passedExecutions / totalExecutions) * 100) : 0,
      executionsByDay: Array.from(dayMap.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };

    await this.redis.setex(cacheKey, 120, JSON.stringify(analytics));
    return analytics;
  }
}
