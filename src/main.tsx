import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createRuntime } from './core/runtime.js';
import type { Runtime, RuntimeSnapshot } from './core/types';
import App from './ui/App';
import './styles/cream.css';

const root = createRoot(document.getElementById('app')!);
// Runtime effects have one explicit owner, with matching teardown for HMR.
// Synchronous rendering preserves the legacy actions' post-render focus contract.
const runtime = createRuntime((snapshot: RuntimeSnapshot) => {
  flushSync(() => root.render(<App snapshot={snapshot} helpers={runtime as Runtime} />));
});
runtime.start();
if (import.meta.hot) import.meta.hot.dispose(() => {
  runtime.dispose();
  root.unmount();
});
