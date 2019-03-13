/**
 *
 * ZWaveNode - represents a node on the ZWave network.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {Device, Event, Utils} = require('gateway-addon');

const padLeft = Utils.padLeft;
const padRight = Utils.padRight;
const repeatChar = Utils.repeatChar;

const {
  COMMAND_CLASS,
  GENERIC_TYPE_STR,
} = require('./zwave-constants');

const BASIC_STR = [
  '???',
  'Controller',
  'StaticController',
  'Slave',
  'RoutingSlave',
];

const {
  DEBUG_node,
} = require('./zwave-debug');
const DEBUG = DEBUG_node;

class ZWaveNode extends Device {

  constructor(adapter, nodeId) {
    // Our nodeId is a number from 1-255 and is only unique within
    // the ZWave controller. So we extend this by appending the node id
    // to the controller id and use that as the device's id.
    const deviceId = `${adapter.id.toString(16)}-${nodeId}`;
    super(adapter, deviceId);

    this.zwInfo = {
      location: '',
      nodeId: nodeId,
      manufacturer: '',
      manufacturerId: '',
      product: '',
      productId: '',
      productType: '',
      type: '',
    };

    this.nodeId = nodeId;
    this.location = '';
    this.zwClasses = [];
    this.zwValues = {};
    this.ready = false;
    this.lastStatus = 'constructed';
    this.disablePoll = false;
    this.canSleep = false;
  }

  asDict() {
    const dict = super.asDict();
    dict.lastStatus = this.lastStatus;
    dict.zwInfo = this.zwInfo;
    dict.zwClasses = this.zwClasses;
    dict.zwValues = this.zwValues;
    return dict;
  }

  centralSceneLevelTimerCallback(property, delta) {
    let newValue = Math.round(property.value + delta);
    newValue = Math.max(0, newValue);
    newValue = Math.min(100, newValue);

    DEBUG && console.log('centralSceneLevelTimerCallback:',
                         `node${this.zwInfo.nodeId}`,
                         'property:', property.name,
                         'value:', property.value,
                         'delta:', delta,
                         'newValue:', newValue);

    // Cancel the timer if we don't need it any more.
    if ((newValue == property.value) ||
        (newValue == 0 && delta < 0) ||
        (newValue == 100 && delta > 0)) {
      this.handleCentralSceneButtonStopCommand(property);
    }

    // Update the value, if it changed
    if (newValue != property.value) {
      this.setPropertyValue(property, newValue);
    }
  }

  /**
   * @method findValueId
   *
   * Searches through the valueId's associated with this node, and returns
   * the first one which matches the given criteria.
   *
   * @param {number} commandClass The command class of the valueId to find
   * @param {number} [instance] a specific instance number associated with
   *                            the valueId
   * @param {number} [index] a specific index associated with the valueId
   * @returns {String} The valueId key associated with the found value, or
   *                   undefined if no valueId was found.
   */
  findValueId(commandClass, instance, index) {
    for (const valueId in this.zwValues) {
      const value = this.zwValues[valueId];
      if (value.class_id == commandClass &&
          (typeof instance === 'undefined' || value.instance == instance) &&
          (typeof index === 'undefined' || value.index == index)) {
        return valueId;
      }
    }
  }

  findPropertyFromValueId(valueId) {
    for (const property of this.properties.values()) {
      if (property.valueId == valueId) {
        return property;
      }
    }
  }

  getSceneCount() {
    const sceneCountValueId =
      this.findValueId(COMMAND_CLASS.CENTRAL_SCENE, 1, 0);
    if (sceneCountValueId) {
      return this.zwValues[sceneCountValueId].value;
    }
    return 0;
  }

  handleCentralSceneProperty(sceneProperty) {
    DEBUG && console.log('handleCentralSceneProperty:',
                         `node${this.zwInfo.nodeId}:`,
                         'value:', sceneProperty.value);
    const onProperty = sceneProperty.info.onProperty;
    const levelProperty = sceneProperty.info.levelProperty;
    const buttonNum = sceneProperty.info.buttonNum;
    switch (sceneProperty.value) {
      case 0:   // pressed & released (short press)
        DEBUG && console.log('handleCentralSceneProperty: press',
                             'pressAction:', sceneProperty.info.pressAction);
        switch (sceneProperty.info.pressAction) {
          case 'on':
            this.setPropertyValue(onProperty, true);
            break;
          case 'off':
            this.setPropertyValue(onProperty, false);
            break;
          case 'toggle':
            this.setPropertyValue(onProperty, !onProperty.value);
            break;
        }
        this.notifyEvent(`${buttonNum}-pressed`);
        break;
      case 1:   // released (long press)
        DEBUG && console.log('handleCentralSceneProperty: release',
                             'moveDir:', sceneProperty.info.moveDir);
        if (sceneProperty.info.moveDir) {
          this.handleCentralSceneButtonStopCommand(levelProperty);
        }
        this.notifyEvent(`${buttonNum}-released`);
        sceneProperty.longPressed = false;
        break;
      case 2: { // long pressed
        DEBUG && console.log('handleCentralSceneProperty: longPress',
                             'moveDir:', sceneProperty.info.moveDir);
        if (sceneProperty.info.moveDir) {
          this.handleCentralSceneButtonMoveCommand(
            levelProperty, sceneProperty.info.moveDir);
        }
        if (!sceneProperty.longPressed) {
          this.notifyEvent(`${buttonNum}-longPressed`);
        }
        sceneProperty.longPressed = true;
        break;
      }
    }
  }

  handleCentralSceneButtonMoveCommand(property, moveDir) {
    DEBUG && console.log('handleCentralSceneButtonMoveCommand:',
                         `node${this.zwInfo.nodeId}`,
                         'property:', property.name,
                         'moveDir:', moveDir);
    // moveDir: 1 = up, -1 = down

    if (property.moveTimer) {
      // There's already a timer running.
      return;
    }

    const updatesPerSecond = 4;
    const delta = moveDir * 10;

    this.centralSceneLevelTimerCallback(property, delta);
    if ((property.value > 0 && delta < 0) ||
        (property.value < 100 && delta > 0)) {
      // We haven't hit the end, setup a timer to move towards it.
      property.moveTimer = setInterval(
        this.centralSceneLevelTimerCallback.bind(this),
        1000 / updatesPerSecond,
        property, delta);
    }
  }

  handleCentralSceneButtonStopCommand(property) {
    DEBUG && console.log('handleCentralSceneButtonStopCommand:',
                         `node${this.zwInfo.nodeId}`,
                         'property:', property.name);
    if (property.moveTimer) {
      clearInterval(property.moveTimer);
      property.moveTimer = null;
    }
  }

  handleSlideEnd(property) {
    // The value is a 32-bit number. The first 8 bits are the
    // button number, and the next 8 bits are a direction
    // (0 = down, 1 = up) and the bottom 16 bits are a position.

    const buttonNum = (property.value >> 24) & 0xff;
    const dir = (property.value >> 16) & 0xff;
    const endPosn = property.value & 0xffff;
    const startPosn = this.slideStartProperty.value & 0xffff;
    const slideSize = endPosn - startPosn;
    // 26000 was determined empirically as the size of one of
    // the squares on the WallMote Quad.
    const slidePercent = Math.round(slideSize * 100 / 26000);

    const sceneProperty = this.sceneProperty[buttonNum];
    if (!sceneProperty) {
      console.error('handleSlideEnd: node:', this.id,
                    'no sceneProperty for button', buttonNum);
      return;
    }

    const levelProperty = sceneProperty.info.levelProperty;
    if (!levelProperty) {
      console.error('handleSlideEnd: node:', this.id,
                    'no levelProperty for button', buttonNum);
    }
    let newValue = levelProperty.value + slidePercent;
    newValue = Math.max(0, newValue);
    newValue = Math.min(100, newValue);

    DEBUG && console.log('handleSlideEnd: button', buttonNum,
                         'dir:', dir,
                         'size:', slideSize,
                         `${slidePercent}%`,
                         'oldVal:', levelProperty.value,
                         'newVal:', newValue);
    if (newValue != levelProperty.value) {
      this.setPropertyValue(levelProperty, newValue);
    }
  }

  notifyEvent(eventName, eventData) {
    if (eventData) {
      console.log(this.name, 'event:', eventName, 'data:', eventData);
    } else {
      console.log(this.name, 'event:', eventName);
    }
    this.eventNotify(new Event(this, eventName, eventData));
  }

  notifyPropertyChanged(property) {
    const deferredSet = property.deferredSet;
    if (deferredSet) {
      property.deferredSet = null;
      deferredSet.resolve(property.value);
    }
    super.notifyPropertyChanged(property);

    if (property.hasOwnProperty('updated')) {
      property.updated();
    }

    if (this.canSleep) {
      // For battery powered devices, we want to write out the
      // configuration whenever a property change occurs. This
      // ensures that when we start up we'll have the best idea
      // of the last state. For mains powered devices, we'll get
      // the information during the scan, so we don't need to
      // save it here.
      const valueId = property.valueId;
      if (valueId) {
        const zwValue = this.zwValues[valueId];
        if (zwValue) {
          this.adapter.writeConfigDeferred();
        }
      }
    }
  }

  static oneLineHeader(line) {
    if (line === 0) {
      return `Node LastStat ${padRight('Basic Type', 16)} ${
        padRight('Generic Type', 19)} ${padRight('Spec', 4)} ${
        padRight('Product Name', 40)} ${padRight('Name', 30)}`;
    }
    return `${repeatChar('-', 4)} ${repeatChar('-', 8)} ${
      repeatChar('-', 16)} ${repeatChar('-', 19)} ${repeatChar('-', 4)} ${
      repeatChar('-', 40)} ${repeatChar('-', 30)}`;
  }

  oneLineSummary() {
    const nodeId = this.zwInfo.nodeId;
    const zwave = this.adapter.zwave;

    const basic = zwave.getNodeBasic(nodeId);
    const basicStr =
      (basic >= 1 && basic < BASIC_STR.length) ?
        BASIC_STR[basic] :
        `??? ${basic} ???`;

    const generic = zwave.getNodeGeneric(nodeId);
    const genericStr = GENERIC_TYPE_STR[generic] ||
                      `Unknown 0x${generic.toString(16)}`;

    const specific = zwave.getNodeSpecific(nodeId);
    const specificStr = `0x${specific.toString(16)}`;

    return `${padLeft(nodeId, 3)}: ${padRight(this.lastStatus, 8)} ${
      padRight(basicStr, 16)} ${padRight(genericStr, 19)} ${
      padRight(specificStr, 4)} ${padRight(this.zwInfo.product, 40)} ${
      padRight(this.name, 30)}`;
  }

  // Used to set properties which don't have an associated valueId
  setPropertyValue(property, value) {
    property.setCachedValue(value);
    const units = property.units || '';
    console.log('node%d setPropertyValue: %s = %s%s',
                this.zwInfo.nodeId, property.name, value, units);
    this.notifyPropertyChanged(property);
  }

  zwValueAdded(comClass, zwValue) {
    this.lastStatus = 'value-added';
    if (this.zwClasses.indexOf(comClass) < 0) {
      this.zwClasses.push(comClass);
    }
    this.zwValues[zwValue.value_id] = zwValue;
    let units = '';
    if (zwValue.units) {
      units = ` ${zwValue.units}`;
    }

    let propertyFound = false;
    this.properties.forEach((property) => {
      if (property.valueId == zwValue.value_id) {
        propertyFound = true;
        const [value, logValue] = property.parseZwValue(zwValue.value);
        property.setCachedValue(value);
        console.log('node%d valueAdded: %s:%s property: %s = %s%s',
                    this.zwInfo.nodeId, zwValue.value_id, zwValue.label,
                    property.name, logValue, units);
      }
    });
    if (!propertyFound && (zwValue.genre === 'user' || DEBUG)) {
      console.log('node%d valueAdded: %s:%s = %s%s',
                  this.zwInfo.nodeId, zwValue.value_id,
                  zwValue.label, zwValue.value, units);
    }
    if (zwValue.genre === 'user' && !this.defaultName) {
      // We use the label from the first 'user' value that we see to help
      // disambiguate different nodes.
      this.defaultName = `${this.id}-${zwValue.label}`;

      // Assign a name if we don't yet have one.
      if (!this.name) {
        this.name = this.defaultName;
      }
    }
  }

  zwValueChanged(comClass, zwValue) {
    this.lastStatus = 'value-changed';
    this.zwValues[zwValue.value_id] = zwValue;
    let units = '';
    if (zwValue.units) {
      units = ` ${zwValue.units}`;
    }

    let propertyFound = false;
    this.properties.forEach((property) => {
      if (property.valueId == zwValue.value_id) {
        propertyFound = true;
        const [value, logValue] = property.parseZwValue(zwValue.value);
        property.setCachedValue(value);
        console.log('node%d valueChanged: %s:%s property: %s = %s%s',
                    this.zwInfo.nodeId, zwValue.value_id, zwValue.label,
                    property.name, logValue, units);
        this.notifyPropertyChanged(property);
      }
    });
    if (!propertyFound) {
      console.log('node%d valueChanged: %s:%s = %s%s (no property found)',
                  this.zwInfo.nodeId, zwValue.value_id,
                  zwValue.label, zwValue.value, units);
    }
  }

  zwValueRemoved(comClass, instance, index) {
    this.lastStatus = 'value-removed';
    const valueId = `${this.zwInfo.nodeId}-${comClass}-${instance}-${index}`;
    const zwValue = this.zwValues[valueId];
    if (zwValue) {
      let units = '';
      if (zwValue.units) {
        units = ` ${zwValue.units}`;
      }
      delete this.zwValues[valueId];
      let propertyFound = false;
      this.properties.forEach((property) => {
        if (property.valueId == zwValue.value_id) {
          propertyFound = true;
          const [_value, logValue] = property.parseZwValue(zwValue.value);
          delete property.valueId;
          delete property.value;
          console.log('node%d valueRemoved: %s:%s %s property: %s = %s%s',
                      this.zwInfo.nodeId, zwValue.value_id, zwValue.label,
                      property.name, logValue, units);
        }
      });
      if (!propertyFound) {
        console.log('node%d valueRemoved: %s:%s = %s%s',
                    this.zwInfo.nodeId, zwValue.value_id,
                    zwValue.label, zwValue.value, units);
      }
    } else {
      console.log('zwValueRemoved unknown valueId:', valueId);
    }
  }
}

module.exports = ZWaveNode;
