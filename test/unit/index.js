'use strict';

const chai = require('chai');
const dirtyChai = require('dirty-chai');

const throttlify = require('../../lib');
const Throttler = require('../../lib/throttler');

const { expect } = chai;

chai.use(dirtyChai);

describe('module: throttlify', () => {
  it('should export the "throttlify" static method from the "Throttler" class', () => {
    expect(throttlify).to.equal(Throttler.throttlify);
  });
});
