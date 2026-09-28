import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { startStatusPolling } from '@/features/agent/llmStatus';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { GENERAL_SECTION_ID as DEFAULT_SECTION_ID } from '@app/shared';
import { useRole } from '@/features/board/store';
import { SessionGate } from '@/layout/SessionGate';
import { AppHistory } from '@/layout/AppHistory';
import { SplashScreen } from '@/layout/SplashScreen';
import { BoardPage } from '@/pages/BoardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SupportPage } from '@/pages/SupportPage';
import { ForumPage } from '@/pages/ForumPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { ThreadPage } from '@/pages/ThreadPage';
import { ThemeProvider } from '@/theme/ThemeProvider';

const DesignPage = lazy(() => import('@/pages/DesignPage'));
// только для администратора организации — грузится по требованию
const OrgPage = lazy(() => import('@/pages/OrgPage').then((m) => ({ default: m.OrgPage })));

/** Главная по роли: сотруднику — его обращения, специалисту — пульт поддержки. */
function Home() {
  const specialist = useRole() === 'specialist';
  return <Navigate to={specialist ? '/support' : `/s/${DEFAULT_SECTION_ID}`} replace />;
}

/** Личные обращения и разделы есть только у сотрудника (ТЗ v4.4, п. 14). */
function EmployeeOnly({ children }: { children: ReactNode }) {
  return useRole() === 'specialist' ? <Navigate to="/support" replace /> : <>{children}</>;
}

export function App() {
  useEffect(() => startStatusPolling(), []);
  return (
    <ThemeProvider>
      {/* reducedMotion="user": анимации Motion отключаются при prefers-reduced-motion */}
      <MotionConfig reducedMotion="user">
        <SessionGate>
          <BrowserRouter>
            <AppHistory>
              <Suspense fallback={<SplashScreen />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route
                    path="/s/:sectionId"
                    element={
                      <EmployeeOnly>
                        <BoardPage />
                      </EmployeeOnly>
                    }
                  />
                  <Route
                    path="/s/:sectionId/t/:taskId"
                    element={
                      <EmployeeOnly>
                        <BoardPage />
                      </EmployeeOnly>
                    }
                  />
                  <Route path="/forum" element={<ForumPage />} />
                  <Route path="/forum/review" element={<ReviewPage />} />
                  <Route path="/forum/s/:sectionId" element={<ForumPage />} />
                  <Route path="/forum/t/:threadId" element={<ThreadPage />} />
                  <Route path="/support" element={<SupportPage />} />
                  <Route path="/support/t/:taskId" element={<SupportPage />} />
                  <Route path="/support/:queue" element={<SupportPage />} />
                  <Route path="/support/:queue/t/:taskId" element={<SupportPage />} />
                  <Route path="/org" element={<OrgPage />} />
                  <Route path="/design" element={<DesignPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AppHistory>
          </BrowserRouter>
        </SessionGate>
      </MotionConfig>
    </ThemeProvider>
  );
}
