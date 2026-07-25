import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Trang chủ = Dashboard tóm tắt (mục 11.H).
      {
        path: '',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      // Lăng kính Thư mục (mục 11.H).
      {
        path: 'files',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
      },
      {
        path: 'folder/:folderId',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
      },
      {
        path: 'starred',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
        data: { starred: true },
      },
      // Lăng kính Gần đây (cắt ngang folder — mục 11.H).
      {
        path: 'recent',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
        data: { recent: true },
      },
      // Thùng rác (mục 7.E/11.K).
      {
        path: 'trash',
        loadComponent: () => import('./pages/trash/trash').then((m) => m.Trash),
      },
      // Lăng kính Loại (cắt ngang folder — mục 11.H).
      {
        path: 'type/:group',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
      },
      {
        path: 'type/:group/:ext',
        loadComponent: () => import('./pages/files/files').then((m) => m.Files),
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./pages/search/search').then((m) => m.Search),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings').then((m) => m.Settings),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile').then((m) => m.Profile),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
