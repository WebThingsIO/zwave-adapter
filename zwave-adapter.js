/**
 *
 * ZWaveAdapter - Adapter which manages ZWave nodes
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ZWaveNode = require('./zwave-node');
const SerialPort = require('serialport');
const zwaveClassifier = require('./zwave-classifier');

let Adapter;
try {
  Adapter = require('../adapter');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }

  Adapter = require('gateway-addon').Adapter;
}

let ZWaveModule;
// This will get set to the contents of package.json within loadZWaveAdapters(),
// at which point we can reference config values in the `moziot` section
let adapterManifest;

const DEBUG = false;

class ZWaveAdapter extends Adapter {
  constructor(addonManager, packageName, port) {
    // The ZWave adapter supports multiple dongles and
    // will create an adapter object for each dongle.
    // We don't know the actual adapter id until we
    // retrieve the home id from the dongle. So we set the
    // adapter id to zwave-unknown here and fix things up
    // later just before we call addAdapter.
    super(addonManager, 'zwave-unknown', packageName);
    this.ready = false;
    this.named = false;

    this.port = port;
    this.nodes = {};
    this.nodesBeingAdded = {};

    // Use debugFlow if you need to debug the flow of the program. This causes
    // prints at the beginning of many functions to print some info.
    this.debugFlow = false;

    // Default to current directory.
    let logDir = '.';
    if (process.env.hasOwnProperty('MOZIOT_HOME')) {
      // Check user profile directory.
      const profileDir = path.join(process.env.MOZIOT_HOME, 'log');
      if (fs.existsSync(profileDir) &&
          fs.lstatSync(profileDir).isDirectory()) {
        logDir = profileDir;
      }
    }

    const zWaveModuleOptions = {
      SaveConfiguration: true,
      ConsoleOutput: false,
      UserPath: logDir,
    };

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
    const networkKey = adapterManifest.moziot.config.networkKey;

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

    this.zwave = new ZWaveModule(zWaveModuleOptions);
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
    if (this.debugFlow) {
      console.log('handleDeviceAdded:', node.nodeId);
    }
    delete this.nodesBeingAdded[node.zwInfo.nodeId];

    if (node.nodeId > 1) {
      zwaveClassifier.classify(node);
      super.handleDeviceAdded(node);
    }
  }

  handleDeviceRemoved(node) {
    if (this.debugFlow) {
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
    this.zwave.requestAllConfigParams(3);
    this.dump();
  }

  nodeAdded(nodeId) {
    if (DEBUG) {
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

      if (DEBUG || !node.named) {
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

      if (DEBUG) {
        for (const comClass in node.zwClasses) {
          const zwClass = node.zwClasses[comClass];
          console.log('node%d: class %d', nodeId, comClass);
          for (const idx in zwClass) {
            console.log('node%d:   %s=%s',
                        nodeId, zwClass[idx].label, zwClass[idx].value);
          }
        }
      }
    }
  }

  nodeRemoved(nodeId) {
    if (DEBUG) {
      console.log('node%d removed', nodeId);
    }

    const node = this.nodes[nodeId];
    if (node) {
      node.lastStatus = 'removed';
      this.handleDeviceRemoved(node);
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

      for (const property of node.properties.values()) {
        if (!property.valueId) {
          continue;
        }
        switch (node.zwValues[property.valueId].class_id) {
          case 0x25: // COMMAND_CLASS_SWITCH_BINARY
          case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
            this.zwave.enablePoll(node.zwValues[property.valueId], 1);
            break;
        }
      }
      if (nodeId in this.nodesBeingAdded) {
        this.handleDeviceAdded(node);
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
        if (DEBUG) {
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

  // eslint-disable-next-line no-unused-vars
  startPairing(timeoutSeconds) {
    console.log('===============================================');
    console.log('Press the Inclusion button on the device to add');
    console.log('===============================================');
    this.zwave.addNode();
  }

  cancelPairing() {
    console.log('Cancelling pairing mode');
    this.zwave.cancelControllerCommand();
  }

  /**
   * Remove a device.
   *
   * @param {Object} device The device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeThing(device) {
    // ZWave can't really remove a particular thing.
    console.log('==================================================');
    console.log('Press the Exclusion button on the device to remove');
    console.log('==================================================');
    this.zwave.removeNode();

    return new Promise((resolve, reject) => {
      if (this.devices.hasOwnProperty(device.id)) {
        this.handleDeviceRemoved(device);
        resolve(device);
      } else {
        reject(`Device: ${device.id} not found.`);
      }
    });
  }

  // eslint-disable-next-line no-unused-vars
  cancelRemoveThing(node) {
    console.log('Cancelling remove mode');
    this.zwave.cancelControllerCommand();
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

function isZWavePort(port) {
  /**
   * The popular HUSBZB-1 adapter contains ZWave AND Zigbee radios. With the
   * most recent drivers from SiLabs, the radios are likely to enumerate in the
   * following order with the following names:
   *
   * /dev/tty.GoControl_zigbee
   * /dev/tty.GoControl_zwave
   *
   * Since `i` comes before `w` when the devices are listed, it's common for the
   * Zigbee radio to be returned as the ZWave radio. We need to scrutinize the
   * comName of the radio to ensure that we're returning the actual ZWave one.
   */
  const isHUSBZB1 = port.vendorId == '10c4' && port.productId == '8a2a';
  if (isHUSBZB1) {
    const isGoControl = port.comName.indexOf('GoControl') >= 0;
    if (isGoControl) {
      return port.comName.indexOf('zwave') >= 0;
    }

    /**
     * There is also a chance the radios show up with more typical names, if
     * they're not using the latest drivers:
     *
     * /dev/ttyUSB0
     * /dev/ttyUSB1
     *
     * For now, since there's no good way to distinguish one radio from the
     * other with these names, and since this configuration was previously
     * valid below, return true.
     */
    return true;
  }

  return ((port.vendorId == '0658' &&
           port.productId == '0200') ||  // Aeotec Z-Stick Gen-5
          (port.vendorId == '0658' &&
           port.productId == '0280') ||  // UZB1
          (port.vendorId == '10c4' &&
           port.productId == 'ea60'));   // Aeotec Z-Stick S2
}

// Scan the serial ports looking for an OpenZWave adapter.
//
//    callback(error, port)
//        Upon success, callback is invoked as callback(null, port) where `port`
//        is the port object from SerialPort.list().
//        Upon failure, callback is invoked as callback(err) instead.
//
function findZWavePort(callback) {
  SerialPort.list(function listPortsCallback(error, ports) {
    if (error) {
      callback(error);
    }
    for (const port of ports) {
      // Under OSX, SerialPort.list returns the /dev/tty.usbXXX instead
      // /dev/cu.usbXXX. tty.usbXXX requires DCD to be asserted which
      // isn't necessarily the case for ZWave dongles. The cu.usbXXX
      // doesn't care about DCD.
      if (port.comName.startsWith('/dev/tty.usb')) {
        port.comName = port.comName.replace('/dev/tty', '/dev/cu');
      }
      if (isZWavePort(port)) {
        callback(null, port);
        return;
      }
    }
    callback('No ZWave port found');
  });
}

function loadZWaveAdapters(addonManager, manifest, errorCallback) {
  adapterManifest = manifest;

  try {
    ZWaveModule = require('openzwave-shared');
  } catch (err) {
    errorCallback(manifest.name, `Failed to load openzwave-shared: ${err}`);
    return;
  }

  findZWavePort(function(error, port) {
    if (error) {
      errorCallback(manifest.name, 'Unable to find ZWave adapter');
      return;
    }

    console.log('Found ZWave port @', port.comName);

    new ZWaveAdapter(addonManager, manifest.name, port);

    // The zwave adapter will be added when it's driverReady method is called.
    // Prior to that we don't know what the homeID of the adapter is.
  });
}

module.exports = loadZWaveAdapters;
