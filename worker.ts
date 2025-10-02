// worker.ts - Clean worker implementation
import main from './ejs/src/main.ts';

self.onmessage = (e) => {
  try {
    const output = main(e.data);
    self.postMessage({ type: 'success', data: output });
  } catch (error) {
    self.postMessage({
      type: 'error',
      data: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};