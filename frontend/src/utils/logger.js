// Clean, readable frontend logger utility
const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (tag, message, ...data) => {
    console.log(`[PORTAL INFO] [${new Date().toLocaleTimeString()}] [${tag}]`, message, ...data);
  },
  warn: (tag, message, ...data) => {
    console.warn(`[PORTAL WARN] [${new Date().toLocaleTimeString()}] [${tag}]`, message, ...data);
  },
  error: (tag, message, ...data) => {
    console.error(`[PORTAL ERROR] [${new Date().toLocaleTimeString()}] [${tag}]`, message, ...data);
  }
};
