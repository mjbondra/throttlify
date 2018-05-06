'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const fetch = require('node-fetch');
const Redis = require('ioredis');

const koaApp = require('./helpers/koa-app');
const throttlify = require('../../lib');
const Throttler = require('../../lib/throttler');

const { expect } = chai;
const { env } = process;

const config = {
  node: {
    host: env.NODE_HOST || 'localhost',
    port: env.NODE_PORT || 3000
  },
  redis: {
    host: env.REDIS_HOST || 'localhost',
    options: {
      db: env.REDIS_DB || 0,
      password: env.REDIS_PASSWORD || null
    },
    port: env.REDIS_PORT || 6379
  }
};

chai.use(dirtyChai);

describe('integration', () => {
  let allowance;
  let app;
  let db;
  let delay;
  let opts;
  let server;
  let url;

  before(() => {
    allowance = 20;
    db = new Redis(config.redis.port, config.redis.host, config.redis.options);
    opts = { duration: 1000, max: 20 };
    delay = opts.duration + allowance;
    app = koaApp({ db, ...opts });
    server = app.listen(config.node);
  });

  after(async () => {
    await db.disconnect();
    server.close();
  });

  beforeEach(async () => {
    url = `http://${config.node.host}:${config.node.port}`;
  });

  afterEach(async () => {
    await Throttler.durationPause(delay);
  });

  describe('happy path', () => {
    it('should throttle requests and not exceed the rate limit of the server', async () => {
      const n = opts.max + 1;
      const throttledFetch = throttlify(fetch, { ...opts, duration: delay });
      const requests = Array.from(new Array(n)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const successes = responses.filter(res => res.status >= 200 && res.status < 400);
      const errors = responses.filter(res => res.status >= 400);
      expect(successes.length).to.equal(n);
      expect(errors.length).to.equal(0);
    });
  });

  describe('non-throttled function', () => {
    it('should exceed the rate limit of the server', async () => {
      const n = opts.max + 1;
      const requests = Array.from(new Array(n)).map(() => fetch(url));
      const responses = await Promise.all(requests);
      const successes = responses.filter(res => res.status >= 200 && res.status < 400);
      const errors = responses.filter(res => res.status >= 400);
      expect(successes.length).to.equal(opts.max);
      expect(errors.length).to.equal(n - opts.max);
      errors.map(res => expect(res.status).to.equal(429));
    });
  });

  describe('throttled function that is improperly tuned', () => {
    it('should exceed the rate limit of the server when max is too high', async () => {
      const n = opts.max + 1;
      const throttledFetch = throttlify(fetch, { ...opts, max: n });
      const requests = Array.from(new Array(n)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const successes = responses.filter(res => res.status >= 200 && res.status < 400);
      const errors = responses.filter(res => res.status >= 400);
      expect(successes.length).to.equal(opts.max);
      expect(errors.length).to.equal(n - opts.max);
      errors.map(res => expect(res.status).to.equal(429));
    });

    it('should exceed the rate limit of the server when duration is too small', async () => {
      const n = opts.max + 1;
      const throttledFetch = throttlify(fetch, { ...opts, duration: opts.duration / 2 });
      const requests = Array.from(new Array(n)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const successes = responses.filter(res => res.status >= 200 && res.status < 400);
      const errors = responses.filter(res => res.status >= 400);
      expect(successes.length).to.equal(opts.max);
      expect(errors.length).to.equal(n - opts.max);
      errors.map(res => expect(res.status).to.equal(429));
    });
  });
});
