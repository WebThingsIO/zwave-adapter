/**
 *
 * zwave-constants - Exports constants used by the zwave adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

// For each key/value pair, add an entry where the key is the value and
// vice-versa.
function addInverseMap(dict) {
  const entries = Object.entries(dict);
  for (const [key, value] of entries) {
    dict[value] = key;
  }
}

const COMMAND_CLASS = {
  BASIC: 32,                  // 0x20
  SWITCH_BINARY: 37,          // 0x25
  SWITCH_MULTILEVEL: 38,      // 0x26
  SWITCH_ALL: 39,             // 0x27
  SENSOR_BINARY: 48,          // 0x30
  SENSOR_MULTILEVEL: 49,      // 0x31
  ZIP_ADV_SERVER: 51,         // 0x33
  METER: 50,                  // 0x32
  CENTRAL_SCENE: 91,          // 0x5b
  ZWAVE_PLUS_INFO: 94,        // 0x5e
  CONFIGURATION: 112,         // 0x70
  ALARM: 113,                 // 0x71
  MANUFACTURER_SPECIFIC: 114, // 0x72
  POWER_LEVEL: 115,           // 0x73
  BATTERY: 128,               // 0x80
  CLOCK: 129,                 // 0x81
  WAKE_UP: 132,               // 0x84
  VERSION: 134,               // 0x86
};
addInverseMap(COMMAND_CLASS);

// From cpp/src/command_classes/CentralScene.cpp#L51
// For 1.4, the SCENE_COUNT has a value of 0, for 1.5 it has a value of
// 256
const CENTRAL_SCENE = {
  SCENE_COUNT: 256,       // 0x100
  TIMEOUT: 257,           // 0x101
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
  CENTRAL_SCENE,
  GENERIC_TYPE,
  GENERIC_TYPE_STR,
};
