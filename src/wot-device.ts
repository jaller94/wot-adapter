/**
 * wot-device.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */
import { WoTAdapter } from './wot-adapter';
import { Action, Device, Event, Property } from 'gateway-addon';
import * as schema from 'gateway-addon/lib/schema';
import { ConsumedThing, Subscription } from 'wot-typescript-definitions';

import { WoTDeviceProperty } from './wot-device-property';
export default class WoTDevice extends Device {
  private readonly _thing: ConsumedThing;

  private openHandles: (NodeJS.Timeout | Subscription)[];

  public get thing(): ConsumedThing {
    return this._thing;
  }

  public start(): void {
    const td = this.thing.getThingDescription();
    if (td.properties) {
      const properties = td.properties as { [k: string]: schema.Property };
      for (const propertyName in properties) {
        const deviceProperty = this.findProperty(propertyName);
        deviceProperty && this.observeProperty(td, deviceProperty);
      }
    }
    if (td.events) {
      const events = td.events as { [k: string]: schema.Event };
      for (const eventName in events) {
        this.subscribeEvent(eventName);
      }
    }
  }

  public constructor(
    adapter: WoTAdapter,
    id: string,
    thing: ConsumedThing,
    private configuration = { useObservable: false },
  ) {
    super(adapter, id);
    this._thing = thing;
    this.openHandles = [];

    const td = thing.getThingDescription();

    this.setTitle(td.title);
    this.setTypes(typeof td['@type'] === 'string' ? [td['@type']] : (td['@type'] ?? []));
    this.setDescription(td.description ?? '');
    this.setContext('https://www.w3.org/2019/wot/td/v1');

    if (td.links) {
      const links = td.links as schema.Link[];
      for (const link of links) {
        this.addLink(link);
      }
    }

    if (td.properties) {
      const properties = td.properties as { [k: string]: schema.Property };
      for (const propertyName in properties) {
        const property = properties[propertyName];
        const deviceProperty = new WoTDeviceProperty(this, propertyName, property);
        this.addProperty(deviceProperty);
      }
    }

    if (td.actions) {
      const actions = td.actions as { [k: string]: schema.Action };
      for (const actionName in actions) {
        const action = actions[actionName];
        this.addAction(actionName, action);
      }
    }

    if (td.events) {
      const events = td.events as { [k: string]: schema.Event };
      for (const eventName in events) {
        const event = events[eventName];
        this.addEvent(eventName, event);
      }
    }
  }

  public async performAction(action: Action): Promise<void> {
    // Note: currently invoking an Action is a syncronous operation.
    action.start();
    try {
      await this.thing.invokeAction(action.getName(), action.getInput());
      // TODO: correctly handle the output. WebThingAPI does not have action outputs
    } catch (error) {
      console.log(`Failed to perform action: ${error}`);
      // TODO: The status field is private and there is no setter for it
      // action.status = 'error';
      this.actionNotify(action);
    } finally {
      action.finish();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observeProperty(td: Record<string, unknown>, property: Property<any>): void {
    const properties = td.properties as Record<string, schema.Property>;
    const schProp: schema.Property = properties[property.getName()];
    // cannot observe write only
    if (schProp.writeOnly === true) {
      return;
    }
    // see if it can be observerd
    if (schProp.observable && this.configuration.useObservable) {
      this.thing
        .observeProperty(property.getName(), async (value) => {
          const actualValue = await value.value();
          property.setCachedValueAndNotify(actualValue);
        })
        .then((subscription) => {
          this.openHandles.push(subscription);
        });
    } else {
      const timeout = setInterval(async () => {
        const output = await this.thing.readProperty(property.getName());
        const value = await output.value();
        property.setCachedValueAndNotify(value);
      }, 5000); // TODO: add configuration parameter
      this.openHandles.push(timeout);
    }
  }

  private subscribeEvent(eventName: string): void {
    this.thing
      .subscribeEvent(eventName, async (data) => {
        const value = await data.value();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.eventNotify(new Event(this, eventName, value as any));
      })
      .then((subscription) => {
        this.openHandles.push(subscription);
      });
  }

  public destroy(): void {
    // close all the open handles
    for (const handle of this.openHandles) {
      if (typeof handle === 'object' && handle && 'stop' in handle) {
        // This is a subscription object with a stop method
        handle.stop();
      } else {
        clearInterval(handle);
      }
    }
  }
}
