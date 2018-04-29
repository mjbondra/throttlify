'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const fetch = require('node-fetch');
const Redis = require('ioredis');

const koaApp = require('./helpers/koa-app');
const throttlify = require('../../lib');

const { expect } = chai;
const { env } = process;

const config = {
  node: {
    host: env.NODE_HOST || 'localhost',
    port: env.NODE_PORT || 3000
  },
  redis: {
    db: env.REDIS_DB || 0,
    host: env.REDIS_HOST || 'localhost',
    password: env.REDIS_PASSWORD || null,
    port: env.REDIS_PORT || 6379
  }
};

chai.use(dirtyChai);

describe('integration', () => {
  let app;
  let db;
  let errorMessage;
  let opts;
  let server;
  let url;

  before(() => {
    db = new Redis(config.redis);
    errorMessage = 'rate limit exceeded';
    opts = { duration: 1000, max: 2 };
    app = koaApp({ db, errorMessage, ...opts });
    server = app.listen(config.node);
  });

  after(async () => {
    await db.disconnect();
    server.close();
  });

  beforeEach(async () => {
    url = `http://${config.node.host}:${config.node.port}`;
    await fetch(url); // prime
    await new Promise(resolve => setTimeout(resolve, opts.duration)); // delay
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, opts.duration)); // delay
  });

  describe('happy path', () => {
    it('should throttle requests and not exceed the rate limit of the server', async () => {
      const throttledFetch = throttlify(fetch, opts);
      const requests = Array.from(new Array(opts.max * 4)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const jsonArray = await Promise.all(responses.map(response => response.json()));
      jsonArray.forEach(body => expect(body.count).to.be.a('number'));
    });
  });

  describe('non-throttled function', () => {
    it('should exceed the rate limit of the server', async () => {
      const requests = Array.from(new Array(opts.max * 4)).map(() => fetch(url));
      const responses = await Promise.all(requests);
      const jsonArray = await Promise.all(responses.map(response => response.json()));
      jsonArray.forEach((body, index) => {
        if (index >= opts.max) expect(body.message).to.equal(errorMessage);
        else expect(body.count).to.be.a('number');
      });
    });
  });

  describe('throttled function that is improperly tuned', () => {
    it('should exceed the rate limit of the server when max is too high', async () => {
      const elevatedMax = opts.max + 1;
      const throttledFetch = throttlify(fetch, { ...opts, max: elevatedMax });
      const requests = Array.from(new Array(elevatedMax)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const jsonArray = await Promise.all(responses.map(response => response.json()));
      expect(jsonArray[opts.max].message).to.equal(errorMessage);
    });

    it('should exceed the rate limit of the server when duration is too small', async () => {
      const shrunkenDuration = opts.duration / 2;
      const throttledFetch = throttlify(fetch, { ...opts, duration: shrunkenDuration });
      const requests = Array.from(new Array(opts.max * 2)).map(() => throttledFetch(url));
      const responses = await Promise.all(requests);
      const jsonArray = await Promise.all(responses.map(response => response.json()));
      jsonArray.forEach((body, index) => {
        if (index >= opts.max) expect(body.message).to.equal(errorMessage);
        else expect(body.count).to.be.a('number');
      });
    });
  });
});
