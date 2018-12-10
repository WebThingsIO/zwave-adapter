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

const {Constants} = require('gateway-addon');

// See; http://wiki.micasaverde.com/index.php/ZWave_Command_Classes for a
// complete list of command classes.

const COMMAND_CLASS_SWITCH_BINARY = 37;       // 0x25
const COMMAND_CLASS_SWITCH_MULTILEVEL = 38;   // 0x26
const COMMAND_CLASS_SENSOR_BINARY = 48;       // 0x30
const COMMAND_CLASS_SENSOR_MULTILEVEL = 49;   // 0x31
const COMMAND_CLASS_METER = 50;               // 0x32
// const COMMAND_CLASS_SWITCH_ALL = 39;       // 0x27
const COMMAND_CLASS_CENTRAL_SCENE = 91;       // 0x5b
const COMMAND_CLASS_CONFIGURATION = 112;      // 0x70
const COMMAND_CLASS_ALARM = 113;              // 0x71
const COMMAND_CLASS_BATTERY = 128;            // 0x80

const AEOTEC_MANUFACTURER_ID = '0x0086';
const AEOTEC_ZW096_PRODUCT_ID = '0x0060'; // SmartPlug
const AEOTEC_ZW100_PRODUCT_ID = '0x0064'; // Multisensor 6

// From cpp/src/command_classes/SwitchMultilevel.cpp
// The code uses "_data[5]+3" for the index.
//
// Refer to ZWave document SDS13781 "Z-Wave Application Command Class
// Specification". In the Notification Type and Event fields. The
// notification type of "Home Security" has a Notification Type of 7,
// which means it will be reported as an index of 10 (due to the +3
// mentioned above).
const ALARM_INDEX_HOME_SECURITY = 10;

// This would be from Battery.cpp, but it only has a single index.
const BATTERY_INDEX_LEVEL = 0;

// From cpp/src/command_classes/CentralScene.cpp#L51
const CENTRAL_SCENE_COUNT = 0;
const CENTRAL_SCENE_1 = 1;
const CENTRAL_SCENE_2 = 2;

// Refer to ZWave document SDS13781 "Z-Wave Application Command Class
// Specification", Table 67 - Meter Table Capability Report.
// These constants are the bit number times 4.
const METER_INDEX_ELECTRIC_INSTANT_POWER = 8;    // Bit 2
const METER_INDEX_ELECTRIC_INSTANT_VOLTAGE = 16; // Bit 3
const METER_INDEX_ELECTRIC_INSTANT_CURRENT = 20; // Bit 5

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

// This would be from SwitchBinary.cpp, but it only has a single index.
const SWITCH_BINARY_INDEX_SWITCH = 0;

// From the SwitchMultilevelIndex enum in OpenZWave:
//    cpp/src/command_classes/SwitchMultilevel.cpp
//
// Note: These constants are specific to the OpenZWave library and not
//       part of the ZWave specification.
const SWITCH_MULTILEVEL_INDEX_LEVEL = 0;

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
    // The Aeotec ZW096 says it supports the MULTILEVEL command class, but
    // setting it acts like a no-op. We remove the 'level' property so that
    // the UI doesn't see it.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productId: AEOTEC_ZW096_PRODUCT_ID,
    },
    excludeProperties: ['level'],
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
      {instance: 1, index: 5, value: 1},
    ],
  },
];

function quirkMatches(quirk, node) {
  let match = true;
  for (const id in quirk.zwInfo) {
    if (node.zwInfo[id] !== quirk.zwInfo[id]) {
      match = false;
      break;
    }
  }
  return match;
}


class ZWaveClassifier {
  classify(node) {
    this.classifyInternal(node);

    // Any type of device can be battery powered, so we do this check for
    // all devices.
    const batteryValueId =
      node.findValueId(COMMAND_CLASS_BATTERY,
                       1,
                       BATTERY_INDEX_LEVEL);
    if (batteryValueId) {
      this.addBatteryProperty(node, batteryValueId);
    }
  }

  classifyInternal(node) {
    // Search through the known quirks and see if we need to apply any
    // configurations
    for (const quirk of QUIRKS) {
      if (!quirk.hasOwnProperty('setConfigs')) {
        continue;
      }

      if (quirkMatches(quirk, node)) {
        for (const setConfig of quirk.setConfigs) {
          console.log(`Setting device ${node.id} config ` +
                      `instance: ${setConfig.instance}` +
                      `index: ${setConfig.index}` +
                      `to value: ${setConfig.value}`);
          node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                      COMMAND_CLASS_CONFIGURATION, // classId
                                      setConfig.instance,          // instance
                                      setConfig.index,             // index
                                      setConfig.value);            // value
        }
      }
    }

    const binarySwitchValueId =
      node.findValueId(COMMAND_CLASS_SWITCH_BINARY,
                       1,
                       SWITCH_BINARY_INDEX_SWITCH);
    const levelValueId =
      node.findValueId(COMMAND_CLASS_SWITCH_MULTILEVEL,
                       1,
                       SWITCH_MULTILEVEL_INDEX_LEVEL);
    if (binarySwitchValueId || levelValueId) {
      // Some devices (like the ZW099 Smart Dimmer 6) advertise instance
      // 1 and 2, and don't seem to work on instance 2. So we always
      // use instance 1 for the first outlet, and then 3 and beyond for the
      // second and beyond outlets.
      this.initSwitch(node, binarySwitchValueId, levelValueId, '');

      // Check to see if this is a switch with multiple outlets.
      let inst = 3;
      let switchCount = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const bsValueId =
          node.findValueId(COMMAND_CLASS_SWITCH_BINARY,
                           inst,
                           SWITCH_BINARY_INDEX_SWITCH);
        const lvlValueId =
          node.findValueId(COMMAND_CLASS_SWITCH_MULTILEVEL,
                           inst,
                           SWITCH_MULTILEVEL_INDEX_LEVEL);
        if (bsValueId || lvlValueId) {
          switchCount += 1;
          this.initSwitch(node, bsValueId, lvlValueId, switchCount.toString());
          inst += 1;
        } else {
          break;
        }
      }
      return;
    }

    node.type = 'thing';  // Just in case it doesn't classify as anything else

    const alarmValueId =
      node.findValueId(COMMAND_CLASS_ALARM,
                       1,
                       ALARM_INDEX_HOME_SECURITY);
    if (alarmValueId) {
      this.addAlarmProperty(node, alarmValueId);
    }

    const temperatureValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_TEMPERATURE);
    if (temperatureValueId) {
      this.addTemperatureProperty(node, temperatureValueId);
    }

    const luminanceValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_LUMINANCE);
    if (luminanceValueId) {
      this.addLuminanceProperty(node, luminanceValueId);
    }

    const humidityValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_RELATIVE_HUMIDITY);
    if (humidityValueId) {
      this.addHumidityProperty(node, humidityValueId);
    }

    const uvValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_MULTILEVEL,
                       1,
                       SENSOR_MULTILEVEL_INDEX_ULTRAVIOLET);
    if (uvValueId) {
      this.addUltravioletProperty(node, uvValueId);
    }

    const binarySensorValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_BINARY,
                       1,
                       SENSOR_BINARY_INDEX_SENSOR);
    if (binarySensorValueId) {
      this.initBinarySensor(node, binarySensorValueId);
    }

    const centralSceneValueId =
      node.findValueId(COMMAND_CLASS_CENTRAL_SCENE,
                       1,
                       CENTRAL_SCENE_COUNT);
    if (centralSceneValueId) {
      this.initCentralScene(node);
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
    node.properties.set(name, property);
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
      },
      luminanceValueId
    );
  }

  addTemperatureProperty(node, temperatureValueId) {
    const descr = {
      // TODO: add proper @type
      label: 'Temperature',
      type: 'number',
    };
    const zwValue = node.zwValues[temperatureValueId];
    if (zwValue.units === 'F') {
      descr.unit = 'farenheit';
    } else if (zwValue.units === 'C') {
      descr.unit = 'celsius';
    }
    this.addProperty(
      node,
      'temperature',
      descr,
      temperatureValueId
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
      },
      uvValueId
    );
  }

  initCentralScene(node) {
    node['@type'] = ['OnOffSwitch', 'MultiLevelSwitch', 'PushButton'];
    node.name = `${node.id}-button`;

    node.centralSceneOnProperty = this.addCentralSceneOnProperty(node);
    node.centralSceneLevelProperty = this.addCentralSceneLevelProperty(node);

    node.centralSceneOnProperty.value = false;
    node.centralSceneLevelProperty.value = 0;

    this.addCentralSceneButton(node, CENTRAL_SCENE_1);
    this.addCentralSceneButton(node, CENTRAL_SCENE_2);
  }

  addCentralSceneButton(node, buttonNum) {
    const valueId = node.findValueId(COMMAND_CLASS_CENTRAL_SCENE,
                                     1,
                                     buttonNum);
    const buttonProperty = this.addProperty(node,
                                            `_button${buttonNum}`,
                                            {
                                              '@type': 'number',
                                              readOnly: true,
                                            },
                                            valueId);
    buttonProperty.buttonNum = buttonNum;

    buttonProperty.updated = function() {
      node.handleCentralSceneButton(buttonProperty);
    };

    let buttonLabel = `${buttonNum}`;
    switch (buttonNum) {
      case 1:
        buttonLabel = 'Top';
        break;
      case 2:
        buttonLabel = 'Bottom';
        break;
    }
    this.addEvents(node, {
      [`${buttonNum}-pressed`]: {
        '@type': 'PressedEvent',
        description: `${buttonLabel} button pressed and released quickly`,
      },
      [`${buttonNum}-released`]: {
        '@type': 'ReleasedEvent',
        description: `${buttonLabel} button released after being held`,
      },
      [`${buttonNum}-longPressed`]: {
        '@type': 'LongPressedEvent',
        description: `${buttonLabel} button pressed and held`,
      },
    });
  }

  addCentralSceneOnProperty(node) {
    return this.addProperty(
      node,                     // node
      'on',                     // name
      {                         // property decscription
        '@type': 'BooleanProperty',
        type: 'boolean',
        readOnly: true,
      },
      null                      // valueId
    );
  }

  addCentralSceneLevelProperty(node) {
    return this.addProperty(
      node,                   // node
      `level`,                // name
      {                       // property decscription
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

  initSwitch(node, binarySwitchValueId, levelValueId, suffix) {
    node['@type'] = ['OnOffSwitch'];

    if (binarySwitchValueId) {
      if (suffix) {
        // Until we have the capabilities system, in order for the UI
        // to display the second switch, we need to call it a thing.
        node.type = 'thing';
      } else {
        node.type = Constants.THING_TYPE_ON_OFF_SWITCH;
      }
      this.addProperty(
        node,                     // node
        `on${suffix}`,            // name
        {                         // property decscription
          '@type': suffix ? 'BooleanProperty' : 'OnOffProperty',
          label: suffix ? `On/Off (${suffix})` : 'On/Off',
          type: 'boolean',
        },
        binarySwitchValueId       // valueId
      );
      if (levelValueId) {
        if (!suffix) {
          node.type = Constants.THING_TYPE_MULTI_LEVEL_SWITCH;
          node['@type'].push('MultiLevelSwitch');
        }
        this.addProperty(
          node,                   // node
          `level${suffix}`,       // name
          {                       // property decscription
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
    } else {
      // For switches which don't support the on/off we fake it using level
      if (!suffix) {
        node.type = Constants.THING_TYPE_MULTI_LEVEL_SWITCH;
        node['@type'].push('MultiLevelSwitch');
      }
      this.addProperty(
        node,                     // node
        `on${suffix}`,            // name
        {                         // property decscription
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
        {                       // property decscription
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
      node.findValueId(COMMAND_CLASS_METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_POWER);
    if (powerValueId) {
      if (!suffix) {
        node.type = Constants.THING_TYPE_SMART_PLUG;
        node['@type'].push('SmartPlug', 'EnergyMonitor');
      }
      this.addProperty(
        node,                   // node
        `instantaneousPower${suffix}`, // name
        {                       // property decscription
          '@type': suffix ? '' : 'InstantaneousPowerProperty',
          label: suffix ? `Power (${suffix})` : 'Power',
          type: 'number',
          unit: 'watt',
        },
        powerValueId            // valueId
      );
    }

    const voltageValueId =
      node.findValueId(COMMAND_CLASS_METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_VOLTAGE);
    if (voltageValueId) {
      if (!suffix) {
        node.type = Constants.THING_TYPE_SMART_PLUG;
      }
      this.addProperty(
        node,                   // node
        `voltage${suffix}`,     // name
        {                       // property decscription
          '@type': suffix ? '' : 'VoltageProperty',
          label: suffix ? `Voltage (${suffix})` : 'Voltage',
          type: 'number',
          unit: 'volt',
        },
        voltageValueId          // valueId
      );
    }

    const currentValueId =
      node.findValueId(COMMAND_CLASS_METER,
                       1,
                       METER_INDEX_ELECTRIC_INSTANT_CURRENT);
    if (currentValueId) {
      if (!suffix) {
        node.type = Constants.THING_TYPE_SMART_PLUG;
      }
      this.addProperty(
        node,                   // node
        `current${suffix}`,     // name
        {                       // property decscription
          '@type': suffix ? '' : 'CurrentProperty',
          label: suffix ? `Current (${suffix})` : 'Current',
          type: 'number',
          unit: 'ampere',
        },
        currentValueId          // valueId
      );
    }

    // TODO: add this data into the quirks
    if (node.zwInfo.manufacturer === 'Aeotec') {
      // When the user presses the button, tell us about it
      node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                  COMMAND_CLASS_CONFIGURATION, // classId
                                  1,                           // instance
                                  80,                          // index
                                  'Basic');                    // value
      if (node.type === Constants.THING_TYPE_SMART_PLUG) {
        // Enable METER reporting
        node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                    COMMAND_CLASS_CONFIGURATION, // classId
                                    1,                           // instance
                                    90,                          // index
                                    1);                          // value
        // Report changes of 1 watt
        node.adapter.zwave.setValue(node.zwInfo.nodeId,          // nodeId
                                    COMMAND_CLASS_CONFIGURATION, // classId
                                    1,                           // instance
                                    91,                          // index
                                    1);                          // value
      }
    }
  }

  initBinarySensor(node, binarySensorValueId) {
    if (node.properties.size == 0) {
      node.type = Constants.THING_TYPE_BINARY_SENSOR;
      node['@type'] = ['BinarySensor'];
    }
    this.addProperty(
      node,                     // node
      'on',                     // name
      {                         // property decscription
        '@type': 'BooleanProperty',
        type: 'boolean',
      },
      binarySensorValueId       // valueId
    );

    if (node.type === 'thing' && node.name == node.defaultName) {
      node.name = `${node.id}-thing`;
    }
  }
}

module.exports = new ZWaveClassifier();
