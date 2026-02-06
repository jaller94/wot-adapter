import chai, { expect } from 'chai';
import WoTDevice from '../src/wot-device';
import { stubInterface } from 'ts-sinon';
import { ConsumedThing } from '@node-wot/core';
import * as WoT from 'wot-typescript-definitions';
import { WoTAdapter } from '../src/wot-adapter';
import sinon, { fake, SinonStub, spy } from 'sinon';
import { AddonManagerProxy, Event } from 'gateway-addon';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);

describe('WoT Device tests', () => {
  let testDevice: WoTDevice;

  const mockConsumedThing = stubInterface<ConsumedThing>();
  const mockAdapter = stubInterface<WoTAdapter>();
  const mockManager = stubInterface<AddonManagerProxy>();


  beforeEach(() => {
    mockAdapter.getManager.returns(mockManager);
  });

  afterEach(() => {
    sinon.reset();
    testDevice && testDevice.destroy();
  });

  it('Should write property', () => {
    const td = {
      '@context': 'https://www.w3.org/2019/wot/td/v1',
      title: 'Test Thing',
      securityDefinitions: {
        nosec: { scheme: 'nosec' }
      },
      security: ['nosec'],
      properties: {
        test: {
          type: 'number',
          forms: [{ href: 'http://example.com/test' }]
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td as any);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    testDevice.start();
    testDevice.setProperty('test', 1);
    expect(mockConsumedThing.writeProperty).calledOnceWith('test', 1);
    testDevice.destroy();
  });

  it('Should read property', async () => {
    const td = {
      '@context': 'https://www.w3.org/2019/wot/td/v1',
      title: 'Test Thing',
      securityDefinitions: {
        nosec: { scheme: 'nosec' }
      },
      security: ['nosec'],
      properties: {
        test: {
          type: 'number',
          forms: [{ href: 'http://example.com/test' }]
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td as any);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    testDevice.start();
    const mockOutput = {
      value: () => Promise.resolve(1),
      dataUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      data: undefined,
      form: undefined,
      schema: undefined
    };
    mockConsumedThing.readProperty.returns(Promise.resolve(mockOutput));
    const value = await testDevice.getProperty('test');

    expect(value).be.eqls(1);
    expect(mockConsumedThing.readProperty).calledOnceWith('test');
  });

  it('Should invoke an action', async () => {
    const td = {
      '@context': 'https://www.w3.org/2019/wot/td/v1',
      title: 'Test Thing',
      securityDefinitions: {
        nosec: { scheme: 'nosec' }
      },
      security: ['nosec'],
      actions: {
        test: {
          input: {
            type: 'number',
          },
          forms: [{ href: 'http://example.com/test' }]
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td as any);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    testDevice.start();
    await testDevice.requestAction('1234', 'test', 1);

    expect(mockConsumedThing.invokeAction).calledOnceWith('test', 1);
  });

  it('Should fire events', async () => {
    const td = {
      '@context': 'https://www.w3.org/2019/wot/td/v1',
      title: 'Test Thing',
      securityDefinitions: {
        nosec: { scheme: 'nosec' }
      },
      security: ['nosec'],
      events: {
        test: {
          type: 'number',
          forms: [{ href: 'http://example.com/test' }]
        },
      },
    };
    let eventCallback: WoT.WotListener;
    const mockSubscription = { active: true, stop: () => Promise.resolve() };
    const subscribe: SinonStub<[name: string,
      listener: WoT.WotListener,
      errorListener?: WoT.ErrorListener | undefined,
      options?: WoT.InteractionOptions | undefined],
    Promise<WoT.Subscription>> = fake((event: string, callback: WoT.WotListener) => {
      eventCallback = callback;
      return Promise.resolve(mockSubscription);
    }) as SinonStub<[name: string,
      listener: WoT.WotListener, errorListener?: WoT.ErrorListener | undefined, options?:
      WoT.InteractionOptions | undefined], Promise<WoT.Subscription>>;

    mockConsumedThing.subscribeEvent = subscribe;
    mockConsumedThing.getThingDescription.returns(td as any);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    testDevice.start();
    const eventNotifySpy = spy(testDevice, 'eventNotify');

    const mockEventOutput = {
      value: () => Promise.resolve(1),
      dataUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      data: undefined,
      form: undefined,
      schema: undefined
    };
    eventCallback!(mockEventOutput);

    expect(eventNotifySpy).calledOnceWith(new Event(testDevice, 'test', 1));

    expect(mockConsumedThing.subscribeEvent).calledOnceWith('test');
  });

  it('Should update property using observable', async () => {
    const td = {
      '@context': 'https://www.w3.org/2019/wot/td/v1',
      title: 'Test Thing',
      securityDefinitions: {
        nosec: { scheme: 'nosec' }
      },
      security: ['nosec'],
      properties: {
        test: {
          type: 'number',
          observable: true,
          forms: [{ href: 'http://example.com/test' }]
        },
      },
    };
    let propertyChangeListener: WoT.WotListener;
    const mockSubscription = { active: true, stop: () => Promise.resolve() };
    const subscribe: SinonStub<[name: string,
      listener: WoT.WotListener,
      errorListener?: WoT.ErrorListener | undefined,
      options?: WoT.InteractionOptions | undefined],
    Promise<WoT.Subscription>> = fake((event: string, callback: WoT.WotListener) => {
      propertyChangeListener = callback;
      return Promise.resolve(mockSubscription);
    }) as SinonStub<[name: string,
        listener: WoT.WotListener, errorListener?: WoT.ErrorListener | undefined, options?:
        WoT.InteractionOptions | undefined], Promise<WoT.Subscription>>;

    mockConsumedThing.observeProperty = subscribe;
    mockConsumedThing.getThingDescription.returns(td as any);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing, { useObservable: true });
    const notifySpy = sinon.spy(testDevice.findProperty('test')!, 'setCachedValueAndNotify');
    testDevice.start();
    expect(subscribe).calledOnce;

    const mockPropertyOutput = {
      value: () => Promise.resolve(1),
      dataUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      data: undefined,
      form: undefined,
      schema: undefined
    };
    propertyChangeListener!(mockPropertyOutput);

    expect(notifySpy).calledOnceWith(1);

    // eslint-disable-next-line dot-notation
    expect(testDevice.findProperty('test')?.['value']).to.be.eqls(1);
  });
});
