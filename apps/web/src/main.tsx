import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './layout/ErrorBoundary';
import { initUiScale } from './lib/uiScale';
import { loadOrgBrand } from './brand/orgBrand';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден #root в index.html');

// размер интерфейса — до первой отрисовки (ТЗ v4.18)
initUiScale();
// оформление организации (ТЗ v4.28): до входа — нужно и экрану входа
void loadOrgBrand();

createRoot(root).render(
  <StrictMode>
    {/* что бы ни сломалось — не пустая страница, а понятное сообщение */}
    <ErrorBoundary full>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
