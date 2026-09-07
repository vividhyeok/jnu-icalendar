import { runSync } from './sync';
// Also bounds library credential discovery / browser shutdown in local runs.
const deadline = setTimeout(() => {
  console.error('Sync failed: overall execution timeout');
  process.exit(1);
}, 540_000);
deadline.unref();
runSync().then(code => { process.exitCode = code; });
