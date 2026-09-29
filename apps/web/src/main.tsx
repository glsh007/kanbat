import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initUiScale } from './lib/uiScale';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден #root в index.html');

// размер интерфейса — до первой отрисовки (ТЗ v4.18)
initUiScale();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
