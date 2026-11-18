import { createRoot } from 'react-dom/client';
import { animate, MotionConfig } from 'motion/react';
import { startStudio } from '../dist/app.mjs';
import { Studio } from './Studio';
import { createFloorStore } from './floor-store';
import '../dist/style.css';
import '../dist/studio.css';
import './studio.css';

const floor = createFloorStore();
let started = false;

function mountStudio(element) {
  if (!element || started) return;
  started = true;
  startStudio({
    createFloor: floor.connect,
    createWorker: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
    onDialogOpen(dialog) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animate(dialog, { opacity: [0.45, 1], transform: ['translateY(5px)', 'translateY(0px)'] },
        { duration: 0.17, ease: [0.2, 0.72, 0.24, 1] });
    },
  });
}

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <Studio floor={floor} mountStudio={mountStudio} />
  </MotionConfig>,
);
