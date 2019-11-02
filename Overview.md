## Overview

### HomeID

ZWave has the notion of a `HomeID` which is a randomly generated ID
assigned to the dongle. It is used for defining your network of devices.
All of the devices which are paired to a dongle will only talk to a
dongle with the HomeID it was paired with.

Factory resetting the dongle will assign a new randomly generated HomeID.

### NodeID

NodeIDs are in the range 1-255 and refers to the particular device that
you're dealing with. NodeId 1 is assigned to the dongle and remaining
devices get assigned an incrementing ID each time a device is paired.
Unpairing and repairing a device will give it a new NodeID.

The HomeId and NodeId are combined together to create the unique device
id. The device id will be zwave-homeid-NodeId

### ValueIDs

A zwave ValueID is made up of 4 components:

* NodeID - (1-255) Refers to the device that you're dealing with. NodeId 1 is assigned to the dongle and remaining devices get assigned an incrementing ID each time a device is paired. Unpairing and repairing a device will give it a new NodeID.
* Class ID - (aka COMMAND_CLASS). This describe the major functionality that the command class offers.
* Instance - normally 1, but may have other values if the device supports multiple instances (like a device with 2 outlets where each outlet command be controlled)
* Index - defines 1 particular attribute of the command class. The file: https://github.com/mozilla-iot/open-zwave/blob/master/cpp/src/ValueIDIndexesDefines.def is what OpenZWave uses.

### OpenZWave

We use a fork of OpenZWave https://github.com/mozilla-iot/open-zwave/ and use
the `moziot` tag to determine which revision to checkout. You'll want to
bump the moziot tag periodically to grab new fixes/versions.

### Flow

The OpenZWave library communicates with the adapter through a series of
callbacks:
https://github.com/mozilla-iot/zwave-adapter/blob/5d225b2ba058ce36296c8d170aa81a820c56f71a/zwave-adapter.js#L125

After calling zwave.connect, the driverReady callback will be called
(telling the adapter the homeId).

After this, openzwave does a scan of the network and issues
nodeAdded/nodeNaming/nodeReady/valueAdded/valueChanged callbacks. When
the scan is complete a scanComplete callback will be made.

As changes are detected in the network, valueAdded/valueChanged/sceneEvent/notification
callbacks will be made.

Once a node becomes ready, the classifier is called.

The classifier uses the devices "genericType" along with the presence of
various valueIds to determine the type and properties of the device.

OpenZWave uses a device database to describe configuration parameters
for each device. These configuration parameters often change how the
device behaves. As part of the classification process, the classifier
will often configure the device to behave in a manner which is more
suitable for the purposes of the gateway. This configuration is typically
performed using the QUIRKS. Each quirk will try match all of the fields
found in the zwInfo object, and if a match is found, then extra
configuration may be performed, or additional information may be
present to alter the behaviour of the adapter (i.e. to disable polling,
to determine if a device is a light or not, etc).

### ToDo

Zwave unpairing needs a timeout
