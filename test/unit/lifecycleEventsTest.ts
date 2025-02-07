/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Duration, sleep } from '@salesforce/kit/lib/duration';
import { spyMethod } from '@salesforce/ts-sinon';
import * as chai from 'chai';
import { Lifecycle } from '../../src/lifecycleEvents';
import { TestContext } from '../../src/testSetup';

describe('lifecycleEvents', () => {
  const $$ = new TestContext();
  class Foo {
    // eslint-disable-next-line @typescript-eslint/ban-types, class-methods-use-this
    public bar(name: string, result: {}) {
      return result[name] as string;
    }
  }

  let fakeSpy;
  let loggerSpy;
  const fake = new Foo();

  beforeEach(() => {
    loggerSpy = spyMethod($$.SANDBOX, Lifecycle.getInstance(), 'debug');
    fakeSpy = spyMethod($$.SANDBOX, fake, 'bar');
  });

  afterEach(() => {
    $$.SANDBOX.restore();
  });

  it('getInstance is a functioning singleton pattern', async () => {
    chai.assert(Lifecycle.getInstance() === Lifecycle.getInstance());
  });

  it('provides a version on both the static and instance', async () => {
    chai.assert(Lifecycle.getInstance().version() === Lifecycle.staticVersion());
  });

  it('getInstance is on the global object to protect against npm version dependency mismatch', async () => {
    // @ts-ignore don't declare the type in the test
    chai.assert(Lifecycle.getInstance() === global.salesforceCoreLifecycle);
  });

  it('handles the warnings and telemetry events', async () => {
    Lifecycle.getInstance().onWarning(async (result) => {
      fake.bar('test1', result);
    });
    Lifecycle.getInstance().onTelemetry(async (result) => {
      fake.bar('test1', result);
    });
    chai.expect(fakeSpy.callCount).to.be.equal(0);

    await Lifecycle.getInstance().emitWarning('This is a warning');
    chai.expect(fakeSpy.callCount).to.be.equal(1);
    chai.expect(fakeSpy.args[0][1]).to.be.equal('This is a warning');

    await Lifecycle.getInstance().emitTelemetry({ foo: 6, bar: 'nope' });
    chai.expect(fakeSpy.callCount).to.be.equal(2);
    chai.expect(fakeSpy.args[1][1]).to.deep.equal({ foo: 6, bar: 'nope' });

    Lifecycle.getInstance().removeAllListeners('warning');
    Lifecycle.getInstance().removeAllListeners('telemetry');
  });

  it('successful event registration and emitting causes the callback to be called', async () => {
    Lifecycle.getInstance().on('test1', async (result) => {
      fake.bar('test1', result);
    });
    Lifecycle.getInstance().on('test2', async (result) => {
      fake.bar('test1', result);
    });
    chai.expect(fakeSpy.callCount).to.be.equal(0);

    await Lifecycle.getInstance().emit('test1', 'Success');
    chai.expect(fakeSpy.callCount).to.be.equal(1);
    chai.expect(fakeSpy.args[0][1]).to.be.equal('Success');

    await Lifecycle.getInstance().emit('test2', 'Also Success');
    chai.expect(fakeSpy.callCount).to.be.equal(2);
    chai.expect(fakeSpy.args[1][1]).to.be.equal('Also Success');

    Lifecycle.getInstance().removeAllListeners('test1');
    Lifecycle.getInstance().removeAllListeners('test2');
  });

  it('an event registering twice logs a warning but creates two listeners that both fire when emitted', async () => {
    Lifecycle.getInstance().on('test3', async (result) => {
      fake.bar('test3', result);
    });
    Lifecycle.getInstance().on('test3', async (result) => {
      await sleep(Duration.milliseconds(1));
      fake.bar('test3', result);
    });
    chai.expect(loggerSpy.callCount).to.be.equal(1);
    chai
      .expect(loggerSpy.args[0][0])
      .to.be.equal(
        '2 lifecycle events with the name test3 have now been registered. When this event is emitted all 2 listeners will fire.'
      );

    await Lifecycle.getInstance().emit('test3', 'Two Listeners');
    chai.expect(fakeSpy.callCount).to.be.equal(2);
    Lifecycle.getInstance().removeAllListeners('test3');
  });

  it('emitting an event that is not registered logs a warning and will not call the callback', async () => {
    await Lifecycle.getInstance().emit('test4', 'Expect failure');
    chai.expect(fakeSpy.callCount).to.be.equal(0);
    chai.expect(loggerSpy.callCount).to.be.equal(1);
    chai
      .expect(loggerSpy.args[0][0])
      .to.be.equal(
        'A lifecycle event with the name test4 does not exist. An event must be registered before it can be emitted.'
      );
    Lifecycle.getInstance().removeAllListeners('test4');
  });

  it('removeAllListeners works', async () => {
    Lifecycle.getInstance().on('test5', async (result) => {
      fake.bar('test5', result);
    });
    await Lifecycle.getInstance().emit('test5', 'Success');
    chai.expect(fakeSpy.callCount).to.be.equal(1);
    chai.expect(fakeSpy.args[0][1]).to.be.equal('Success');

    Lifecycle.getInstance().removeAllListeners('test5');
    await Lifecycle.getInstance().emit('test5', 'Failure: Listener Removed');
    chai.expect(fakeSpy.callCount).to.be.equal(1);
    chai.expect(loggerSpy.callCount).to.be.equal(1);
    chai
      .expect(loggerSpy.args[0][0])
      .to.be.equal(
        'A lifecycle event with the name test5 does not exist. An event must be registered before it can be emitted.'
      );
  });

  it('getListeners works', async () => {
    const x = async (result) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      fake.bar('test6', result);
    };
    Lifecycle.getInstance().on('test6', x);
    chai.expect(Lifecycle.getInstance().getListeners('test6')).to.have.lengthOf(1);
    chai.expect(Lifecycle.getInstance().getListeners('test6')[0]).to.deep.equal(x);

    chai.expect(Lifecycle.getInstance().getListeners('undefinedKey').length).to.be.equal(0);
    Lifecycle.getInstance().removeAllListeners('test6');
  });

  it('will use a newer version and transfer the listeners', () => {
    // the original
    const lifecycle = Lifecycle.getInstance();
    lifecycle.on('test7', async (result) => {
      fake.bar('test7', result);
    });
    $$.SANDBOX.stub(Lifecycle, 'staticVersion').returns('999999.0.0');

    // the replacement version
    const lifecycle2 = Lifecycle.getInstance();

    chai.expect(lifecycle2.getListeners('test7')).to.have.lengthOf(1);
    // original instance's listeners are removed
    chai.expect(lifecycle.getListeners('test7')).to.have.lengthOf(0);
    lifecycle2.removeAllListeners('test7');
  });
});
