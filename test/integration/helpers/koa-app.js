'use strict';

const Koa = require('koa');
const koaRatelimit = require('koa-ratelimit');

module.exports = ({ db, duration, max }) => {
  const app = new Koa();

  app.use(koaRatelimit({ db, duration, max }));
  app.use(ctx => {
    ctx.body = 'ok';
  });

  return app;
};
