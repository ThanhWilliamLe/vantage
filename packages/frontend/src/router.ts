import { createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/__root.js';
import { indexRoute } from './routes/index.js';
import { reviewsIndexRoute } from './routes/reviews/index.js';
import { reviewsHistoryRoute } from './routes/reviews/history.js';
import { membersIndexRoute } from './routes/members/index.js';
import { memberIdRoute } from './routes/members/$id.js';
import { projectsIndexRoute } from './routes/projects/index.js';
import { projectIdRoute } from './routes/projects/$id.js';
import { evaluationsIndexRoute } from './routes/evaluations/index.js';
import { workloadIndexRoute } from './routes/workload/index.js';
import { settingsIndexRoute } from './routes/settings/index.js';

const routeTree = rootRoute.addChildren([
  indexRoute,
  reviewsHistoryRoute,
  reviewsIndexRoute,
  membersIndexRoute,
  memberIdRoute,
  projectsIndexRoute,
  projectIdRoute,
  evaluationsIndexRoute,
  workloadIndexRoute,
  settingsIndexRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
