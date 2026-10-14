// Keep a single HTTP Server export so the runtime retains upgrade listeners.
// app.ts also exports test/local helpers; those must not replace this server.
import { server } from './app';
export default server;
