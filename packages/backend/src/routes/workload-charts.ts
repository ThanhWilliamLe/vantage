import { FastifyInstance } from 'fastify';
import { WorkloadChartService } from '../services/workload-chart-service.js';
import { ValidationError } from '../errors/index.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateParams(
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  if (!startDate || !endDate) {
    throw new ValidationError('startDate and endDate are required', {
      field: 'startDate,endDate',
    });
  }
  if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
    throw new ValidationError('startDate and endDate must be in YYYY-MM-DD format', {
      field: 'startDate,endDate',
    });
  }
  return { startDate, endDate };
}

export async function workloadChartRoutes(app: FastifyInstance) {
  // GET /api/workload/charts/bar — commit volume by member × project
  app.get('/api/workload/charts/bar', async (request) => {
    const query = request.query as { startDate?: string; endDate?: string };
    const { startDate, endDate } = validateDateParams(query.startDate, query.endDate);

    const data = await WorkloadChartService.getBarData(app.db, startDate, endDate);

    return { startDate, endDate, data };
  });

  // GET /api/workload/charts/trend — commit volume over time (weekly buckets)
  app.get('/api/workload/charts/trend', async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      memberId?: string;
      projectId?: string;
    };
    const { startDate, endDate } = validateDateParams(query.startDate, query.endDate);

    const data = await WorkloadChartService.getTrendData(
      app.db,
      startDate,
      endDate,
      query.memberId,
      query.projectId,
    );

    return {
      startDate,
      endDate,
      ...(query.memberId && { memberId: query.memberId }),
      ...(query.projectId && { projectId: query.projectId }),
      data,
    };
  });

  // GET /api/workload/charts/heatmap — member × project activity matrix
  app.get('/api/workload/charts/heatmap', async (request) => {
    const query = request.query as { startDate?: string; endDate?: string };
    const { startDate, endDate } = validateDateParams(query.startDate, query.endDate);

    const { members, projects, cells, maxCommits } = await WorkloadChartService.getHeatmapData(
      app.db,
      startDate,
      endDate,
    );

    return { startDate, endDate, members, projects, cells, maxCommits };
  });
}
