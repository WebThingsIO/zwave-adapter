/**
 *
 * zwave-debug - manage debug configuration.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const DEBUG_FLAG = {
  // Use DEBUG_classifier for debugging the behaviour of the classifier.
  DEBUG_classifier: false,

  // Use DEBUG_flow if you need to debug the flow of the program. This causes
  // prints at the beginning of many functions to print some info.
  DEBUG_flow: false,

  // DEBUG_node causes additional debug information from the zwave-node.js
  // file to be printed.
  DEBUG_node: false,

  // DEBUG_valueId causes value-added valueId's to be printed.
  DEBUG_valueId: false,

  set: function(names) {
    for (const name of names.split(/[, ]+/)) {
      if (name === '') {
        // If names is empty then split returns ['']
        continue;
      }
      const debugName = `DEBUG_${name}`;
      if (DEBUG_FLAG.hasOwnProperty(debugName)) {
        console.log(`Enabling ${debugName}`);
        DEBUG_FLAG[debugName] = true;
      } else {
        console.log(`DEBUG: Unrecognized flag: '${debugName}' (ignored)`);
      }
    }
  },
};

module.exports = DEBUG_FLAG;
