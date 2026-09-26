import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <h1>Critterpass Admin</h1>;
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
