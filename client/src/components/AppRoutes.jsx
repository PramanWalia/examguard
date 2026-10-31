import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { LoadingState } from './States';

const lazyPage = (factory, name) =>
  lazy(() => factory().then((module) => ({ default: module[name] })));

const LoginPage = lazyPage(() => import('../pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyPage(() => import('../pages/RegisterPage'), 'RegisterPage');
const DashboardPage = lazyPage(() => import('../pages/DashboardPage'), 'DashboardPage');
const NotFoundPage = lazyPage(() => import('../pages/NotFoundPage'), 'NotFoundPage');

const QuestionsPage = lazyPage(() => import('../pages/QuestionsPage'), 'QuestionsPage');
const ExamsPage = lazyPage(() => import('../pages/ExamsPage'), 'ExamsPage');
const ExamBuilderPage = lazyPage(() => import('../pages/ExamBuilderPage'), 'ExamBuilderPage');
const ExamOverviewPage = lazyPage(() => import('../pages/ExamOverviewPage'), 'ExamOverviewPage');
const TeacherMonitorPage = lazyPage(() => import('../pages/TeacherMonitorPage'), 'TeacherMonitorPage');
const ResultsPage = lazyPage(() => import('../pages/ResultsPage'), 'ResultsPage');
const AnalyticsPage = lazyPage(() => import('../pages/AnalyticsPage'), 'AnalyticsPage');

const AvailableExamsPage = lazyPage(() => import('../pages/AvailableExamsPage'), 'AvailableExamsPage');
const StudentInstructionsPage = lazyPage(() => import('../pages/StudentInstructionsPage'), 'StudentInstructionsPage');
const AttemptPage = lazyPage(() => import('../pages/AttemptPage'), 'AttemptPage');
const StudentResultsPage = lazyPage(() => import('../pages/StudentResultsPage'), 'StudentResultsPage');
const ResultDetailPage = lazyPage(() => import('../pages/ResultDetailPage'), 'ResultDetailPage');

const AdminUsersPage = lazyPage(() => import('../pages/AdminUsersPage'), 'AdminUsersPage');

export const AppRoutes = () => (
  <Suspense fallback={<LoadingState label="Loading screen" />}>
    <Routes>
      <Route element={<Navigate replace to="/dashboard" />} path="/" />
      <Route
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
        path="/login"
      />
      <Route
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
        path="/register"
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AttemptPage />} path="/attempts/:attemptId" />

        <Route element={<AppLayout />}>
          <Route element={<DashboardPage />} path="/dashboard" />

          <Route element={<RoleRoute allowedRoles={['teacher', 'admin']} />}>
            <Route element={<QuestionsPage />} path="/questions" />
            <Route element={<ExamsPage />} path="/exams" />
            <Route element={<ExamBuilderPage />} path="/exams/new" />
            <Route element={<ExamBuilderPage />} path="/exams/:examId/edit" />
            <Route element={<ExamOverviewPage />} path="/exams/:examId" />
            <Route element={<TeacherMonitorPage />} path="/exams/:examId/monitor" />
            <Route element={<ResultsPage />} path="/exams/:examId/results" />
            <Route element={<AnalyticsPage />} path="/exams/:examId/analytics" />
          </Route>

          <Route element={<RoleRoute allowedRoles={['student']} />}>
            <Route element={<AvailableExamsPage />} path="/exams/available" />
            <Route element={<StudentInstructionsPage />} path="/exams/:examId/instructions" />
            <Route element={<StudentResultsPage />} path="/results" />
            <Route element={<ResultDetailPage />} path="/attempts/:attemptId/result" />
          </Route>

          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route element={<AdminUsersPage />} path="/users" />
          </Route>
        </Route>
      </Route>

      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  </Suspense>
);

export default AppRoutes;
