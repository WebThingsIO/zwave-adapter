/**
 * mock-zwaveModule.js - ZWave Module used for testing.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const EventEmitter = require('events').EventEmitter;

class MockZWaveModule extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.nodes = {};
  }

  addNode(node) {
    this.nodes[node.zwInfo.nodeId] = node;
    this.emit('node added', node.zwInfo.nodeId);
    for (const valueId in node.zwValues) {
      const zwValue = node.zwValues[valueId];
      this.emit('value added', zwValue.node_id, zwValue.class_id, zwValue);
    }
    const zwInfo = node.zwInfo;
    const nodeId = zwInfo.nodeId;
    const nodeInfo = {
      loc: zwInfo.location,
      manufacturer: zwInfo.manufacturer,
      manufacturerid: zwInfo.manufacturerId,
      product: zwInfo.product,
      producttype: zwInfo.productType,
      productid: zwInfo.productId,
      type: zwInfo.type,
      name: zwInfo.name,
    };
    this.emit('node naming', nodeId, nodeInfo);
    this.emit('node ready', nodeId, nodeInfo);
  }

  connect(portName) {
    console.log('MockZWaveModule: connect', portName);
  }

  disablePoll(_zwValue) {
  }

  enablePoll(_zwValue, _intensity) {
  }

  getNodeBasic(nodeId) {
    const node = this.nodes[nodeId];
    if (node) {
      return node.zwInfo.basicType;
    }
  }

  getNodeGeneric(nodeId) {
    const node = this.nodes[nodeId];
    if (node) {
      return node.zwInfo.genericType;
    }
  }

  getNodeSpecific(nodeId) {
    const node = this.nodes[nodeId];
    if (node) {
      return node.zwInfo.specificType;
    }
  }

  setConfigParam(_nodeId, _paramId, _value, _size) {
  }

  scanComplete() {
    this.emit('scan complete');
  }

  writeConfig() {
  }
}

module.exports = MockZWaveModule;
