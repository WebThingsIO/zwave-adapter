/**
 * test-classifier.js - Test code for testing the zwave classifier.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

// require('../zwave-debug').set('classifier');

const AddonManager = require('./mock-addonManager');
const ZWaveModule = require('./mock-zwaveModule');
const ZWaveAdapter = require('../zwave-adapter');

const classifierFolder = './test/classifier/';

const manifest = JSON.parse(fs.readFileSync('./package.json'));

function classifyJson(pathname) {
  describe(path.basename(pathname), () => {
    it('properties', () => {
      console.log('=============== Test for', pathname, '===============');

      const data = fs.readFileSync(pathname);
      const json = JSON.parse(data);
      const addonManager = new AddonManager();
      const port = {
        comName: 'dummyPort',
      };
      const adapter = new ZWaveAdapter(addonManager, manifest,
                                       ZWaveModule, port);

      console.log(json.zwInfo.product);

      const zwave = adapter.zwave;
      zwave.addNode(json);

      const node = addonManager.nodes[json.zwInfo.nodeId];

      // Verify that the node properties match what we were expecting

      expect(node['@type']).toStrictEqual(json['@type']);
      node.properties.forEach((property, propertyName) => {
        console.log('Testing property', propertyName);
        if (json.properties.hasOwnProperty(propertyName)) {
          const jsonProperty = json.properties[propertyName];
          expect(property.asDict()).toEqual(jsonProperty);
        } else {
          fail(`Missing property ${propertyName}`);
        }
      });

      for (const jsonPropertyName in json.properties) {
        expect(node.properties.has(jsonPropertyName)).toBeTruthy();
      }

      node.actions.forEach((action, actionName) => {
        console.log('Testing action', actionName);
        if (json.actions.hasOwnProperty(actionName)) {
          const jsonAction = json.actions[actionName];
          expect(action).toEqual(jsonAction);
        } else {
          fail(`Missing action ${actionName}`);
        }
      });

      for (const jsonActionName in json.actions) {
        expect(node.actions.has(jsonActionName)).toBeTruthy();
      }
    });
  });
}

if (process.env.CLASSIFY_FILE) {
  const pathname = path.join(classifierFolder, process.env.CLASSIFY_FILE);
  classifyJson(pathname);
} else {
  const files = fs.readdirSync(classifierFolder);
  files.forEach((filename) => {
    const pathname = path.join(classifierFolder, filename);
    classifyJson(pathname);
  });
}
