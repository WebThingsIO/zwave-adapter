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

let Constants;
try {
  Constants = require('../addon-constants');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }

  Constants = require('gateway-addon').Constants;
}

// See; http://wiki.micasaverde.com/index.php/ZWave_Command_Classes for a
// complete list of command classes.

const COMMAND_CLASS_SWITCH_BINARY = 37;       // 0x25
const COMMAND_CLASS_SWITCH_MULTILEVEL = 38;   // 0x26
const COMMAND_CLASS_SENSOR_BINARY  = 48;      // 0x30
const COMMAND_CLASS_METER = 50;               // 0x32
//const COMMAND_CLASS_SWITCH_ALL = 39;        // 0x27
const COMMAND_CLASS_CONFIGURATION = 112;    // 0x98

const AEOTEC_MANUFACTURER_ID = '0x0086';
const AEOTEC_ZW096_PRODUCT_ID = '0x0060';

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
    // setting it acts like a no-op. We remove the level property so that
    // the UI doesn't see it.
    zwInfo: {
      manufacturerId: AEOTEC_MANUFACTURER_ID,
      productId: AEOTEC_ZW096_PRODUCT_ID,
    },
    excludeProperties: ['level'],
  },
];

class ZWaveClassifier {

  constructor() {
  }

  classify(node) {
    const binarySwitchValueId =
      node.findValueId(COMMAND_CLASS_SWITCH_BINARY, 1, 0);
    const levelValueId =
      node.findValueId(COMMAND_CLASS_SWITCH_MULTILEVEL, 1, 0);
    if (binarySwitchValueId || levelValueId) {
      this.initSwitch(node, binarySwitchValueId, levelValueId);
      return;
    }

    let binarySensorValueId =
      node.findValueId(COMMAND_CLASS_SENSOR_BINARY, 1, 0);
    if (binarySensorValueId) {
      this.initBinarySensor(node, binarySensorValueId);
      return;
    }
  }

  addProperty(node, name, descr, valueId,
              setZwValueFromValue, parseValueFromZwValue) {
    // Search through the known quirks and see if we need to apply any.
    for (const quirk of QUIRKS) {
      if (!quirk.hasOwnProperty('excludeProperties')) {
        continue;
      }

      let match = true;
      for (const id in quirk.zwInfo) {
        if (node.zwInfo[id] !== quirk.zwInfo[id]) {
          match = false;
          break;
        }
      }

      if (match && quirk.excludeProperties.includes(name)) {
        console.log(
          `Not adding property ${name} to device ${node.id} due to quirk.`);
        return;
      }
    }

    let property = new ZWaveProperty(node, name, descr, valueId,
                                     setZwValueFromValue,
                                     parseValueFromZwValue);
    node.properties.set(name, property);
  }

  initSwitch(node, binarySwitchValueId, levelValueId) {
    if (binarySwitchValueId) {
      node.type = Constants.THING_TYPE_ON_OFF_SWITCH;
      this.addProperty(
        node,                     // node
        'on',                     // name
        {                         // property decscription
          type: 'boolean'
        },
        binarySwitchValueId       // valueId
      );
      if (levelValueId) {
        node.type = Constants.THING_TYPE_MULTI_LEVEL_SWITCH;
        this.addProperty(
          node,                   // node
          'level',                // name
          {                       // property decscription
            type: 'number',
            unit: 'percent',
            min: 0,
            max: 100,
          },
          levelValueId,           // valueId
          'setLevelValue',        // setZwValueFromValue
          'parseLevelZwValue'     // parseValueFromZwValue
        );
      }
    } else {
      // For switches which don't support the on/off we fake it using level
      node.type = Constants.THING_TYPE_MULTI_LEVEL_SWITCH;
      this.addProperty(
        node,                     // node
        'on',                     // name
        {                         // property decscription
          type: 'boolean'
        },
        levelValueId,             // valueId
        'setOnOffLevelValue',     // setZwValueFromValue
        'parseOnOffLevelZwValue'  // parseValueFromZwValue
      );
      this.addProperty(
        node,                   // node
        'level',                // name
        {                       // property decscription
          type: 'number',
          unit: 'percent',
          min: 0,
          max: 100,
        },
        levelValueId,           // valueId
        'setOnOffLevelValue',   // setZwValueFromValue
        'parseOnOffLevelZwValue'// parseValueFromZwValue
      );
    }

    let powerValueId = node.findValueId(COMMAND_CLASS_METER, 1, 8);
    if (powerValueId) {
      node.type = Constants.THING_TYPE_SMART_PLUG;
      this.addProperty(
        node,                   // node
        'instantaneousPower',   // name
        {                       // property decscription
          type: 'number',
          unit: 'watt',
        },
        powerValueId            // valueId
      );
    }

    let voltageValueId = node.findValueId(COMMAND_CLASS_METER, 1, 16);
    if (voltageValueId) {
      node.type = Constants.THING_TYPE_SMART_PLUG;
      this.addProperty(
        node,                   // node
        'voltage',              // name
        {                       // property decscription
          type: 'number',
          unit: 'volt',
        },
        voltageValueId          // valueId
      );
    }

    let currentValueId = node.findValueId(COMMAND_CLASS_METER, 1, 20);
    if (currentValueId) {
      node.type = Constants.THING_TYPE_SMART_PLUG;
      this.addProperty(
        node,                   // node
        'current',              // name
        {                       // property decscription
          type: 'number',
          unit: 'ampere',
        },
        currentValueId          // valueId
      );
    }

    // TODO: add this data into the quirks
    if (node.zwInfo.manufacturer === 'Aeotec') {
      // When the user presses the button, tell us about it
      node.adapter.zwave.setValue(node.zwInfo.nodeId,         // nodeId
                                  COMMAND_CLASS_CONFIGURATION,// classId
                                  1,                          // instance
                                  80,                         // index
                                  'Basic');                   // value
      if (node.type === Constants.THING_TYPE_SMART_PLUG) {
        // Enable METER reporting
        node.adapter.zwave.setValue(node.zwInfo.nodeId,         // nodeId
                                    COMMAND_CLASS_CONFIGURATION,// classId
                                    1,                          // instance
                                    90,                         // index
                                    1);                         // value
        // Report changes of 1 watt
        node.adapter.zwave.setValue(node.zwInfo.nodeId,         // nodeId
                                    COMMAND_CLASS_CONFIGURATION,// classId
                                    1,                          // instance
                                    91,                         // index
                                    1);                         // value
      }
    }
  }

  initBinarySensor(node, binarySensorValueId) {
    node.type = Constants.THING_TYPE_BINARY_SENSOR;
    this.addProperty(
      node,                     // node
      'on',                     // name
      {                         // property decscription
        type: 'boolean'
      },
      binarySensorValueId       // valueId
    );
  }
}

module.exports = new ZWaveClassifier();
