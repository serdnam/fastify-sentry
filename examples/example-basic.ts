import Fastify from 'fastify';
import FastifySentry from '../index.js';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
        sentryOptions: {
            dsn: "https://public@sentry.example.com/1",
            tracesSampleRate: 0.1,
            debug: false
        },
    }
);

server.register(async function route(fastify, options) {
    fastify.get('/', async function(req, reply) {
        return { status: `OK` };
    });
}, { prefix: 'health' });


(async () => {
    try {
        await server.ready();
        await server.listen(4000, '0.0.0.0')
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();