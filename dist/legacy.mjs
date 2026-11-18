import { startStudio } from './app.mjs';
import { createFactory } from './factory.mjs';

const workerURL = new URL('./worker.mjs', import.meta.url);
startStudio({
  createFloor: (select, follow) => createFactory(document.getElementById('factory'), select, follow),
  createWorker: () => new Worker(workerURL, { type: 'module' }),
});
