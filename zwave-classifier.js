/**
 *
 * ZWaveClassifier - Determines properties from command classes.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */


'use strict';

const ZWaveProperty = require('./zwave-property');

const {
  CENTRAL_SCENE,
  COLOR_CAPABILITY,
  COLOR_INDEX,
  COMMAND_CLASS,
  GENERIC_TYPE,
  GENERIC_TYPE_STR,
} = require('./zwave-constants');

const {
  DEBUG_classifier,
} = require('./zwave-debug');
const DEBUG = DEBUG_classifier;

// See; http://wiki.micasaverde.com/index.php/ZWave_Command_Classes for a
// complete list of command classes.

const AEOTEC_MANUFACTURER_ID = '0x0086';
const AEOTEC_ZW096_PRODUCT_ID = '0x0060'; // SmartPlug (Switch)
const AEOTEC_ZW099_PRODUCT_ID = '0x0063'; // SmartPlug (Dimmer)
const AEOTEC_ZW100_PRODUCT_ID = '0x0064'; // Multisensor 6
const AEOTEC_ZW111_PRODUCT_ID = '0x006f'; // Nano Dimmer with metering
const AEOTEC_ZW116_PRODUCT_ID = '0x0074'; // Nano Switch
const AEOTEC_ZW130_PRODUCT_ID = '0x0082'; // WallMote Quad
const AEOTEC_ZW132_PRODUCT_ID = '0x0084'; // Dual Nano Switch with metering
const AEOTEC_ZW139_PRODUCT_ID = '0x008b'; // Nano Switch (End of Life)
const AEOTEC_ZW140_PRODUCT_ID = '0x008c'; // Dual Nano Switch
const AEOTEC_ZW141_PRODUCT_ID = '0x008d'; // Nano Shutter

const ECOLINK_MANUFACTURER_ID = '0x014a';
const ECOLINK_FLOOD_FREEZE_PRODUCT_ID = '0x0010';

const FIRST_ALERT_MANUFACTURER_ID = '0x0138';
const FIRST_ALERT_ZCOMBO_PRODUCT_ID = '0x0002';

function nodeHasAeotecS1S2Mode(node) {
  // These devices have an S1 and S2 input which can control the output(s).
  // They also have config options which determine which type of external
  // switch is connected to S1 and S2, and we expose these config options
  // as properties.
  return node.zwInfo.manufacturerId === AEOTEC_MANUFACTURER_ID &&
         (node.zwInfo.productId === AEOTEC_ZW111_PRODUCT_ID ||
          node.zwInfo.productId === AEOTEC_ZW116_PRODUCT_ID ||
          node.zwInfo.productId === AEOTEC_ZW132_PRODUCT_ID ||
          node.zwInfo.productId === AEOTEC_ZW139_PRODUCT_ID ||
          node.zwInfo.productId === AEOTEC_ZW140_PRODUCT_ID ||
          node.zwInfo.productId === AEOTEC_ZW141_PRODUCT_ID);
}

// From cpp/src/command_classes/SwitchMultilevel.cpp
// The code uses "_data[5]+3" for the index.
//
// Refer to ZWave document SDS13781 "Z-Wave Application Command Class
// Specification". In the Notification Type and Event fields. The
// notification type of "Home Security" has a Notification Type of 7,
// which means it will be reported as an index of 10 (due to the +3
// mentioned above).
const ALARM_INDEX_HOME_SECURITY = 10;
const ALARM_INDEX_TYPE_V1 = 512;
const ALARM_INDEX_LEVEL_V1 = 513;

// The following come from:
// SDS13713 Notification Command Class, list of assigned Notifications.xlsx
// and also from

const NOTIFICATION_SMOKE_DETECTOR = 1;
const NOTIFICATION_CO_DETECTOR = 2;
const NOTIFICATION_OVERHEAT = 4;
const NOTIFICATION_WATER_LEAK = 5;
const NOTIFICATION_ACCESS_CONTROL = 6;
const NOTIFICATION_HOME_SECURITY = 7;
const NOTIFICATION_COMBUSTIBLE_GAS = 18;

const NOTIFICATION_SENSOR = {
  [NOTIFICATION_SMOKE_DETECTOR]: {// 1
    name: 'smoke',
    '@type': ['Alarm'],
    propertyName: 'on',
    propertyDescr: {
      '@type': 'AlarmProperty',
      type: 'boolean',
      label: 'Smoke',
      description: 'Smoke Detector',
      readOnly: true,
    },
    valueListMap: [false, true],
  },
  [NOTIFICATION_CO_DETECTOR]: {// 2
    name: 'co',
    '@type': ['Alarm'],
    propertyName: 'co',
    propertyDescr: {
      '@type': 'AlarmProperty',
      type: 'boolean',
      label: 'CO',
      description: 'Carbon Monoxide Detector',
      readOnly: true,
    },
    valueListMap: [false, true],
  },
  [NOTIFICATION_OVERHEAT]: {// 4
    name: 'overheat',
    propertyName: 'overheat',
    propertyDescr: {
      '@type': 'AlarmProperty',
      type: 'boolean',
      label: 'Overheat',
      description: 'Overheat property',
      readOnly: true,
    },
    valueListMap: [false, true],
  },
  [NOTIFICATION_WATER_LEAK]: {// 5
    name: 'water',
    '@type': ['LeakSensor'],
    propertyName: 'on',
    propertyDescr: {
      '@type': 'LeakProperty',
      type: 'boolean',
      label: 'Water',
      description: 'Water Sensor',
      readOnly: true,
    },
    valueListMap: [false, true],
    addValueId2: true,
  },
  [NOTIFICATION_ACCESS_CONTROL]: {// 6
    name: 'switch',
    '@type': ['DoorSensor'],
    propertyName: 'open',
    propertyDescr: {
      '@type': 'OpenProperty',
      type: 'boolean',
      label: 'Open',
      description: 'Contact Switch',
      readOnly: true,
    },
    valueListMap: [false, true, false],
  },
  [NOTIFICATION_HOME_SECURITY]: {// 7
    name: 'motion',
    '@type': ['MotionSensor'],
    propertyName: 'motion',
    propertyDescr: {
      '@type': 'MotionProperty',
      type: 'boolean',
      label: 'Motion',
      description: 'MotionDetected',
      readOnly: true,
    },
    valueMap: ['Clear', 'Motion'],
  },
  [NOTIFICATION_COMBUSTIBLE_GAS]: {// 18
    name: 'combustible_gas',
    '@type': ['Alarm'],
    propertyName: 'combustible_gas',
    propertyDescr: {
      '@type': 'AlarmProperty',
      type: 'boolean',
      label: 'Combustible Gas',
      description: 'Combustible Gas Detector',
      readOnly: true,
    },
    valueListMap: [false, true],
  },
};

// These are additional sensors that aren't the main function of the sensor.
const NOTIFICATION_SENSOR2 = {
  [NOTIFICATION_HOME_SECURITY]: {// 7
    name: 'tamper',
    propertyName: 'tamper',
    propertyDescr: {
      '@type': 'TamperProperty',
      type: 'boolean',
      label: 'Tamper',
      description: 'Tamper Switch',
      readOnly: true,
    },
    valueMap: ['Clear', 'Tamper'],
  },
};

// This would be from Battery.cpp, but it only has a single index.
const BATTERY_INDEX_LEVEL = 0;

const DOOR_LOCK_LOCKED = 0;

// These constants come from the OpenZWave ValueIDIndexesDefines.def
// Search for ValueID_Index_Meter
const METER_INDEX_ELECTRIC_INSTANT_POWER = 2;
const METER_INDEX_ELECTRIC_INSTANT_VOLTAGE = 4;
const METER_INDEX_ELECTRIC_INSTANT_CURRENT = 5;

// This would be from SensorBinary.cpp, but it only has a single index.
const SENSOR_BINARY_INDEX_SENSOR = 0;

// From the SensorType enum in OpenZWave:
//    cpp/src/command_classes/SensorMultilevel.cpp#L50
//
// Note: These constants are specific to the OpenZWave library and not
//       part of the ZWave specification.
const SENSOR_MULTILEVEL_INDEX_TEMPERATURE = 1;
const SENSOR_MULTILEVEL_INDEX_LUMINANCE = 3;
const SENSOR_MULTILEVEL_INDEX_RELATIVE_HUMIDITY = 5;
const SENSOR_MULTILEVEL_INDEX_ULTRAVIOLET = 27;
const SENSOR_MULTILEVEL_INDEX_CO_LEVEL = 40;

// This would be from SwitchBinary.cpp, but it only has a single index.
const SWITCH_BINARY_INDEX_SWITCH = 0;

// From the SwitchMultilevelIndex enum in OpenZWave:
//    cpp/src/command_classes/SwitchMultilevel.cpp
//
// Note: These constants are specific to the OpenZWave library and not
//       part of the ZWave specification.
const SWITCH_MULTILEVEL_INDEX_LEVEL = 0;

// From ValueIDIndexesDefines.def
const WAKEUP_INTERVAL_VALUE = 0;
const WAKEUP_INTERVAL_MIN = 1;
const WAKEUP_INTERVAL_MAX = 2;

// From ValueIDIndexesDefines.def (ValueID_Index_ThermostatMode)
const THERMOSTAT_INDEX_MODE = 0;

// From ValueIDIndexesDefines.def (ValueID_Index_ThermostatOperatingState)
const THERMOSTAT_INDEX_OPERATING_STATE = 0;

// From ValueIDIndexesDefines.def (ValueID_Index_ThermostatSetpoint)
const THERMOSTAT_INDEX_SETPOINT_HEATING = 1;
const THERMOSTAT_INDEX_SETPOINT_COOLING = 2;

// From ValueIDIndexesDefines.def (ValueID_Index_ThermostatFanMode)
const THERMOSTAT_INDEX_FAN_MODE = 0;

// From ValueIDIndexesDefines.def (ValueID_Index_ThermostatFanState)
const THERMOSTAT_INDEX_FAN_STATE = 0;

const QUIRKS = [
  {
    // The Aeotec devices don't seem to notify on current changes, only on
    // instantaneous power changes. So we exclude this for now. We might be
    // able to support this by adding a read of current each time we get a
    // power change.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
    },
    excludeProperties: ['current'],
  },
  {
    // The Aeotec ZW096 (Smart Switch 6) says it supports the MULTILEVEL
    // command class, but setting it acts like a no-op. We remove the
    // 'level' property so that the UI doesn't see it.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productId: AEOTEC_ZW096_PRODUCT_ID,
    },
    excludeProperties: ['level'],
  },
  {
    // Aeotec products which have Enery Metering
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productIds: [
        AEOTEC_ZW096_PRODUCT_ID,  // Smart Switch 6
        AEOTEC_ZW099_PRODUCT_ID,  // Smart Dimmer 6
        AEOTEC_ZW111_PRODUCT_ID,  // Nano Swith with energy metering
        AEOTEC_ZW132_PRODUCT_ID,  // Dual Nano Switch with metering
      ],
    },
    // polling isn't required with the configuration change below
    disablePoll: true,
    setConfigs: [
      // Enable to send a Basic CC Report when the switch state
      // changes.
      {paramId: 80, value: 2, size: 1},
      // Setting parameter 90 to 1 causes instantaneous reports to be
      // sent based on parameters 91 & 92
      {paramId: 90, value: 1, size: 1},
      // Parameter 91 is the minimum change (in watts) required to induce
      // a meter report.
      {paramId: 91, value: 25, size: 2},
      // Parameter 92 is the minimum change (in wattage percent) to induce
      // a meter report.
      {paramId: 92, value: 5, size: 1},
      // Setting the following to non-zero causes periodic reports to
      // be sent based on parameters 111-113
      {paramId: 101, value: 0, size: 4},
      {paramId: 102, value: 0, size: 4},
      {paramId: 103, value: 0, size: 4},
    ],
    isLight: false,
  },
  {
    // Aeotec Products without Energy Metering
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productIds: [
        AEOTEC_ZW116_PRODUCT_ID,  // Nano Switch
        AEOTEC_ZW139_PRODUCT_ID,  // Nano Switch (End of Life)
        AEOTEC_ZW140_PRODUCT_ID,  // Dual Nano Switch
        AEOTEC_ZW141_PRODUCT_ID,  // Nano Shutter
      ],
    },
    // polling isn't required with the configuration change below
    disablePoll: true,
    setConfigs: [
      // Enable to send a Basic CC Report when the switch state
      // changes.
      {paramId: 80, value: 2, size: 1},
    ],
    isLight: false,
  },
  {
    // The Aeotec ZW100 says it supports the SENSOR_BINARY command class,
    // but this is only true for some configurations. We use the alarm
    // command class instead.
    // We remove the 'on' property so that the UI doesn't see it.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productId: AEOTEC_ZW100_PRODUCT_ID,
    },
    excludeProperties: ['on'],
    setConfigs: [
      // Configure motion sensor to send 'Basic Set', rather than
      // 'Binary Sensor report'.
      {paramId: 5, value: 1, size: 1},
      // Enable threshold reporting
      {paramId: 40, value: 1, size: 1},
      // Report 0.5C temperature changes
      {paramId: 41, value: 0x00050100, size: 4},
    ],
  },
  {
    // By default, the Aeotec ZW130 only sends presses and not
    // swipes. Setting this config allows swipes to be detected
    // as well.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productId: AEOTEC_ZW130_PRODUCT_ID,
    },
    setConfigs: [
      // Configure what will be sent when pressing a button. The
      // default value of 2 just sends a Central Scene Notification.
      // A value of 3 also sends configuration reports.
      // Note: We want to set the value to 3, which corresponds to the
      // an item index of 2 since the zw130.xml file is missing an
      // entry for a value of 2.
      //  Index 0 = Value 0
      //  Index 1 = Value 1
      //  Index 2 = Value 3
      // The OpenZWave C++ API is a bit deceiving in that it's called
      // SetByValue, but for lists, the value is in the index into the
      // list.
      {paramId: 4, value: 2, size: 1},
    ],
  },
];

function quirkMatches(quirk, node) {
  let match = true;
  for (const id in quirk.zwInfo) {
    if (id === 'productIds') {
      if (!quirk.zwInfo.productIds.includes(node.zwInfo.productId)) {
        match = false;
        break;
      }
    } else if (node.zwInfo[id] !== quirk.zwInfo[id]) {
      match = false;
      break;
    }
  }
  return match;
}

function levelToHex(level) {
  // level is excpected to be 0-100
  // this returns 00-ff
  const hexValue = Math.round(Math.min(255, Math.max(0, level * 255 / 100)));
  const hexStr = `00${hexValue.toString(16)}`.substr(-2);
  const newLevel = Math.round(hexValue * 100 / 255);
  return [hexStr, newLevel];
}

class ZWaveClassifier {
  classify(node) {
    DEBUG && console.log(`classify: called for ${node.id}`,
                         `name = ${node.name}`,
                         `defaultName = ${node.defaultName}`);
    this.classifyInternal(node);
    node.classified = true;

    // Any type of device can be battery powered, so we do this check for
    // all devices.
    const batteryValueId =
      node.findValueId(COMMAND_CLASS.BATTERY,
                       1,
                       BATTERY_INDEX_LEVEL);
    if (batteryValueId) {
      this.addBatteryProperty(node, batteryValueId);
    }
    DEBUG && console.log(`classify: ${node.id} named ${node.name}`,
                         `defaultName: ${node.defaultName} types:`,
                         node['@type']);
  }

  classifyInternal(node) {
    const zwave = node.adapter.zwave;
    const nodeId = node.zwInfo.nodeId;
    DEBUG_classifier &&
      console.log('classifyInternal:',
                  `manufacturerId: ${node.zwInfo.manufacturerId}`,
                  `productId: ${node.zwInfo.productId}`);
    // Search through the known quirks and see if we need to apply any
    // configurations
    for (const quirk of QUIRKS) {
      if (!quirkMatches(quirk, node)) {
        continue;
      }

      if (quirk.hasOwnProperty('disablePoll')) {
        console.log(`Device ${node.id}`,
                    `Setting disablePoll to ${quirk.disablePoll}`);
        node.disablePoll = quirk.disablePoll;
      }

      if (quirk.hasOwnProperty('isLight')) {
        node.isLight = quirk.isLight;
      }

      if (!quirk.hasOwnProperty('setConfigs')) {
        continue;
      }

      for (const setConfig of quirk.setConfigs) {
        const valueId = node.findValueId(COMMAND_CLASS.CONFIGURATION,
                                         1, setConfig.paramId);
        if (valueId) {
          const zwValue = node.zwValues[valueId];
          if (zwValue) {
            let value = zwValue.value;
            if (zwValue.type == 'list') {
              // For lists, the value contains the looked up string
              // rather than the index. Figure out the index.
              const idx = zwValue.values.indexOf(zwValue.value);
              if (idx < 0) {
                // This shouldn't happen. If it does it means that
                // something in the config file has changed.
                console.error(`Device ${node.id} config ` +
                              `paramId: ${setConfig.paramId} ` +
                              `unable to determine index of '${value}'`);
                continue;
              }
              value = idx;
            }
            console.log(`Setting device ${node.id} config ` +
                        `paramId: ${setConfig.paramId} ` +
                        `to value: ${setConfig.value} ` +
                        `size: ${setConfig.size}`);
            zwave.setConfigParam(nodeId,
                                 setConfig.paramId,
                                 setConfig.value,
                                 setConfig.size);
          } else {
            console.error(`Device ${node.id} config ` +
                          `paramId: ${setConfig.paramId} ` +
                          `unable to find value with id ${valueId}`);
          }
        } else {
          console.error(`Device ${node.id} config ` +
                        `paramId: ${setConfig.paramId} ` +
                        `unable to find valueId`);
        }
      }
    }

    const genericType = zwave.getNodeGeneric(nodeId);
    node.zwInfo.genericType = genericType;

    const basicType = zwave.getNodeBasic(nodeId);
    node.zwInfo.basicType = basicType;

    const specificType = zwave.getNodeSpecific(nodeId);
    node.zwInfo.specificType = specificType;

    const colorCapabilitiesValueId =
      node.findValueId(COMMAND_CLASS.COLOR,
                       1,
                       COLOR_INDEX.CAPABILITIES);
    const binarySwitchValueId =
      node.findValueId(COMMAND_CLASS.SWITCH_BINARY,
                       1,
                       SWITCH_BINARY_INDEX_SWITCH);
    const doorLockValueId =
      node.findValueId(COMMAND_CLASS.DOOR_LOCK,
                       1,
                       DOOR_LOCK_LOCKED);
    const levelValueId =
      node.findValueId(COMMAND_CLASS.SWITCH_MULTILEVEL,
                       1,
                       SWITCH_MULTILEVEL_INDEX_LEVEL);
    const alarmValueId =
      node.findValueId(COMMAND_CLASS.ALARM,
                       1,
                       ALARM_INDEX_HOME_SECURITY);
    const binarySensorValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_BINARY,
                       1,
                       SENSOR_BINARY_INDEX_SENSOR);
    const centralSceneValueId =
      node.findValueId(COMMAND_CLASS.CENTRAL_SCENE,
                       1,
                       CENTRAL_SCENE.SCENE_COUNT);
    const temperatureValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_TEMPERATURE);
    const carbonMonoxideValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_CO_LEVEL);
    const luminanceValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_LUMINANCE);
    const humidityValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_RELATIVE_HUMIDITY);
    const uvValueId =
      node.findValueId(COMMAND_CLASS.SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_ULTRAVIOLET);
    const wakeUpIntervalValueId =
      node.findValueId(COMMAND_CLASS.WAKE_UP,
                       1,
                       WAKEUP_INTERVAL_VALUE);
    const minWakeUpIntervalValueId =
      node.findValueId(COMMAND_CLASS.WAKE_UP,
                       1,
                       WAKEUP_INTERVAL_MIN);
    const maxWakeUpIntervalValueId =
      node.findValueId(COMMAND_CLASS.WAKE_UP,
                       1,
                       WAKEUP_INTERVAL_MAX);

    if (DEBUG) {
      const genericTypeStr = GENERIC_TYPE_STR[genericType] || 'unknown';
      console.log(`classify: called for node ${node.id},`,
                  `genericType = ${genericTypeStr}`,
                  `(0x${genericType.toString(16)})`);
      console.log('classify:   colorCapabilitiesValueId =',
                  colorCapabilitiesValueId);
      console.log('classify:   binarySwitchValueId =', binarySwitchValueId);
      console.log('classify:   doorLockValueId     =', doorLockValueId);
      console.log('classify:   levelValueId        =', levelValueId);
      console.log('classify:   binarySensorValueId =', binarySensorValueId);
      console.log('classify:   centralSceneValueId =', centralSceneValueId);
      console.log('classify:   alarmValueId        =', alarmValueId);
      console.log('classify:   temperatureValueId  =', temperatureValueId);
      console.log('classify:   luminanceValueId    =', luminanceValueId);
      console.log('classify:   humidityValueId     =', humidityValueId);
      console.log('classify:   wakeUpIntervalValueId    =',
                  wakeUpIntervalValueId);
      console.log('classify:   minWakeUpIntervalValueId =',
                  minWakeUpIntervalValueId);
      console.log('classify:   maxWakeUpIntervalValueId =',
                  maxWakeUpIntervalValueId);
      console.log('classify:   carbonMonoxideValueId  =',
                  carbonMonoxideValueId);

      console.log('classify:   quirk.isLight       =', node.isLight);
    }

    node.type = 'thing';  // Just in case it doesn't classify as anything else

    if (!node.hasOwnProperty('@type')) {
      node['@type'] = [];
    }

    switch (genericType) {
      case GENERIC_TYPE.SWITCH_BINARY:
      case GENERIC_TYPE.SWITCH_MULTILEVEL:
      {
        // The Aeotec Smart Switch 6 and Smart Dimmer 6 have color capabilities
        // but aren't lights.
        if (colorCapabilitiesValueId) {
          if (!node.hasOwnProperty('isLight') || node.isLight) {
            this.initLight(node, colorCapabilitiesValueId, levelValueId);
            return;
          }
        }

        const bsValueId = [null, binarySwitchValueId];
        const lvlValueId = [null, levelValueId];
        let instance = 1;
        do {
          instance += 1;
          bsValueId[instance] =
            node.findValueId(COMMAND_CLASS.SWITCH_BINARY,
                             instance,
                             SWITCH_BINARY_INDEX_SWITCH);
          lvlValueId[instance] =
            node.findValueId(COMMAND_CLASS.SWITCH_MULTILEVEL,
                             instance,
                             SWITCH_MULTILEVEL_INDEX_LEVEL);
        } while (bsValueId[instance] || lvlValueId[instance]);

        // Instances are numbered starting at 1 (not zero), and instance
        // will also be 1 higher since the last time through the do/while
        // loop will have stored undefined in both bsValueId and lvlValueId
        const instanceCount = instance - 1;

        if (instanceCount < 3) {
          // Some devices (like the ZW099 Smart Dimmer 6) advertise instance
          // 1 and 2, and don't seem to work on instance 2. So we always
          // use instance 1 for the first outlet, and then 3 and beyond for the
          // second and beyond outlets.
          this.initSwitch(node, bsValueId[1], lvlValueId[1], '');
        } else {
          // 2 or more switches
          if (node.zwInfo.manufacturerId == AEOTEC_MANUFACTURER_ID) {
            // With Aeotec, when there are multiple switches, then
            // instances 2 - N are used. Instance 1 seems to control
            // all of the switches.
            // At least this is true for the Dual Nano Switch
            this.initSwitch(node, bsValueId[2], lvlValueId[2], '');
          } else {
            // The only other dual switch tested needed to use instance
            // 1 and 3. It was an inovelli 2 channel Dual Smart Plug (ZW37)
            // and I can't find it for sale anyplace. The one I tested with
            // was loaned from Lars.
            this.initSwitch(node, bsValueId[1], lvlValueId[1], '');
          }
          let switchNum = 2;
          for (instance = 3; instance <= instanceCount; instance++) {
            this.initSwitch(node, bsValueId[instance], lvlValueId[instance],
                            switchNum.toString());
            switchNum += 1;
          }
        }
        break;
      }

      case GENERIC_TYPE.SENSOR_BINARY:
        this.initBinarySensor(node, binarySensorValueId);
        break;

      case GENERIC_TYPE.SENSOR_MULTILEVEL:
      case GENERIC_TYPE.SENSOR_NOTIFICATION:
        this.initSensorNotification(node);
        break;

      case GENERIC_TYPE.SENSOR_ALARM:
        this.initSensorAlarm(node);
        break;

      case GENERIC_TYPE.WALL_CONTROLLER:
        this.initCentralScene(node);
        break;

      case GENERIC_TYPE.ENTRY_CONTROL:
        this.initEntryControl(node, doorLockValueId);
        break;

      case GENERIC_TYPE.THERMOSTAT:
        this.initThermostat(node);
        break;

      default: {
        const genericTypeStr = GENERIC_TYPE_STR[genericType] || 'unknown';
        console.error(`Node: ${nodeId}`,
                      `unsupported genericType: ${genericType}`,
                      `(${genericTypeStr})`);
        break;
      }
    }

    if (alarmValueId) {
      this.addAlarmProperty(node, alarmValueId);
    }

    if (temperatureValueId) {
      this.addTemperatureProperty(node, temperatureValueId);
    }

    if (carbonMonoxideValueId) {
      this.addCarbonMonoxideLevelProperty(node, carbonMonoxideValueId);
    }

    if (luminanceValueId) {
      this.addLuminanceProperty(node, luminanceValueId);
    }

    if (humidityValueId) {
      this.addHumidityProperty(node, humidityValueId);
    }

    if (uvValueId) {
      this.addUltravioletProperty(node, uvValueId);
    }

    if (wakeUpIntervalValueId) {
      this.addWakeUpProperty(node, wakeUpIntervalValueId,
                             minWakeUpIntervalValueId,
                             maxWakeUpIntervalValueId);
    }
  }

  addActions(node, actions) {
    for (const actionName in actions) {
      node.addAction(actionName, actions[actionName]);
    }
  }

  addEvents(node, events) {
    for (const eventName in events) {
      node.addEvent(eventName, events[eventName]);
    }
  }

  addProperty(node, name, descr, valueId,
              setZwValueFromValue, parseValueFromZwValue) {
    // Search through the known quirks and see if we need to apply any.
    for (const quirk of QUIRKS) {
      if (!quirk.hasOwnProperty('excludeProperties')) {
        continue;
      }

      if (quirkMatches(quirk, node) && quirk.excludeProperties.includes(name)) {
        console.log(
          `Not adding property ${name} to device ${node.id} due to quirk.`);
        return;
      }
    }
    const property = new ZWaveProperty(node, name, descr, valueId,
                                       setZwValueFromValue,
                                       parseValueFromZwValue);
    DEBUG && console.log(`classify: ${node.id} added property: ${name}`,
                         `valueId: ${valueId} value: ${property.value}`);

    node.properties.set(name, property);
    if (name[0] == '_') {
      property.visible = false;
    }
    return property;
  }

  addAlarmProperty(node, alarmValueId) {
    this.addProperty(
      node,
      'motion',
      {
        '@type': 'BooleanProperty',
        label: 'Motion',
        type: 'boolean',
      },
      alarmValueId,
      '',
      'parseAlarmMotionZwValue'
    );
    this.addProperty(
      node,
      'tamper',
      {
        '@type': 'BooleanProperty',
        label: 'Tamper',
        type: 'boolean',
      },
      alarmValueId,
      '',
      'parseAlarmTamperZwValue'
    );
  }

  addBatteryProperty(node, batteryValueId) {
    this.addProperty(
      node,
      'batteryLevel',
      {
        '@type': 'LevelProperty',
        label: 'Battery',
        type: 'number',
        minimum: 0,
        maximum: 100,
        unit: 'percent',
        readOnly: true,
      },
      batteryValueId
    );
  }

  addHumidityProperty(node, humidityValueId) {
    this.addProperty(
      node,
      'humidity',
      {
        '@type': 'LevelProperty',
        label: 'Humidity',
        type: 'number',
        minimum: 0,
        maximum: 100,
        unit: 'percent',
        readOnly: true,
      },
      humidityValueId
    );
  }

  addLuminanceProperty(node, luminanceValueId) {
    this.addProperty(
      node,
      'luminance',
      {
        // TODO: add proper @type
        label: 'Luminance',
        type: 'number',
        unit: 'lux',
        readOnly: true,
      },
      luminanceValueId
    );
  }

  addTemperatureProperty(node, temperatureValueId) {
    this.addProperty(
      node,
      'temperature',
      {
        '@type': 'TemperatureProperty',
        title: 'Temperature',
        type: 'number',
        unit: 'degree celsius',
        multipleOf: 0.1,
        readOnly: true,
      },
      temperatureValueId,
      null,
      'parseTemperatureZwValue'
    );

    if (!node['@type'].includes('TemperatureSensor')) {
      node['@type'].push('TemperatureSensor');
    }
  }

  addCarbonMonoxideLevelProperty(node, carbonMonoxideValueId) {
    this.addProperty(
      node,
      'carbonMonoxideLevel',
      {
        label: 'Carbon Monoxide Level',
        type: 'number',
        readOnly: true,
        unit: 'Ppm',
        multipleOf: 0.1,
      },
      carbonMonoxideValueId,
    );
  }

  addHeatingTargetTemperatureProperty(node, heatingTargetTempValueId) {
    this.addProperty(
      node,
      'heatingTargetTemperature',
      {
        '@type': 'TargetTemperatureProperty',
        title: 'Heating Target',
        type: 'number',
        unit: 'degree celsius',
        multipleOf: 0.5,
        minimum: 0,
        maximum: 40,
      },
      heatingTargetTempValueId,
      'setTemperatureValue',
      'parseTemperatureZwValue'
    );
  }

  addCoolingTargetTemperatureProperty(node, coolingTargetTempValueId) {
    this.addProperty(
      node,
      'coolingTargetTemperature',
      {
        '@type': 'TargetTemperatureProperty',
        title: 'Cooling Target',
        type: 'number',
        unit: 'degree celsius',
        multipleOf: 0.5,
        minimum: 0,
        maximum: 40,
      },
      coolingTargetTempValueId,
      'setTemperatureValue',
      'parseTemperatureZwValue'
    );
  }

  addFanModeProperty(node, fanModeValueId) {
    const zwValue = node.zwValues[fanModeValueId];
    if (!zwValue) {
      return;
    }
    this.addProperty(
      node,
      'fanMode',
      {
        title: 'Fan Mode',
        type: 'string',
        enum: zwValue.values,
      },
      fanModeValueId
    );
  }

  addFanStateProperty(node, fanStateValueId) {
    const zwValue = node.zwValues[fanStateValueId];
    if (!zwValue) {
      return;
    }
    this.addProperty(
      node,
      'fanState',
      {
        title: 'Fan State',
        type: 'string',
        readOnly: true,
      },
      fanStateValueId
    );
  }

  addThermostatModeProperty(node, thermostatModeValueId) {
    const zwValue = node.zwValues[thermostatModeValueId];
    if (!zwValue) {
      return;
    }
    const lowerCaseValues = zwValue.values.map((v) => v.toLowerCase());
    const property = this.addProperty(
      node,
      'thermostatMode',
      {
        title: 'Mode',
        type: 'string',
        '@type': 'ThermostatModeProperty',
        enum: lowerCaseValues,
      },
      thermostatModeValueId,
      'setLowerCaseValue',
      'parseZwStringToLowerCase'
    );
    property.lowerCaseValues = lowerCaseValues;
  }

  addThermostatStateProperty(node, thermostatStateValueId) {
    const zwValue = node.zwValues[thermostatStateValueId];
    if (!zwValue) {
      return;
    }
    this.addProperty(
      node,
      'heating',
      {
        title: 'Heating/Cooling',
        type: 'string',
        '@type': 'HeatingCoolingProperty',
        readOnly: true,
      },
      thermostatStateValueId,
      null,
      'parseZwStringToLowerCase'
    );
  }

  addUltravioletProperty(node, uvValueId) {
    this.addProperty(
      node,
      'uvIndex',
      {
        // TODO: add proper @type
        label: 'UV Index',
        type: 'number',
        readOnly: true,
      },
      uvValueId
    );
  }

  initCentralScene(node) {
    node['@type'] = ['OnOffSwitch', 'MultiLevelSwitch', 'PushButton'];
    node.name = `${node.id}-button`;

    const sceneCount = node.getSceneCount();
    node.buttonCount = sceneCount;
    DEBUG && console.log('initCentralScene: sceneCount =', sceneCount);
    if (sceneCount == 2) {
      // For a 2 button device, we assume that one of the buttons
      // is on/bright and that the other is off/dim

      const onProperty = this.addCentralSceneOnProperty(node, 0);
      const levelProperty = this.addCentralSceneLevelProperty(node, 0);

      onProperty.value = false;
      levelProperty.value = 0;

      this.addCentralSceneProperty(node, {
        buttonNum: 1,
        label: 'Top',
        pressAction: 'on',
        moveDir: 1,
        onProperty: onProperty,
        levelProperty: levelProperty,
      });
      this.addCentralSceneProperty(node, {
        buttonNum: 2,
        label: 'Bottom',
        pressAction: 'off',
        moveDir: -1,
        onProperty: onProperty,
        levelProperty: levelProperty,
      });
    } else if (node.zwInfo.manufacturerId == AEOTEC_MANUFACTURER_ID &&
               node.zwInfo.productId == AEOTEC_ZW130_PRODUCT_ID) {
      // WallMote Quad
      const buttonLabel = [
        '',
        'Top Left',
        'Top Right',
        'Bottom Left',
        'Bottom Right',
      ];
      node.sceneProperty = [];
      for (let buttonNum = 1; buttonNum <= 4; buttonNum++) {
        const onProperty =
          this.addCentralSceneOnProperty(node, buttonNum);
        const levelProperty =
          this.addCentralSceneLevelProperty(node, buttonNum);
        onProperty.value = false;
        levelProperty.value = 0;
        const sceneProperty = this.addCentralSceneProperty(node, {
          buttonNum: buttonNum,
          label: buttonLabel[buttonNum],
          pressAction: 'toggle',
          moveDir: 0,   // We use slide to incr/decr
          onProperty: onProperty,
          levelProperty: levelProperty,
        });
        node.sceneProperty[buttonNum] = sceneProperty;
      }
      this.addSlideProperties(node);
      this.addConfigList(node, 1, 'Touch Sounds');
      this.addConfigList(node, 2, 'Touch Vibration');
      this.addConfigColorRGBX(node, 5, 'Touch Color');
    }
  }

  addSlideProperties(node) {
    // The slide valueIds don't exist get added the first time a slide
    // occurs, so we just add the correct valueIds.
    const slideStartValueId =
      node.makeValueId(COMMAND_CLASS.CONFIGURATION, 1, 9);
    const slideEndValueId =
      node.makeValueId(COMMAND_CLASS.CONFIGURATION, 1, 10);

    node.slideStartProperty = this.addProperty(
      node,
      '_slideStart',
      {
        '@type': 'number',
        readOnly: true,
      },
      slideStartValueId
    );
    node.slideEndProperty = this.addProperty(
      node,
      '_slideEnd',
      {
        '@type': 'number',
        readOnly: true,
      },
      slideEndValueId
    );

    node.slideEndProperty.updated = function() {
      node.handleSlideEnd(node.slideEndProperty);
    };
  }

  addCentralSceneProperty(node, sceneInfo) {
    const buttonNum = sceneInfo.buttonNum;
    const valueId = node.findValueId(COMMAND_CLASS.CENTRAL_SCENE,
                                     1,
                                     buttonNum);
    const sceneProperty =
      this.addProperty(node,
                       `_scene${buttonNum}`,
                       {
                         '@type': 'number',
                         readOnly: true,
                       },
                       valueId);
    sceneProperty.info = sceneInfo;
    sceneProperty.longPressed = false;

    sceneProperty.updated = function() {
      node.handleCentralSceneProperty(sceneProperty);
    };

    const label = sceneInfo.label;

    this.addEvents(node, {
      [`${buttonNum}-pressed`]: {
        '@type': 'PressedEvent',
        description: `${label} button pressed and released quickly`,
      },
      [`${buttonNum}-released`]: {
        '@type': 'ReleasedEvent',
        description: `${label} button released after being held`,
      },
      [`${buttonNum}-longPressed`]: {
        '@type': 'LongPressedEvent',
        description: `${label} button pressed and held`,
      },
    });
    return sceneProperty;
  }

  addCentralSceneOnProperty(node, buttonNum) {
    if (buttonNum < 2) {
      return this.addProperty(
        node,                     // node
        'on',                     // name
        {// property decscription
          '@type': 'OnOffProperty',
          label: 'On/Off',
          type: 'boolean',
          readOnly: true,
        },
        null                      // valueId
      );
    }
    return this.addProperty(
      node,                     // node
      `on${buttonNum}`,         // name
      {// property decscription
        '@type': 'BooleanProperty',
        label: `On/Off ${buttonNum}`,
        type: 'boolean',
        readOnly: true,
      },
      null                      // valueId
    );
  }

  addCentralSceneLevelProperty(node, buttonNum) {
    if (buttonNum < 2) {
      return this.addProperty(
        node,                   // node
        `level`,                // name
        {// property decscription
          '@type': 'LevelProperty',
          label: 'Level',
          type: 'number',
          unit: 'percent',
          minimum: 0,
          maximum: 100,
          readOnly: true,
        },
        null                    // valueId
      );
    }
    return this.addProperty(
      node,                   // node
      `level${buttonNum}`,    // name
      {// property decscription
        // '@type': 'LevelProperty',
        label: `Level ${buttonNum}`,
        type: 'number',
        unit: 'percent',
        minimum: 0,
        maximum: 100,
        readOnly: true,
      },
      null                    // valueId
    );
  }

  addConfigBoolean(node, paramId, label) {
    const valueId = node.findValueId(COMMAND_CLASS.CONFIGURATION, 1, paramId);
    if (!valueId) {
      console.error('addConfigBoolean:', node.id,
                    'no config parameter with id:', paramId);
      return;
    }
    const property = this.addProperty(
      node,                 // node
      `config-${paramId}`,  // name
      {
        label: label,
        '@type': 'BooleanProperty',
        type: 'boolean',
      },
      valueId,
      'setConfigBooleanValue',
      'parseConfigBooleanZwValue'
    );
    property.fireAndForget = true;
    return property;
  }

  addConfigLevel(node, paramId, label, min, max, unit) {
    const valueId = node.findValueId(COMMAND_CLASS.CONFIGURATION, 1, paramId);
    if (!valueId) {
      console.error('addConfigNumber:', node.id,
                    'no config parameter with id:', paramId);
      return;
    }
    const property = this.addProperty(
      node,                 // node
      `config-${paramId}`,  // name
      {
        label: label,
        '@type': 'LevelProperty',
        type: 'number',
        minimum: min,
        maximum: max,
        unit: unit,
      },
      valueId
    );
    property.fireAndForget = true;
    return property;
  }


  addConfigList(node, paramId, label) {
    const valueId = node.findValueId(COMMAND_CLASS.CONFIGURATION, 1, paramId);
    if (!valueId) {
      console.error('addConfigBoolean:', node.id,
                    'no config parameter with id:', paramId);
      return;
    }
    const zwValue = node.zwValues[valueId];
    if (!zwValue) {
      console.error('addConfigBoolean:', node.id,
                    'no zwValue for valueId:', valueId);
      return;
    }

    // On the Dev branch of openzwave, the list items often have duplicated
    // items on the list. So only include each value once.

    const enumValues = [];
    for (const value of zwValue.values) {
      if (enumValues.indexOf(value) < 0) {
        enumValues.push(value);
      } else {
        // We found a duplicate - stop adding
        break;
      }
    }

    const property = this.addProperty(
      node,                 // node
      `config-${paramId}`,  // name
      {
        label: label,
        type: 'string',
        enum: enumValues,
      },
      valueId,
      'setConfigListValue',
      'parseConfigListZwValue'
    );
    property.fireAndForget = true;
    return property;
  }

  addConfigColorRGBX(node, paramId, label) {
    const valueId = node.findValueId(COMMAND_CLASS.CONFIGURATION, 1, paramId);
    if (!valueId) {
      console.error('addConfigColorRGBX:', node.id,
                    'no config parameter with id:', paramId);
      return;
    }
    const property = this.addProperty(
      node,                 // node
      `config-${paramId}`,  // name
      {
        label: label,
        '@type': 'ColorProperty',
        type: 'string',
      },
      valueId,
      'setConfigRGBXValue',
      'parseConfigRGBXZwValue'
    );
    property.fireAndForget = true;
    return property;
  }

  initLight(node, colorCapabilitiesValueId, levelValueId) {
    node['@type'] = ['Light', 'OnOffSwitch'];

    const colorCapabilityZwValue = node.zwValues[colorCapabilitiesValueId];
    if (!colorCapabilityZwValue) {
      return;
    }
    const colorCapability = colorCapabilityZwValue.value;

    this.addProperty(
      node,                     // node
      'on',            // name
      {// property decscription
        '@type': 'OnOffProperty',
        label: 'On/Off',
        type: 'boolean',
      },
      levelValueId,             // valueId
      'setOnOffLevelValue',     // setZwValueFromValue
      'parseOnOffLevelZwValue'  // parseValueFromZwValue
    );

    const colorValueId = node.findValueId(COMMAND_CLASS.COLOR,
                                          1,
                                          COLOR_INDEX.COLOR);
    node['@type'] = ['Light'];
    const colorHexProperty = this.addProperty(
      node,
      '_colorHex',
      {
        label: 'ColorHex',
        type: 'string',
      },
      colorValueId,
      'setRRGGBBWWCWColorValue',
      'parseRRGGBBWWCWColorValue'
    );
    colorHexProperty.fireAndForget = true;

    let rgbColorProperty;
    let warmColorProperty;
    let coolColorProperty;

    const rgbCapability = colorCapability & ((1 << COLOR_CAPABILITY.RED) |
                                             (1 << COLOR_CAPABILITY.GREEN) |
                                             (1 << COLOR_CAPABILITY.BLUE));
    const warmCapability = colorCapability & (1 << COLOR_CAPABILITY.WARM_WHITE);
    const coolCapability = colorCapability & (1 << COLOR_CAPABILITY.COOL_WHITE);

    if (rgbCapability != 0) {
      node['@type'].push('ColorControl');
      rgbColorProperty = this.addProperty(
        node,
        'color',
        {
          '@type': 'ColorProperty',
          label: 'Color',
          type: 'string',
        },
        null,   // no associated valueId
      );
      rgbColorProperty.fireAndForget = true;
      rgbColorProperty.updated = function() {
        if (node.updatingColorHex) {
          return;
        }
        node.updatingColorHex = true;
        const zwData = `${this.value}0000`;
        if (colorHexProperty.value != zwData) {
          colorHexProperty.setValue(zwData);
        }
        node.updatingColorHex = false;
      };
    }

    if (warmCapability != 0) {
      warmColorProperty = this.addProperty(
        node,
        'warmLevel',
        {
          '@type': 'LevelProperty',
          label: 'Warm Level',
          type: 'number',
          unit: 'percent',
          minimum: 0,
          maximum: 100,
        },
        null,   // no associated valueId
      );
      warmColorProperty.fireAndForget = true;
      warmColorProperty.updated = function() {
        if (node.updatingColorHex) {
          return;
        }
        node.updatingColorHex = true;
        const [hexStr, newLevel] = levelToHex(this.value);
        this.value = newLevel;
        const zwData = `#000000${hexStr}00`;
        if (colorHexProperty.value != zwData) {
          colorHexProperty.setValue(zwData);
        }
        node.updatingColorHex = false;
      };
    }

    if (coolCapability != 0) {
      coolColorProperty = this.addProperty(
        node,
        'coolLevel',
        {
          '@type': 'LevelProperty',
          label: 'Cool Level',
          type: 'number',
          unit: 'percent',
          minimum: 0,
          maximum: 100,
        },
        null,   // no associated valueId
      );
      coolColorProperty.fireAndForget = true;
      coolColorProperty.updated = function() {
        if (node.updatingColorHex) {
          return;
        }
        node.updatingColorHex = true;
        const [hexStr, newLevel] = levelToHex(this.value);
        this.value = newLevel;
        const zwData = `#00000000${hexStr}`;
        if (colorHexProperty.value != zwData) {
          colorHexProperty.setValue(zwData);
        }
        node.updatingColorHex = false;
      };
    }

    colorHexProperty.updated = function() {
      if (rgbColorProperty) {
        const newValue = this.value.substr(0, 7);
        if (rgbColorProperty.value != newValue) {
          rgbColorProperty.setValue(newValue);
        }
      }
      if (warmColorProperty) {
        const newValue = parseInt(this.value.substr(7, 2), 16) * 100 / 255;
        if (warmColorProperty.value != newValue) {
          warmColorProperty.setValue(newValue);
        }
      }
      if (coolColorProperty) {
        const newValue = parseInt(this.value.substr(9, 2), 16) * 100 / 255;
        if (coolColorProperty.value != newValue) {
          coolColorProperty.setValue(newValue);
        }
      }
    };
    // We should have a coleHexValue by the time the classifier is called.
    // Call update to cause the other controls to get updated.
    node.updatingColorHex = true;
    colorHexProperty.updated();
    node.updatingColorHex = false;
  }

  initSensorAlarm(node) {
    const alarmTypeValueId =
      node.findValueId(COMMAND_CLASS.ALARM,
                       1,
                       ALARM_INDEX_TYPE_V1);
    const alarmLevelValueId =
      node.findValueId(COMMAND_CLASS.ALARM,
                       1,
                       ALARM_INDEX_LEVEL_V1);

    node.alarmTypeProperty = this.addProperty(
      node,
      '_alarmType',
      {
        type: 'number',
        readOnly: true,
      },
      alarmTypeValueId
    );

    node.alarmLevelProperty = this.addProperty(
      node,
      '_alarmLevel',
      {
        type: 'number',
        readOnly: true,
      },
      alarmLevelValueId
    );

    if (node.zwInfo.manufacturerId === FIRST_ALERT_MANUFACTURER_ID &&
        node.zwInfo.productId === FIRST_ALERT_ZCOMBO_PRODUCT_ID) {
      // The First Alert ZCOMBO-G combines the smoke and CO alarms into
      // the alarm type value

      if (!node['@type'].includes('Alarm')) {
        node['@type'].push('Alarm');
      }

      node.smokeProperty = this.addProperty(
        node,
        'smoke',
        {
          '@type': 'AlarmProperty',
          type: 'boolean',
          label: 'Smoke',
          description: 'Smoke Detector',
          readOnly: true,
        }
      );

      node.coProperty = this.addProperty(
        node,
        'co',
        {
          '@type': 'AlarmProperty',
          type: 'boolean',
          label: 'CO',
          description: 'Carbon Monoxide Detector',
          readOnly: true,
        }
      );

      const updateAlarms = () => {
        switch (node.alarmTypeProperty.value) {
          case 1: {
            // smoke alarm
            const active = node.alarmLevelProperty.value === 255;
            node.setPropertyValue(node.smokeProperty, active);
            node.setPropertyValue(node.coProperty, false);
            break;
          }
          case 2: {
            // co alarm
            const active = node.alarmLevelProperty.value === 255;
            node.setPropertyValue(node.coProperty, active);
            node.setPropertyValue(node.smokeProperty, false);
            break;
          }
          case 12: {
            // alarm test
            const active = node.alarmLevelProperty.value === 255;
            node.setPropertyValue(node.smokeProperty, active);
            node.setPropertyValue(node.coProperty, active);
            break;
          }
          default: {
            node.setPropertyValue(node.coProperty, false);
            node.setPropertyValue(node.smokeProperty, false);
            break;
          }
        }
      };

      node.alarmTypeProperty.updated = updateAlarms;
      node.alarmLevelProperty.updated = updateAlarms;

      // Set the initial state
      node.alarmTypeProperty.updated();
    }
  }

  initSensorNotification(node) {
    const svName = node.name;
    node.name = '';
    this.addNotificationSensorProperties(node, NOTIFICATION_SENSOR);
    this.addNotificationSensorProperties(node, NOTIFICATION_SENSOR2);

    // The Ecolink Flood/Freeze sensor uses the notification CC for the
    // flood portion, but uses index 1 of the binary sensor CC for the
    // freeze portion.

    if (node.zwInfo.manufacturerId === ECOLINK_MANUFACTURER_ID &&
        node.zwInfo.productId === ECOLINK_FLOOD_FREEZE_PRODUCT_ID) {
      const freezeValueId = node.findValueId(COMMAND_CLASS.SENSOR_BINARY, 1, 1);
      if (freezeValueId) {
        this.addProperty(
          node,
          'freeze',
          {
            '@type': 'BooleanProperty',
            type: 'boolean',
            label: 'Freeze',
            readOnly: true,
          },
          freezeValueId
        );
      }
    }

    if (!node.name) {
      node.name = svName;
    }
  }

  addNotificationSensorProperties(node, sensors) {
    for (const keyStr in sensors) {
      const sensor = sensors[keyStr];
      const keyNum = parseInt(keyStr);
      const valueId = node.findValueId(COMMAND_CLASS.ALARM, 1, keyNum);
      if (!valueId) {
        continue;
      }

      if (sensor.hasOwnProperty('valueMap')) {
        // Some valueIds map to multiple properties. For example tamper and
        // motion both get encoded into the X-113-1-7 valueId, like:
        //
        // "values": [
        //   "Clear",
        //   "Tampering -  Cover Removed",
        //   "Motion Detected at Unknown Location"
        // ],
        //
        // So we check to see if the property we're trying to add has
        // all of the needed values. The tamper property would be looking
        // for 'Clear' and 'Tamper" where the motion property would be
        // looking for 'Clear' and 'Motion'.
        const zwValue = node.zwValues[valueId];
        if (!zwValue || !zwValue.values) {
          continue;
        }
        // Check the values and see if everything needed to support
        // the property is present.
        let match = true;
        for (const mapEntry of sensor.valueMap) {
          let found = false;
          for (const value of zwValue.values) {
            if (value.startsWith(mapEntry)) {
              found = true;
              break;
            }
          }
          if (!found) {
            match = false;
            break;
          }
        }
        if (match) {
          this.addNotificationSensorProperty(node, valueId, sensor);
        }
      } else {
        this.addNotificationSensorProperty(node, valueId, sensor);
      }
    }
  }

  addNotificationSensorProperty(node, valueId, sensor) {
    let alarmProperty;
    if (!node.name) {
      node.name = `${node.id}-${sensor.name}`;
    }
    if (sensor.hasOwnProperty('@type')) {
      node['@type'] = [].concat(sensor['@type']);
    }

    if (node.zwInfo.manufacturerId == AEOTEC_MANUFACTURER_ID &&
        node.zwInfo.productId == AEOTEC_ZW100_PRODUCT_ID &&
        sensor.name == 'motion') {
      // On the Aeotec Multisensor 6, we use BASIC_SET to indicate
      // motion rather than the alarm notification

      const binarySensorValueId =
        node.findValueId(COMMAND_CLASS.SENSOR_BINARY,
                         1,
                         SENSOR_BINARY_INDEX_SENSOR);
      if (binarySensorValueId) {
        this.addProperty(
          node,
          sensor.propertyName,
          sensor.propertyDescr,
          binarySensorValueId
        );
        this.addConfigLevel(node, 3, 'Motion Timeout', 10, 3600, 'seconds');
        this.addConfigList(node, 4, 'Motion Sensitivity');
        return;
      }
    }

    if (sensor.hasOwnProperty('valueListMap')) {
      alarmProperty = this.addProperty(
        node,
        sensor.propertyName,
        sensor.propertyDescr,
        valueId,
        null,
        'parseZwValueListMap'
      );
      alarmProperty.valueListMap = sensor.valueListMap;
      if (sensor.addValueId2) {
        const zwValue = node.zwValues[valueId];
        const valueId2 = node.makeValueId(zwValue.class_id, 2, zwValue.index);
        if (node.zwValues.hasOwnProperty(valueId2)) {
          alarmProperty.valueId2 = valueId2;
        }
      }
    } else if (sensor.hasOwnProperty('valueMap')) {
      alarmProperty = this.addProperty(
        node,
        sensor.propertyName,
        sensor.propertyDescr,
        valueId,
        null,
        'parseZwValueMap'
      );
      alarmProperty.valueMap = sensor.valueMap;
    }

    // Some sensors, have a binary sensor in addition to the alarm.
    // In particular, the Heiman Smoke Sensor HS1SA-Z send both a notification
    // and a binary sensor notification. However, the alarm notification
    // doesn't seem to be recognized (this might be a bug in either the
    // configuration or the openzwave library - I'm not sure). For now
    // we'll add a hidden property which also triggers the Alarm Propery.

    const zwValue = node.zwValues[valueId];
    if (alarmProperty &&
        zwValue &&
        zwValue.class_id == COMMAND_CLASS.ALARM &&
        zwValue.index == NOTIFICATION_SMOKE_DETECTOR) {
      const binarySensorValueId =
        node.findValueId(COMMAND_CLASS.SENSOR_BINARY,
                         1,
                         SENSOR_BINARY_INDEX_SENSOR);
      if (binarySensorValueId) {
        const binaryProperty = this.addProperty(
          node,
          '_on',
          {
            '@type': 'BooleanProperty',
            readOnly: true,
          },
          binarySensorValueId
        );
        binaryProperty.updated = function() {
          alarmProperty.setCachedValue(binaryProperty.value);
          node.notifyPropertyChanged(alarmProperty);
        };
      }
    }
  }

  addWakeUpProperty(node, wakeUpIntervalValueId,
                    minWakeUpIntervalValueId, maxWakeUpIntervalValueId) {
    if (minWakeUpIntervalValueId && maxWakeUpIntervalValueId) {
      const minWakeUpInterval = node.zwValues[minWakeUpIntervalValueId].value;
      const maxWakeUpInterval = node.zwValues[maxWakeUpIntervalValueId].value;
      if (minWakeUpInterval == 0 && maxWakeUpInterval == 0) {
        // This means that the sensor doesn't use the wake-up interval and
        // only wakes up due to events (like a door-open switch)
        return;
      }
      this.addProperty(
        node,
        'wakeUpInterval',
        {
          '@type': 'LevelProperty',
          type: 'number',
          label: 'WakeUp Interval',
          minimum: minWakeUpInterval,
          maximum: maxWakeUpInterval,
          unit: 'seconds',
        },
        wakeUpIntervalValueId
      );
    } else {
      this.addProperty(
        node,
        'wakeUpInterval',
        {
          label: 'WakeUp Interval',
          type: 'number',
          unit: 'seconds',
        },
        wakeUpIntervalValueId
      );
    }
  }

  initSwitch(node, binarySwitchValueId, levelValueId, suffix) {
    node['@type'] = ['OnOffSwitch'];

    console.log('binarySwitchValueId =', binarySwitchValueId,
                'levelValueId =', levelValueId,
                'suffix =', suffix);
    if (binarySwitchValueId) {
      this.addProperty(
        node,                     // node
        `on${suffix}`,            // name
        {// property decscription
          '@type': suffix ? 'BooleanProperty' : 'OnOffProperty',
          label: suffix ? `On/Off (${suffix})` : 'On/Off',
          type: 'boolean',
        },
        binarySwitchValueId       // valueId
      );
      if (levelValueId) {
        if (!suffix) {
          node['@type'].push('MultiLevelSwitch');
        }
        this.addProperty(
          node,                   // node
          `level${suffix}`,       // name
          {// property decscription
            '@type': suffix ? '' : 'LevelProperty',
            label: suffix ? `Level (${suffix})` : 'Level',
            type: 'number',
            unit: 'percent',
            minimum: 0,
            maximum: 100,
          },
          levelValueId,           // valueId
          'setLevelValue',        // setZwValueFromValue
          'parseLevelZwValue'     // parseValueFromZwValue
        );
      }
      if (suffix === '' && nodeHasAeotecS1S2Mode(node)) {
        this.addConfigList(node, 120, 'S1 Mode');
        this.addConfigList(node, 121, 'S2 Mode');
      }
    } else {
      // For switches which don't support the on/off we fake it using level
      if (!suffix) {
        node['@type'].push('MultiLevelSwitch');
      }
      this.addProperty(
        node,                     // node
        `on${suffix}`,            // name
        {// property decscription
          '@type': suffix ? 'BooleanProperty' : 'OnOffProperty',
          label: suffix ? `On/Off (${suffix})` : 'On/Off',
          type: 'boolean',
        },
        levelValueId,             // valueId
        'setOnOffLevelValue',     // setZwValueFromValue
        'parseOnOffLevelZwValue'  // parseValueFromZwValue
      );
      this.addProperty(
        node,                   // node
        `level${suffix}`,       // name
        {// property decscription
          '@type': suffix ? '' : 'LevelProperty',
          label: suffix ? `Level (${suffix})` : 'Level',
          type: 'number',
          unit: 'percent',
          minimum: 0,
          maximum: 100,
        },
        levelValueId,           // valueId
        'setOnOffLevelValue',   // setZwValueFromValue
        'parseOnOffLevelZwValue'// parseValueFromZwValue
      );
    }

    const powerValueId =
      node.findValueId(COMMAND_CLASS.METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_POWER);
    if (powerValueId) {
      if (!suffix) {
        node.isSmartPlug = true;
        node['@type'].push('SmartPlug', 'EnergyMonitor');
      }
      this.addProperty(
        node,                   // node
        `instantaneousPower${suffix}`, // name
        {// property decscription
          '@type': suffix ? '' : 'InstantaneousPowerProperty',
          label: suffix ? `Power (${suffix})` : 'Power',
          type: 'number',
          unit: 'watt',
        },
        powerValueId            // valueId
      );
    }

    const voltageValueId =
      node.findValueId(COMMAND_CLASS.METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_VOLTAGE);
    if (voltageValueId) {
      if (!suffix) {
        node.isSmartPlug = true;
      }
      this.addProperty(
        node,                   // node
        `voltage${suffix}`,     // name
        {// property decscription
          '@type': suffix ? '' : 'VoltageProperty',
          label: suffix ? `Voltage (${suffix})` : 'Voltage',
          type: 'number',
          unit: 'volt',
        },
        voltageValueId          // valueId
      );
    }

    const currentValueId =
      node.findValueId(COMMAND_CLASS.METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_CURRENT);
    if (currentValueId) {
      if (!suffix) {
        node.isSmartPlug = true;
      }
      this.addProperty(
        node,                   // node
        `current${suffix}`,     // name
        {// property decscription
          '@type': suffix ? '' : 'CurrentProperty',
          label: suffix ? `Current (${suffix})` : 'Current',
          type: 'number',
          unit: 'ampere',
          // For LED lights at 220V. With only one decimal point, the
          // current shows 0.0 A for 8 watt device.
          multipleOf: 0.01,
        },
        currentValueId          // valueId
      );
    }

    // TODO: add this data into the quirks
    if (node.zwInfo.manufacturer === 'Aeotec') {
      // When the user presses the button, tell us about it
      node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                  COMMAND_CLASS.CONFIGURATION, // classId
                                  1,                           // instance
                                  80,                          // index
                                  'Basic');                    // value
      if (node.isSmartPlug) {
        // Enable METER reporting
        node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                    COMMAND_CLASS.CONFIGURATION, // classId
                                    1,                           // instance
                                    90,                          // index
                                    1);                          // value
        // Report changes of 1 watt
        node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                    COMMAND_CLASS.CONFIGURATION, // classId
                                    1,                           // instance
                                    91,                          // index
                                    1);                          // value
      }
    }
  }

  initBinarySensor(node, binarySensorValueId) {
    if (node.properties.size == 0) {
      node['@type'] = ['DoorSensor', 'BinarySensor'];
    }
    this.addProperty(
      node,                     // node
      'on',                     // name
      {// property decscription
        '@type': 'BooleanProperty',
        type: 'boolean',
        readOnly: true,
      },
      binarySensorValueId       // valueId
    );
    this.addProperty(
      node,
      'open',
      {
        '@type': 'OpenProperty',
        type: 'boolean',
        label: 'Open',
        description: 'Contact Switch',
        readOnly: true,
      },
      binarySensorValueId
    );

    if (node.type === 'thing' && node.name == node.defaultName) {
      node.name = `${node.id}-thing`;
    }
  }

  initEntryControl(node, doorLockValueId) {
    node.name = `${node.id}-DoorLock`;
    node['@type'] = ['Lock'];

    if (doorLockValueId) {
      // The ZWave door lock is both state and control, so we create
      // a hidden property which is boolean, and have the visible state
      // be an enumeration.
      node.doorLockState = this.addProperty(
        node,
        'locked',
        {
          '@type': 'LockedProperty',
          type: 'string',
          title: 'State',
          enum: ['locked', 'unlocked', 'jammed', 'unknown'],
          readOnly: true,
        }
      );
      // Setting this property controls the door lock, and it's value
      // reflects its current state.
      node.doorLockProperty = this.addProperty(
        node,
        '_lockedInternal',
        {
          '@type': 'BooleanProperty',
          type: 'boolean',
          title: '_locked',
        },
        doorLockValueId,
      );
      // When the door lock state changes, we update the visible state
      // property.
      node.doorLockProperty.updated = function() {
        const state = node.doorLockProperty.value ? 'locked' : 'unlocked';
        node.setPropertyValue(node.doorLockState, state);
        if (node.doorLockTimeout) {
          clearTimeout(node.doorLockTimeout);
          node.doorLockTimeout = null;
        }
        if (node.doorLockAction) {
          const doorLockAction = node.doorLockAction;
          node.doorLockAction = null;
          doorLockAction.finish();
        }
      };
      // Set the initial state. Assume that the doorlock isn't jammed.
      node.doorLockProperty.updated();
    }

    const alarmValueId =
      node.findValueId(COMMAND_CLASS.ALARM,
                       1,
                       ALARM_INDEX_TYPE_V1);
    if (alarmValueId) {
      node.alarmTypeProperty = this.addProperty(
        node,
        '_alarmType',
        {
          type: 'number',
          readOnly: true,
        },
        alarmValueId
      );
      if (node.doorLockProperty) {
        // The Yale YRD110 only updates the doorLockProperty when its changed
        // from the gateway. If the user manually locks or unlocks the door
        // then it only generates alarms. We use those alarm notifications
        // to update the value of the doorLockProperty.

        node.alarmTypeProperty.updated = function() {
          // I haven't yet been able to determine a source for the following
          // numbers. This is what I observed imperically from the Yale YRD110
          // lock.

          switch (node.alarmTypeProperty.value) {
            case 21:    // Lock from touchpad or inside knob
            case 24: {  // Lock from gateway
              node.setPropertyValue(node.doorLockProperty, true);
              break;
            }
            case 19:    // Unlock from touchpad
            case 22:    // Unlock from inside knob
            case 25: {  // Unlock from gateway
              node.setPropertyValue(node.doorLockProperty, false);
              break;
            }
          }
        };
      }
    }
    this.addActions(node, {
      lock: {
        '@type': 'LockAction',
        title: 'Lock',
        description: 'Lock the deadbolt',
      },
      unlock: {
        '@type': 'UnlockAction',
        title: 'Unlock',
        description: 'Unlock the deadbolt',
      },
    });
  }

  initThermostat(node) {
    node.name = `${node.id}-Thermostat`;
    node['@type'] = ['Thermostat'];

    const thermostatStateValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_OPERATING_STATE,
                       1,
                       THERMOSTAT_INDEX_OPERATING_STATE);
    if (thermostatStateValueId) {
      this.addThermostatStateProperty(node, thermostatStateValueId);
    }

    const thermostatModeValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_MODE,
                       1,
                       THERMOSTAT_INDEX_MODE);
    if (thermostatModeValueId) {
      this.addThermostatModeProperty(node, thermostatModeValueId);
    }

    // The current temperature property is added automatically.

    const heatingTargetTempValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_SETPOINT,
                       1,
                       THERMOSTAT_INDEX_SETPOINT_HEATING);
    if (heatingTargetTempValueId) {
      this.addHeatingTargetTemperatureProperty(node, heatingTargetTempValueId);
    }

    const coolingTargetTempValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_SETPOINT,
                       1,
                       THERMOSTAT_INDEX_SETPOINT_COOLING);
    if (coolingTargetTempValueId) {
      this.addCoolingTargetTemperatureProperty(node, coolingTargetTempValueId);
    }

    const fanModeValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_FAN_MODE,
                       1,
                       THERMOSTAT_INDEX_FAN_MODE);
    if (fanModeValueId) {
      this.addFanModeProperty(node, fanModeValueId);
    }

    const fanStateValueId =
      node.findValueId(COMMAND_CLASS.THERMOSTAT_FAN_STATE,
                       1,
                       THERMOSTAT_INDEX_FAN_STATE);
    if (fanStateValueId) {
      this.addFanStateProperty(node, fanStateValueId);
    }
  }
}

module.exports = new ZWaveClassifier();
