const net = require('net');

const WAIT_TIMEOUT_MS = Number(process.env.MONGO_WAIT_TIMEOUT_MS || 60000);
const RETRY_DELAY_MS = Number(process.env.MONGO_RETRY_DELAY_MS || 1000);

function parseMongoEndpoint(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);

    if (!parsed.protocol.startsWith('mongodb')) {
      return null;
    }

    if (parsed.protocol === 'mongodb+srv:') {
      return null;
    }

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 27017
    };
  } catch (_) {
    return null;
  }
}

function tryConnect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('timeout'));
    });
    socket.once('error', reject);
    socket.once('close', (hadError) => {
      if (!hadError) {
        resolve();
      }
    });
  });
}

async function waitForMongo() {
  const endpoint = parseMongoEndpoint(process.env.url_db);

  if (!endpoint || endpoint.host === 'localhost' || endpoint.host === '127.0.0.1') {
    return;
  }

  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await tryConnect(endpoint.host, endpoint.port, RETRY_DELAY_MS);
      console.log(`[wait-for-mongo] MongoDB ready at ${endpoint.host}:${endpoint.port}`);
      return;
    } catch (error) {
      console.log(`[wait-for-mongo] Waiting for MongoDB at ${endpoint.host}:${endpoint.port}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`MongoDB not reachable at ${endpoint.host}:${endpoint.port} after ${WAIT_TIMEOUT_MS}ms`);
}

waitForMongo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[wait-for-mongo] ${error.message}`);
    process.exit(1);
  });