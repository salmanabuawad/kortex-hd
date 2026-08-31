import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/layout.css';
import './styles/display.css';
import './i18n';              // must initialise before any component calls t()
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
