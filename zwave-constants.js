/**
 *
 * zwave-constants - Exports constants used by the swave adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const COMMAND_CLASS = {
  SWITCH_BINARY: 37,      // 0x25
  SWITCH_MULTILEVEL: 38,  // 0x26
  SWITCH_ALL: 39,         // 0x27
  SENSOR_BINARY: 48,      // 0x30
  SENSOR_MULTILEVEL: 49,  // 0x31
  METER: 50,              // 0x32
  CENTRAL_SCENE: 91,      // 0x5b
  CONFIGURATION: 112,     // 0x70
  ALARM: 113,             // 0x71
  BATTERY: 128,           // 0x80
};

const GENERIC_TYPE_STR = {
  0x01: 'Generic Controller',
  0x02: 'Static Controller',
  0x03: 'AV Controller',
  0x07: 'Sensor Notification',
  0x08: 'Thermostat',
  0x0F: 'Repeater Slave',
  0x10: 'Switch Binary',
  0x11: 'Switch MultiLevel',
  0x18: 'Wall Controller',
  0x20: 'Sensor Binary',
  0x21: 'Sensor MultiLevel',
  0x31: 'Meter',
  0x40: 'Entry Control',
};

const GENERIC_TYPE = {};
const entries = Object.entries(GENERIC_TYPE_STR);
for (const [key, value] of entries) {
  const newValue = value.toUpperCase().replace(' ', '_');
  GENERIC_TYPE[newValue] = parseInt(key);
}

module.exports = {
  COMMAND_CLASS,
  GENERIC_TYPE,
  GENERIC_TYPE_STR,
};
