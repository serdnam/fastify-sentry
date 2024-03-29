# @serdnam/fastify-sentry

Fastify [Sentry](https://sentry.io) plugin.

## Install

```
npm i @serdnam/fastify-sentry
```

## Usage

The following enables forwarding any error that occurs during the request to Sentry:

```ts
import Fastify from 'fastify';
import { FastifySentry } from '@serdnam/fastify-sentry';

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
        await server.listen({ host: '0.0.0.0', port: 4000 })
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();

```

The following captures and sends errors to Sentry as well, but also sets up a Sentry transaction for the duration of the request and child Spans for each Fastify hook defined in `performance.hooks` (Read the [Configuration](#configuration) section for more details).

```ts
import Fastify from 'fastify';
import { FastifySentry } from '@serdnam/fastify-sentry';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
    sentryOptions: {
        dsn: "https://public@sentry.example.com/1",
        tracesSampleRate: 0.1,
        debug: false
    },
    performance: {
        hooks: [
        'onRequest',
        'preParsing',
        'preValidation',
        'preHandler',
        'preSerialization',
        'onSend'
        ],
    },
}
);

server.register(async function route(fastify, options) {
    fastify.get('/', async function (req, reply) {
        return { status: `OK` };
    });
}, { prefix: 'health' });


(async () => {
try {
    await server.ready();
    await server.listen({ host: '0.0.0.0', port: 4000 })
} catch (err) {
    server.log.error(err)
    process.exit(1)
}
})();
```

You can also access the current request's Sentry Transaction object by using the Transaction getter, which you can obtain by using the `getTx` symbol. You can obtain the Sentry object itself by just importing it from this package.

```ts

import Fastify from 'fastify';
import Sentry, { FastifySentry, getTx } from '@serdnam/fastify-sentry';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
        sentryOptions: {
            dsn: "https://public@sentry.example.com/1",
            tracesSampleRate: 1.0,
            debug: true
        },
        performance: {
            hooks: [
            'onRequest',
            'preParsing',
            'preValidation',
            'preHandler',
            'preSerialization',
            'onSend'
            ],
        },
    }
);

server.addHook('onRequest', async function (req, rep) {
    const tx = req[getTx]();
    tx.setTag('hookKey', 'I am setting a tag in a Fastify hook!');
})

server.register(async function route(fastify, options) {
    fastify.get('/', async function(this, req, reply) {
        const tx = req[getTx]();
        tx.setTag('requestKey', 'I am setting a tag in a route handler!');
        return { status: `OK` };
    });
}, { prefix: 'health' });


(async () => {
    try {
        await server.ready();
        await server.listen({ host: '0.0.0.0', port: 4000 })
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();

```

## Configuration

This plugin expects the following options: 

```ts
export interface FastifySentryOptions {
    sentryOptions: Sentry.NodeOptions,
    performance?: {
        hooks: string[],
    }
    closeTimeout?: number
    captureException?: boolean
}
```

* `sentryOptions`

This options object is passed to `Sentry.init()` as-is, check the [Sentry documentation](https://docs.sentry.io/platforms/node/configuration/options/) for more information about the options that can be passed here.

* `performance`

Setting this object enables performance tracking by the plugin, creating a transaction on request and ending it on response. This also decorates the Fastify Request object with a helper that returns the current transaction.

* `performance.hooks`

`performance.hooks` is an array of Fastify hook names. For each hook specified, this plugin creates a span during a request that starts at the beginning of the given hook phase and ends at the start of the next hook phase. For example, setting `performance.hooks` to 

```ts
['onRequest']
```

makes the plugin create a span within the main transaction that starts when the `onRequest` phase starts and ends when the `preParsing` starts (Read more about the Fastify request lifecycle [here](https://www.fastify.io/docs/latest/Reference/Lifecycle/)).

The `onResponse` hook is not supported.


* `captureException`

When an error occurs, and if this option is set to `true`, this plugin will call `Sentry.captureException()` on the error and will then forward the error to the next error handler. This option is `true` by default.


* `closeTimeout`

This parameter is passed as-is to the `Sentry.close()` method, see the [Sentry documentation](https://docs.sentry.io/platforms/node/configuration/draining/) for more information about this method.


## To-do

- [ ] Provide an API for setting the hook tracing only on specific routes.
- [ ] Integrate [Breadcrumbs](https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/) with Fastify's logging.
- [ ] Allow greater control over when to stop the transaction?
- [ ] Benchmarks

## Contributing

If you have any ideas, suggestions or improvements that could be made, leave an issue or a pull request!

## License

[MIT](./LICENSE)