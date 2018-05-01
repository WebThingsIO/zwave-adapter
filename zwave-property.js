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

let Deferred, Property;
try {
  Deferred = require('../deferred');
  Property = require('../property');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }

  const gwa = require('gateway-addon');
  Deferred = gwa.Deferred;
  Property = gwa.Property;
}

// Refer to ZWave document SDS13781 "Z-Wave Application Command Class
// Specification". In the Notification Type and Event fields. These
// constants come from the "Event" column for the "Home Security (V2)
// section".
const ALARM_EVENT_HOME_SECURITY_CLEAR           = 0;
const ALARM_EVENT_HOME_SECURITY_TAMPER          = 3;
const ALARM_EVENT_HOME_SECURITY_MOTION          = 8;

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
      let err = 'Unknown function: ' + setZwValueFromValue;
      console.error(err);
      throw err;
    }

    if (!parseValueFromZwValue) {
      parseValueFromZwValue = 'parseIdentityValue';
    }
    this.parseValueFromZwValue =
      Object.getPrototypeOf(this)[parseValueFromZwValue];
    if (!this.parseValueFromZwValue) {
      let err = 'Unknown function: ' + parseValueFromZwValue;
      console.error(err);
      throw err;
    }

    var zwValue = device.zwValues[valueId];
    if (zwValue) {
      let [value, _logValue] = this.parseValueFromZwValue(zwValue.value);
      this.value = value;
    }
  }

  asDict() {
    var dict = super.asDict();
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
    return [tamper, tamper.toString()];
  }

  parseIdentityValue(zwData) {
    let propertyValue = zwData;
    return [propertyValue, propertyValue.toString()];
  }

  parseOnOffLevelZwValue(zwData) {
    // For devices (like the Aeotec ZW099) which support level but don't
    // support on/off we fake on/off
    let ret = this.parseLevelZwValue(zwData);
    if (this.name === 'on') {
      let value = this.level > 0;
      return [value, '' + value];
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
      percent.toFixed(1) + '% (zw: ' + this.level + ')'
    ];
  }

  parseZwValue(zwData) {
    return this.parseValueFromZwValue(zwData);
  }

  setIdentityValue(propertyValue) {
    let zwData = propertyValue;
    return [zwData, zwData.toString()];
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
    if (typeof(percent) !== 'number') {
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
      'zw: ' + this.level + ' (' + percent.toFixed(1) + '%)'
    ];
  }

  /**
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(propertyValue) {
    var deferredSet = this.deferredSet;
    if (!deferredSet) {
      deferredSet = new Deferred();
      this.deferredSet = deferredSet;
    }

    if (!this.valueId) {
      deferredSet.reject('setProperty property ' + this.name +
                        ' for node ' + this.device.id +
                        ' doesn\'t have a valueId');
      return deferredSet.promise;
    }
    let zwValue = this.device.zwValues[this.valueId];

    if (zwValue.read_only) {
      deferredSet.reject('setProperty property ' + this.name +
                        ' for node ' + this.device.id +
                        ' is read-only');
      return deferredSet.promise;
    }

    this.setCachedValue(propertyValue);

    let [zwValueData, logData] = this.setZwValueFromValue(propertyValue);

    console.log('setProperty property:', this.name,
                'for:', this.device.name,
                'valueId:', this.valueId,
                'value:', logData);

    this.device.adapter.zwave.setValue(zwValue.node_id, zwValue.class_id,
                                        zwValue.instance, zwValue.index,
                                        zwValueData);
    return deferredSet.promise;
  }
}

module.exports = ZWaveProperty;
