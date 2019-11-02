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
  COLOR: 51,                  // 0x33
  METER: 50,                  // 0x32
  THERMOSTAT_MODE: 64,        // 0x40
  THERMOSTAT_OPERATING_STATE: 66, // 0x42
  THERMOSTAT_SETPOINT: 67,    // 0x43
  THERMOSTAT_FAN_MODE: 68,    // 0x44
  THERMOSTAT_FAN_STATE: 69,   // 0x45
  DOOR_LOCK_LOGGING: 76,      // 0x4c
  CENTRAL_SCENE: 91,          // 0x5b
  ZWAVE_PLUS_INFO: 94,        // 0x5e
  DOOR_LOCK: 98,              // 0x62
  USER_CODE: 99,              // 0x63
  CONFIGURATION: 112,         // 0x70
  ALARM: 113,                 // 0x71
  MANUFACTURER_SPECIFIC: 114, // 0x72
  POWER_LEVEL: 115,           // 0x73
  PROTECTION: 117,            // 0x75
  BATTERY: 128,               // 0x80
  CLOCK: 129,                 // 0x81
  WAKE_UP: 132,               // 0x84
  VERSION: 134,               // 0x86
  TIME_PARAMETERS: 139,       // 0x8b
  SECURITY: 152,              // 0x98
};
addInverseMap(COMMAND_CLASS);

// From cpp/src/command_classes/CentralScene.cpp#L51
// For 1.4, the SCENE_COUNT has a value of 0, for 1.5 it has a value of
// 256
const CENTRAL_SCENE = {
  SCENE_COUNT: 256,       // 0x100
  TIMEOUT: 257,           // 0x101
};

// From cpp/src/command_classes/Color.cpp ValueIDSystemIndexes
const COLOR_INDEX = {
  COLOR: 0,
  INDEX: 1,
  CAPABILITIES: 2,
  DURATION: 3,
};

const COLOR_CAPABILITY = {
  WARM_WHITE: 0,
  COOL_WHITE: 1,
  RED: 2,
  GREEN: 3,
  BLUE: 4,
  // AMBER: 5,
  // CYAN: 6,
  // PURPLE: 7,
  // INDEXED: 8,
};

// These come from the SDS14224-Z-Wave-Plus-v2-Device-Type-Specification.pdf
// docuemmmmt. Under https://www.silabs.com/documents/login/miscellaneous/
const GENERIC_TYPE_STR = {
  0x01: 'Generic Controller',
  0x02: 'Static Controller',
  0x03: 'AV Controller',
  0x04: 'Display',
  0x05: 'Network Extender',
  0x06: 'Appliance',
  0x07: 'Sensor Notification',
  0x08: 'Thermostat',
  0x09: 'Window Covering',
  0x0F: 'Repeater Slave',
  0x10: 'Switch Binary',
  0x11: 'Switch MultiLevel',
  0x12: 'Switch Remote',
  0x13: 'Switch Toggle',
  0x15: 'Zip Node',
  0x16: 'Ventilation',
  0x17: 'Security Panel',
  0x18: 'Wall Controller',
  0x20: 'Sensor Binary',
  0x21: 'Sensor MultiLevel',
  0x30: 'Meter Pulse',
  0x31: 'Meter',
  0x40: 'Entry Control',
  0x50: 'Semi Interoperable',
  0xA1: 'Sensor Alarm',
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
  COLOR_CAPABILITY,
  COLOR_INDEX,
  GENERIC_TYPE,
  GENERIC_TYPE_STR,
};
