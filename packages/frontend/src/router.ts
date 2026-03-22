import { createRouter, createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './routes/__root.js';
import { indexRoute } from './routes/index.js';

const reviewsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews',
  component: lazyRouteComponent(() => import('./routes/reviews/index.js'), 'ReviewQueue'),
});

const reviewsHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews/history',
  component: lazyRouteComponent(() => import('./routes/reviews/history.js'), 'ReviewHistory'),
});

const membersIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: lazyRouteComponent(() => import('./routes/members/index.js'), 'Members'),
});

const memberIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members/$id',
  component: lazyRouteComponent(() => import('./routes/members/$id.js'), 'MemberDetail'),
});

const projectsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: lazyRouteComponent(() => import('./routes/projects/index.js'), 'Projects'),
});

const projectIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$id',
  component: lazyRouteComponent(() => import('./routes/projects/$id.js'), 'ProjectDetail'),
});

const evaluationsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/evaluations',
  component: lazyRouteComponent(() => import('./routes/evaluations/index.js'), 'Evaluations'),
});

const workloadIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workload',
  component: lazyRouteComponent(() => import('./routes/workload/index.js'), 'Workload'),
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./routes/settings/index.js'), 'Settings'),
});

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
