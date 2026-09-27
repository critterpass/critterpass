/**
 * Route tree: `/sign-in` outside the shell; home and every registered module's routes inside it.
 * Module routes are generated from the registry, so adding a module never touches this file.
 */
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
} from '@tanstack/react-router';

import { EmptyState } from '../kit/states';
import { HomePage } from './home';
import { ADMIN_MODULES } from './modules';
import { Shell, moduleGate } from './shell';
import { SignInPage } from './sign-in';

const rootRoute = createRootRoute({ component: Outlet });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: 'shell', component: Shell });

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: HomePage,
});

const moduleRoutes: AnyRoute[] = ADMIN_MODULES.flatMap((module) =>
  module.routes.map((route) =>
    createRoute({
      getParentRoute: () => shellRoute,
      path: `/${route.path}`,
      component: moduleGate(module, route.component),
    }),
  ),
);

const routeTree = rootRoute.addChildren([
  signInRoute,
  shellRoute.addChildren([homeRoute, ...moduleRoutes]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <EmptyState title="No such page" />,
});
