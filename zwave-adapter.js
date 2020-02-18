/**
 *
 * ZWaveAdapter - Adapter which manages ZWave nodes
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const fs = require('fs');
const manifest = require('./manifest.json');
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');
const ZWaveNode = require('./zwave-node');
const zwaveClassifier = require('./zwave-classifier');
const {
  COMMAND_CLASS,
} = require('./zwave-constants');

const {Adapter} = require('gateway-addon');

const {
  DEBUG_flow,
} = require('./zwave-debug');

function getDataPath() {
  let profileDir;
  if (process.env.hasOwnProperty('MOZIOT_HOME')) {
    profileDir = process.env.MOZIOT_HOME;
  } else {
    profileDir = path.join(os.homedir(), '.mozilla-iot');
  }

  return path.join(profileDir, 'data', 'zwave-adapter');
}

function getLogPath() {
  if (process.env.hasOwnProperty('MOZIOT_HOME')) {
    return path.join(process.env.MOZIOT_HOME, 'log');
  }

  return path.join(os.homedir(), '.mozilla-iot', 'log');
}

class ZWaveAdapter extends Adapter {
  constructor(addonManager, config, zwaveModule, port) {
    // The ZWave adapter supports multiple dongles and
    // will create an adapter object for each dongle.
    // We don't know the actual adapter id until we
    // retrieve the home id from the dongle. So we set the
    // adapter id to zwave-unknown here and fix things up
    // later just before we call addAdapter.
    super(addonManager, 'zwave-unknown', manifest.id);
    this.config = config;
    this.port = port;
    this.ready = false;
    this.named = false;
    this.pairing = false;
    this.pairingTimeout = false;
    this.removing = false;
    this.removeTimeout = null;

    this.nodes = {};
    this.nodesBeingAdded = {};

    const logDir = getDataPath();
    if (!fs.existsSync(logDir)) {
      mkdirp.sync(logDir, {mode: 0o755});
    }

    // move any old config files to the new directory
    const oldLogDir = getLogPath();
    if (fs.existsSync(oldLogDir)) {
      const entries = fs.readdirSync(oldLogDir);
      for (const entry of entries) {
        if (entry === 'OZW_Log.txt' || entry === 'zwscene.xml' ||
            /^ozwcache_0x[A-Fa-f0-9]+\.xml/.test(entry)) {
          const oldPath = path.join(oldLogDir, entry);
          const newPath = path.join(logDir, entry);
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    const zWaveModuleOptions = {
      SaveConfiguration: true,
      ConsoleOutput: false,
      UserPath: logDir,
    };
    const configPath = path.join(__dirname, 'openzwave', 'config');
    try {
      if (fs.statSync(configPath).isDirectory()) {
        zWaveModuleOptions.ConfigPath = configPath;
      }
    } catch (e) {
      // This means that the directory doesn't exist, so we just won't
      // add it to the config.
    }

    /* eslint-disable max-len */
    /**
     * node-openzwave-shared allows for a cryptographic "network key" to be set
     * to enable adding devices using ZWave's "security mode" support. The key
     * is specified as a string containing a 16-byte hex sequence:
     *
     * Ex: "0xf7,0xf4,0x95,0xfb,0x81,0x83,0xa2,0xca,0x4e,0xe0,0x75,0x07,0x05,0x51,0x16,0x01"
     *
     * DO NOT USE THE ABOVE KEY, IT IS ONLY THERE AS AN EXAMPLE!
     *
     * A key can be specified by clicking Configure on this add-on in Gateway.
     */
    /* eslint-enable max-len */
    const networkKey = this.config.networkKey;

    if (networkKey) {
      // A regex to validate the required network key format shown above
      const networkKeyRegex = /^(?:0x[abcdef\d]{2},){15}(?:0x[abcdef\d]{2}){1}$/; // eslint-disable-line max-len
      if (networkKeyRegex.test(networkKey)) {
        console.info('Found NetworkKey, initializing with support for Security Devices'); // eslint-disable-line max-len
        zWaveModuleOptions.NetworkKey = networkKey;
      } else {
        console.warn('Found NetworkKey, but invalid format. Ignoring'); // eslint-disable-line max-len
      }
    }

    this.zwave = new zwaveModule(zWaveModuleOptions);
    this.zwave.on('controller command', this.controllerCommand.bind(this));
    this.zwave.on('driver ready', this.driverReady.bind(this));
    this.zwave.on('driver failed', this.driverFailed.bind(this));
    this.zwave.on('scan complete', this.scanComplete.bind(this));
    this.zwave.on('node added', this.nodeAdded.bind(this));
    this.zwave.on('node naming', this.nodeNaming.bind(this));
    this.zwave.on('node removed', this.nodeRemoved.bind(this));
    this.zwave.on('node event', this.nodeEvent.bind(this));
    this.zwave.on('node ready', this.nodeReady.bind(this));
    this.zwave.on('notification', this.nodeNotification.bind(this));
    this.zwave.on('value added', this.valueAdded.bind(this));
    this.zwave.on('value changed', this.valueChanged.bind(this));
    this.zwave.on('value removed', this.valueRemoved.bind(this));
    this.zwave.on('scene event', this.sceneEvent.bind(this));

    this.zwave.connect(port.comName);
  }

  asDict() {
    const dict = super.asDict();
    const node1 = this.nodes[1];
    if (node1) {
      this.node1 = node1.asDict();
    }
    return dict;
  }

  dump() {
    console.log(this.oneLineSummary());
    console.log(ZWaveNode.oneLineHeader(0));
    console.log(ZWaveNode.oneLineHeader(1));
    for (const nodeId in this.nodes) {
      const node = this.nodes[nodeId];
      console.log(node.oneLineSummary());
    }
    console.log('----');
  }

  controllerCommand(nodeId, retVal, state, msg) {
    console.log('Controller Command feedback: %s node%d retVal:%d ' +
                'state:%d', msg, nodeId, retVal, state);
  }

  driverReady(homeId) {
    console.log('Driver Ready: HomeId:', homeId.toString(16));
    this.id = `zwave-${homeId.toString(16)}`;

    this.manager.addAdapter(this);
  }

  driverFailed() {
    console.log('failed to start driver');
    this.zwave.disconnect(this.port.comName);
  }

  handleDeviceAdded(node) {
    if (DEBUG_flow) {
      console.log(`handleDeviceAdded: ${node.nodeId} name: ${node.name}`);
    }
    delete this.nodesBeingAdded[node.zwInfo.nodeId];

    if (node.nodeId > 1) {
      zwaveClassifier.classify(node);
      super.handleDeviceAdded(node);
    }
  }

  handleDeviceRemoved(node) {
    if (DEBUG_flow) {
      console.log('handleDeviceRemoved:', node.nodeId);
    }
    delete this.nodes[node.zwInfo.nodeId];
    delete this.nodesBeingAdded[node.zwInfo.nodeId];
    super.handleDeviceRemoved(node);
  }

  scanComplete() {
    // Add any nodes which otherwise aren't responding. This typically
    // corresponds to devices which are sleeping and only check in periodically.
    for (const nodeId in this.nodesBeingAdded) {
      const node = this.nodesBeingAdded[nodeId];
      if (node.lastStatus !== 'dead') {
        this.handleDeviceAdded(node);
      }
    }
    console.log('Scan complete');
    this.ready = true;
    this.dump();
  }

  nodeAdded(nodeId) {
    if (DEBUG_flow) {
      console.log('node%d added', nodeId);
    }

    // Pass in the empty string as a name here. Once the node is initialized
    // (i.e. nodeReady) then if the user has assigned a name, we'll get
    // that name.
    const node = new ZWaveNode(this, nodeId, '');
    this.nodes[nodeId] = node;
    this.nodesBeingAdded[nodeId] = node;
    node.lastStatus = 'added';
  }

  nodeNaming(nodeId, nodeInfo) {
    const node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'named';
      const zwInfo = node.zwInfo;
      zwInfo.location = nodeInfo.loc;
      zwInfo.manufacturer = nodeInfo.manufacturer;
      zwInfo.manufacturerId = nodeInfo.manufacturerid;
      zwInfo.product = nodeInfo.product;
      zwInfo.productType = nodeInfo.producttype;
      zwInfo.productId = nodeInfo.productid;
      zwInfo.type = nodeInfo.type;

      if (zwInfo.product.startsWith('Unknown: ')) {
        zwInfo.product = `${zwInfo.manufacturer} ${zwInfo.product}`;
      }

      if (nodeInfo.name) {
        // Use the assigned name, if it exists
        node.name = nodeInfo.name;
      } else if (node.defaultName) {
        // Otherwise use the constructed name
        node.name = node.defaultName;
      } else if (nodeId > 1) {
        // We don't have anything else, use the id
        node.name = node.id;
      }

      if (DEBUG_flow || !node.named) {
        console.log(
          'node%d: Named',
          nodeId,
          zwInfo.manufacturer ?
            zwInfo.manufacturer :
            `id=${zwInfo.manufacturerId}`,
          zwInfo.product ?
            zwInfo.product :
            `product=${zwInfo.productId}, type=${zwInfo.productType}`);
        console.log('node%d: name="%s", type="%s", location="%s"',
                    zwInfo.nodeId, node.name, zwInfo.type, zwInfo.location);
      }
      node.named = true;

      if (DEBUG_flow) {
        for (const comClass of node.zwClasses) {
          const comClassStr = COMMAND_CLASS[comClass] || '';
          console.log('node%d: class %d', nodeId, comClass, comClassStr);
          for (const valueId in node.zwValues) {
            const zwValue = node.zwValues[valueId];
            if (zwValue.class_id == comClass) {
              console.log('node%d:   %s=%s',
                          nodeId, zwValue.label, zwValue.value);
            }
          }
        }
      }
    }
  }

  nodeRemoved(nodeId) {
    if (DEBUG_flow) {
      console.log('node%d removed', nodeId);
    }

    const node = this.nodes[nodeId];
    if (node) {
      if (this.removeTimeout !== null) {
        clearTimeout(this.removeTimeout);
        this.removeTimeout = null;
      }

      node.lastStatus = 'removed';
      this.handleDeviceRemoved(node);
      this.removing = false;
    }
  }

  nodeEvent(nodeId, data) {
    console.log('node%d event: Basic set %d', nodeId, data);
  }

  // eslint-disable-next-line no-unused-vars
  nodeReady(nodeId, nodeInfo) {
    const node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'ready';
      node.ready = true;

      if (nodeId in this.nodesBeingAdded) {
        this.handleDeviceAdded(node);
      }
      for (const property of node.properties.values()) {
        if (!property.valueId) {
          continue;
        }
        const zwValue = node.zwValues[property.valueId];
        if (!zwValue) {
          continue;
        }
        switch (zwValue.class_id) {
          case 0x25: // COMMAND_CLASS_SWITCH_BINARY
          case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
            if (node.disablePoll) {
              // Polling is disabled by default, but his will cover
              // off the case where a device was previously set to poll
              // (which is remembered in the config file)
              this.zwave.disablePoll(zwValue);
            } else {
              this.zwave.enablePoll(zwValue, 1);
            }
            break;
        }
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  nodeNotification(nodeId, notif, help) {
    const node = this.nodes[nodeId];
    let lastStatus;
    switch (notif) {
      case 0:
        console.log('node%d: message complete', nodeId);
        lastStatus = 'msgCmplt';
        break;
      case 1:
        console.log('node%d: timeout', nodeId);
        lastStatus = 'timeout';
        break;
      case 2:
        if (DEBUG_flow) {
          console.log('node%d: nop', nodeId);
        }
        lastStatus = 'nop';
        break;
      case 3:
        console.log('node%d: node awake', nodeId);
        lastStatus = 'awake';
        break;
      case 4:
        console.log('node%d: node sleep', nodeId);
        lastStatus = 'sleeping';
        node.canSleep = true;
        break;
      case 5:
        console.log('node%d: node dead', nodeId);
        lastStatus = 'dead';
        break;
      case 6:
        console.log('node%d: node alive', nodeId);
        lastStatus = 'alive';
        break;
    }
    if (node && lastStatus) {
      node.lastStatus = lastStatus;
    }
  }

  oneLineSummary() {
    return `Controller: ${this.id} Path: ${this.port.comName}`;
  }

  sceneEvent(nodeId, sceneId) {
    console.log('scene event: nodeId:', nodeId, 'sceneId', sceneId);
  }

  valueAdded(nodeId, comClass, value) {
    const node = this.nodes[nodeId];
    if (node) {
      node.zwValueAdded(comClass, value);
    }
  }

  valueChanged(nodeId, comClass, value) {
    const node = this.nodes[nodeId];
    if (node) {
      node.zwValueChanged(comClass, value);
    }
  }

  valueRemoved(nodeId, comClass, valueInstance, valueIndex) {
    const node = this.nodes[nodeId];
    if (node) {
      node.zwValueRemoved(comClass, valueInstance, valueIndex);
    }
  }

  startPairing(timeoutSeconds) {
    if (this.pairing) {
      return;
    }

    if (this.removing) {
      const msg = 'Cannot pair while attempting to remove a device.';
      console.log(msg);
      if (this.sendPairingPrompt) {
        this.sendPairingPrompt(msg);
      }

      return;
    }

    const msg = 'Press the inclusion button on the ZWave device to add';
    console.log('===============================================');
    console.log(msg);
    console.log('===============================================');
    this.pairing = true;
    if (this.sendPairingPrompt) {
      this.sendPairingPrompt(msg);
    }
    const doSecurity = true;  // Will do secure inclusion, if available
    this.zwave.addNode(doSecurity);

    this.pairingTimeout = setTimeout(
      this.cancelPairing.bind(this),
      timeoutSeconds * 1000
    );
  }

  cancelPairing() {
    if (this.pairingTimeout !== null) {
      clearTimeout(this.pairingTimeout);
      this.pairingTimeout = null;
    }

    if (this.pairing) {
      console.log('Cancelling pairing mode');
      this.zwave.cancelControllerCommand();
      this.pairing = false;
    }
  }

  /**
   * Remove a device.
   *
   * @param {Object} device The device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeThing(device) {
    if (this.removing) {
      return;
    }

    if (this.pairing) {
      const msg = 'Cannot remove thing while pairing.';
      console.log(msg);
      if (this.sendUnpairingPrompt) {
        this.sendUnpairingPrompt(msg, null, device);
      }

      return;
    }

    // ZWave can't really remove a particular thing.
    const msg = 'Press the exclusion button on the ZWave device to remove';
    console.log('==================================================');
    console.log(msg);
    console.log('==================================================');
    this.removing = true;
    if (this.sendUnpairingPrompt) {
      this.sendUnpairingPrompt(msg, null, device);
    }

    this.zwave.removeNode();

    // Cancel the removal after 60 seconds. If the node is properly removed,
    // the timeout will be cancelled in nodeRemoved().
    this.removeTimeout = setTimeout(this.cancelRemoveThing.bind(this), 30000);
  }

  cancelRemoveThing() {
    if (this.removeTimeout !== null) {
      clearTimeout(this.removeTimeout);
      this.removeTimeout = null;
    }

    if (this.removing) {
      console.log('Cancelling remove mode');
      this.zwave.cancelControllerCommand();
      this.removing = false;
    }
  }

  unload() {
    // Wrap in setTimeout to resolve issues with disconnect() hanging.
    // See: https://github.com/OpenZWave/node-openzwave-shared/issues/182
    setTimeout(() => {
      this.zwave.disconnect(this.port.comName);
    }).ref();

    return super.unload();
  }
}

module.exports = ZWaveAdapter;
