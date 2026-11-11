import './style.css';
import { buildUI } from './ui';
import { store } from './store';

buildUI(document.getElementById('app')!);

// Handy for debugging and scripting from the console.
(window as unknown as { maproid: unknown }).maproid = { store };
