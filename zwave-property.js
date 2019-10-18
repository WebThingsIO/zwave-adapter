/**
 * ZWave Property.
 *
 * Object which decscribes a property, and its value.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const Color = require('color');
const {Deferred, Property} = require('gateway-addon');
const {
  COMMAND_CLASS,
} = require('./zwave-constants');

// Refer to ZWave document SDS13781 "Z-Wave Application Command Class
// Specification". In the Notification Type and Event fields. These
// constants come from the "Event" column for the "Home Security (V2)
// section".
const ALARM_EVENT_HOME_SECURITY_CLEAR = 0;
const ALARM_EVENT_HOME_SECURITY_TAMPER = 3;
const ALARM_EVENT_HOME_SECURITY_MOTION = 8;

class ZWaveProperty extends Property {
  constructor(device, name, propertyDescr, valueId,
              setZwValueFromValue, parseValueFromZwValue) {
    super(device, name, propertyDescr);

    this.valueId = valueId;

    if (!setZwValueFromValue) {
      setZwValueFromValue = 'setIdentityValue';
    }
    this.setZwValueFromValue = Object.getPrototypeOf(this)[setZwValueFromValue];
    if (!this.setZwValueFromValue) {
      const err = `Unknown function: ${setZwValueFromValue}`;
      console.error(err);
      throw err;
    }

    if (!parseValueFromZwValue) {
      parseValueFromZwValue = 'parseIdentityValue';
    }
    this.parseValueFromZwValue =
      Object.getPrototypeOf(this)[parseValueFromZwValue];
    if (!this.parseValueFromZwValue) {
      const err = `Unknown function: ${parseValueFromZwValue}`;
      console.error(err);
      throw err;
    }

    const zwValue = device.zwValues[valueId];
    if (zwValue) {
      const [value, _logValue] = this.parseValueFromZwValue(zwValue.value);
      this.value = value;
    }
  }

  asDict() {
    const dict = super.asDict();
    dict.valueId = this.valueId;
    dict.value = this.value;
    return dict;
  }

  parseAlarmMotionZwValue(zwData) {
    let motion = this.value;
    switch (zwData) {
      case ALARM_EVENT_HOME_SECURITY_CLEAR:
        motion = false;
        break;
      case ALARM_EVENT_HOME_SECURITY_MOTION:
        motion = true;
        break;
    }
    if (typeof motion === 'undefined') {
      motion = false;
    }
    return [motion, motion.toString()];
  }

  parseAlarmTamperZwValue(zwData) {
    let tamper = this.value;
    switch (zwData) {
      case ALARM_EVENT_HOME_SECURITY_CLEAR:
        tamper = false;
        break;
      case ALARM_EVENT_HOME_SECURITY_TAMPER:
        tamper = true;
        break;
    }
    if (typeof tamper === 'undefined') {
      tamper = false;
    }
    return [tamper, tamper.toString()];
  }

  parseConfigListZwValue(zwData) {
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue) {
      const value = zwValue.value;
      return [value, `${value} (zw: ${zwData})`];
    }
    return ['', `valueId: ${this.valueId} not found - using ''`];
  }

  parseRRGGBBWWCWColorValue(zwData) {
    if (typeof this.value !== 'undefined') {
      // The Aeotec LED Strip never returns the value that was set
      // so we set fireAndForget to true (in the classifier) and ignore
      // updates.
      zwData = this.value;
    }
    return [zwData, zwData];
  }

  parseConfigRGBXZwValue(zwData) {
    const red = (zwData >> 24) & 0xff;
    const green = (zwData >> 16) & 0xff;
    const blue = (zwData >> 8) & 0xff;

    const color = new Color({r: red, g: green, b: blue});
    const colorStr = color.rgb().hex();

    return [colorStr, `0x${zwData.toString(16)}`];
  }

  parseIdentityValue(zwData) {
    const propertyValue = zwData;
    return [propertyValue, propertyValue.toString()];
  }

  parseOnOffLevelZwValue(zwData) {
    // For devices (like the Aeotec ZW099) which support level but don't
    // support on/off we fake on/off
    const ret = this.parseLevelZwValue(zwData);
    if (this.name === 'on') {
      const value = this.level > 0;
      return [value, `${value}`];
    }
    return ret;
  }

  parseLevelZwValue(zwData) {
    this.level = Math.max(zwData, 0);
    let percent = this.level;
    if (zwData >= 99) {
      percent = 100;
    }
    return [
      percent,
      `${percent.toFixed(1)}% (zw: ${this.level})`,
    ];
  }

  // Convert a boolean into a LockedProperty
  parseZwDoorLocked(zwData) {
    const value = zwData ? 'unlocked' : 'locked';
    return [value, `${value} zw: zwData`];
  }

  parseZwStringToLowerCase(zwData) {
    const value = zwData.toString().toLowerCase();
    return [value, `${value} zw: ${zwData}`];
  }

  parseTemperatureZwValue(zwData) {
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue.units === 'F') {
      return [(zwData - 32) / 1.8, `zw: ${zwData} F`];
    }
    return [zwData, `zw: ${zwData} C`];
  }

  parseZwValue(zwData) {
    return this.parseValueFromZwValue(zwData);
  }

  parseZwValueListMap(zwData) {
    let value = false;
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue && zwValue.hasOwnProperty('values')) {
      const valueIdx = zwValue.values.indexOf(zwData);
      if (valueIdx >= 0 &&
          this.hasOwnProperty('valueListMap') &&
          valueIdx < this.valueListMap.length) {
        value = this.valueListMap[valueIdx];
      }
    }
    return [value, `${value} zw:${zwData}`];
  }

  parseZwValueMap(zwData) {
    let value = false;
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue && this.hasOwnProperty('valueMap')) {
      if (zwData.startsWith(this.valueMap[1])) {
        value = true;
      }
    }
    return [value, `${value} zw:${zwData}`];
  }

  setRRGGBBWWCWColorValue(value) {
    return [value, value];
  }

  setConfigListValue(value) {
    // For a list, the value will be a string. Find the matching
    // string.
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue) {
      const idx = zwValue.values.indexOf(value);
      if (idx < 0) {
        return [0, `${value} not found - using 0`];
      }
      return [idx, `${value} (${idx})`];
    }
    return [0, `valueId ${this.valueId} not found - using 0`];
  }

  setConfigRGBXValue(value) {
    const color = new Color(value);
    const rgb = color.rgb();

    const zwData = (rgb.red() << 24) | (rgb.green() << 16) | (rgb.blue() << 8);

    return [zwData, rgb.hex()];
  }

  setIdentityValue(propertyValue) {
    const zwData = propertyValue;
    return [zwData, zwData.toString()];
  }

  setLowerCaseValue(value) {
    value = value.toLowerCase();
    const zwValue = this.device.zwValues[this.valueId];
    if (!zwValue || !zwValue.values) {
      return [value, value.toString()];
    }
    const idx = this.lowerCaseValues.indexOf(value);
    if (idx < 0) {
      return [value, value.toString()];
    }
    const zwData = zwValue.values[idx];
    return [zwData, `${value} zw: ${zwData}`];
  }

  setTemperatureValue(value) {
    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue.units === 'F') {
      const zwData = value * 1.8 + 32;
      return [zwData, `${value}C zw:${zwData}F`];
    }
    return [value, `${value}C zw:${value}C`];
  }

  /**
   * @method setOnOffLevelValue
   *
   * Special function used when a device only supports level and doesn't
   * support on/off.
   */
  setOnOffLevelValue(value) {
    let percent;
    if (this.name === 'on') {
      percent = value ? 100 : 0;
    } else {
      percent = value;
    }
    return this.setLevelValue(percent);
  }

  /**
   * @method setLevelValue
   *
   * The ZWave spec for COMMAND_CLASS_SWITCH_MULTILEVEL maps the values
   * 0-99 onto 0%-100%
   *
   * For simplicity we treat it as an identity mapping but treat 99%
   * and 100% as the same.
   */
  setLevelValue(percent) {
    if (typeof percent !== 'number') {
      console.error('setLevelValue passed a non-numeric percentage:',
                    percent, '- ignoring');
      return;
    }
    if (this.hasOwnProperty('min')) {
      percent = Math.max(percent, this.min);
    }
    if (this.hasOwnProperty('max')) {
      percent = Math.min(percent, this.max);
    }
    this.level = Math.round(Math.min(Math.max(percent, 0), 99));

    return [
      this.level,
      `zw: ${this.level} (${percent.toFixed(1)}%)`,
    ];
  }

  /**
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(propertyValue) {
    let deferredSet = this.deferredSet;
    if (!deferredSet) {
      deferredSet = new Deferred();
      this.deferredSet = deferredSet;
    }

    if (!this.valueId) {
      // This happens for "fake" properties which interact with real
      // properties.
      this.setCachedValue(propertyValue);
      this.device.notifyPropertyChanged(this);
      return deferredSet.promise;
    }

    const zwValue = this.device.zwValues[this.valueId];
    if (zwValue.read_only) {
      deferredSet.reject(
        `setProperty property ${this.name} for node ${this.device.id
        } is read-only`);
      return deferredSet.promise;
    }

    this.setCachedValue(propertyValue);

    const [zwValueData, logData] = this.setZwValueFromValue(propertyValue);

    console.log('setProperty property:', this.name,
                'for:', this.device.name,
                'valueId:', this.valueId,
                'value:', logData);

    if (zwValue.class_id == COMMAND_CLASS.CONFIGURATION) {
      let size = 2;
      switch (zwValue.type) {
        case 'int':
          size = 4;
          break;
        case 'list':
          size = 1;
          break;
      }
      this.device.adapter.zwave.setConfigParam(zwValue.node_id,
                                               zwValue.index,
                                               zwValueData,
                                               size);

      // Indicate that the property changed. It seems that we
      // don't always get updates (in particular, changing the
      // touch color of a wallmote doesn't send back the
      // updated color).
      this.device.notifyPropertyChanged(this);
    } else {
      this.device.adapter.zwave.setValue(zwValue.node_id, zwValue.class_id,
                                         zwValue.instance, zwValue.index,
                                         zwValueData);
      if (this.fireAndForget) {
        this.device.notifyPropertyChanged(this);
      }
    }
    return deferredSet.promise;
  }
}

module.exports = ZWaveProperty;
