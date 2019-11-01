## Adding a new device

### Running the gateway

Run the gateway using the the -d option.

The following run.sh script makes a backup of the addon directory (I've accidentally wiped it out before) and then starts the gateway with the
`-d` options and runs the output through a sed script which filters the color escape sequences. The sed part isn't really needed anymore since
we now have persistent logging.

Typical run.sh
```
#!/bin/bash

#set -x

BACKUP_ROOT="${HOME}/addon-backup"
BACKUP_DIR="${BACKUP_ROOT}/$(date +%Y-%m-%d-%H%M%S)"
SRC_DIR="${HOME}/moziot/.mozilla-iot/addons"

# Remove all but the last 20 directories
ls -1t ${BACKUP_ROOT} | tail -n +20 | while read dir; do
  echo "Removing ${BACKUP_ROOT}/${dir} ..."
  rm -rf ${BACKUP_ROOT}/${dir}
done

# Backup the current directory
mkdir -p ${BACKUP_DIR}
echo "Backing up ${SRC_DIR} to ${BACKUP_DIR} ..."
rsync -ap --exclude=node_modules ${SRC_DIR}/ ${BACKUP_DIR}/

# Start the gateway
npm start -- -d 2>&1 | tee >(sed -r 's/\x1B\[[0-9]{1,2}m//g' > zb.log)
```

### Pair the device

Pair the device. It will probably show up as a custom thing with no properties or perhaps a battery level.

### Run the CLI

Run the CLI: https://github.com/mozilla-iot/cli

```
cd cli
./c.py gateway http://localhost:8080
```

The `devices` command will show the detected devices. Disabling all of the adapters except for the zwave one will reduce the amount of log noise. Having a minimal number of other devices paired also helps.

```
cli http://localhost:8080> devices
zwave-e9880e42-6 zwave-e9880e42-8 zwave-e9880e42-9
```

Use the device command to select the desired device:
```
cli http://localhost:8080> device zwave-e9880e42-9
cli http://localhost:8080 zwave-e9880e42-9>
```
Use the info command to dump out the collected device information.
This will include all of the detected zwave ValueIDs along with the
properties actions, and events for the device.

You'll be interested in the ValueIDs

```
cli http://localhost:8080 zwave-e9880e42-9> info
{
  "baseHref": null,
  "pin": {
    "required": false,
    "pattern": null
  },
  "credentialsRequired": false,
  "lastStatus": "ready",
  "zwInfo": {
    "location": "",
    "nodeId": 9,
    "manufacturer": "AEON Labs",
    "manufacturerId": "0x0086",
    "product": "DSB09104 Home Energy Meter",
    "productId": "0x0009",
    "productType": "0x0002",
    "type": "Routing Multilevel Sensor",
    "genericType": 33,
    "basicType": 4,
    "specificType": 1
  },
  "zwClasses": [
    134,
    128,
    114,
    112,
    49,
    50
  ],
  "zwValues": {
    "9-134-1-0": {
      "value_id": "9-134-1-0",
      "node_id": 9,
      "class_id": 134,
      "type": "string",
      "genre": "system",
      "instance": 1,
      "index": 0,
      "label": "Library Version",
      "units": "",
      "help": "Z-Wave Library Version",
      "read_only": true,
      "write_only": false,
      "min": 0,
      "max": 0,
      "is_polled": false,
      "value": "3"
    },
...snip...
    "9-50-3-257": {
      "value_id": "9-50-3-257",
      "node_id": 9,
      "class_id": 50,
      "type": "button",
      "genre": "system",
      "instance": 3,
      "index": 257,
      "label": "Instance 3: Reset",
      "units": "",
      "help": "",
      "read_only": false,
      "write_only": true,
      "min": 0,
      "max": 0,
      "is_polled": false
    }
  },
  "id": "zwave-e9880e42-9",
  "title": "zwave-e9880e42-9-Battery Level",
  "type": "thing",
  "@context": "https://iot.mozilla.org/schemas",
  "@type": [],
  "description": "",
  "properties": {
    "batteryLevel": {
      "name": "batteryLevel",
      "value": 0,
      "visible": true,
      "title": "Battery",
      "type": "number",
      "@type": "LevelProperty",
      "unit": "percent",
      "minimum": 0,
      "maximum": 100,
      "readOnly": true,
      "valueId": "9-128-1-0"
    }
  },
  "actions": {},
  "events": {},
  "links": []
}
```

You can use the info command followed by a filename and it will store
the output in the named file rather than sending it to stdout. Once a
device is functioning properly, I use the info command to create the
files found in the zwave-adapter/test/classifier directory (so there
are lots of files to look at as examples).

Often times, there will be enough information in the ValueIDs to
figure out how to use the device.

The list of zwClasses may also provide information. I use
http://wiki.micasaverde.com/index.php/ZWave_Command_Classes
as my palce to translate command class numbers into strings.

We store the Values retrieved from a device in the device.zwValues
dictionary indexed by ValueID. The retrieved values will contain a name,
a value, a unit, possibly minimum and maximum and other fields.

In the example above, the following command classes are supported:

```
134 - Version
128 - Battery
114 - Manufacturer Specific
112 - Configuration
49  - Sensor MultiLevel
50  - Meter
```

The generic type of 33 (0x21) = Sensor MultiLevel is the primary thing
used by the classifier to figure out what type of device we're dealing
with.

Command Classes 49 & 50 will probably be the ones containing the
information we want to monitor. This particular device is an Aeotec
ZW095 has the following values:
```
    9-49-1-4   - Instance 1: Power
    9-49-2-4   - Instance 2: Power
    9-49-3-4   - Instance 3: Power
    9-50-1-0   - Instance 1: Electric - kWh
    9-50-1-2   - Instance 1: Electric - W
    9-50-1-256 - Instance 1: Exporting
    9-50-1-257 - Instance 1: Reset
    9-50-2-0   - Instance 2: Electric - kWh
    9-50-2-2   - Instance 2: Electric - W
    9-50-2-256 - Instance 2: Exporting
    9-50-2-257 - Instance 2: Reset
    9-50-3-0   - Instance 3: Electric - kWh
    9-50-3-2   - Instance 3: Electric - W
    9-50-3-256 - Instance 3: Exporting
    9-50-3-257 - Instance 3: Reset
```
The board inside the device supports 1, 2, or 3 phases, but it doesn't
look like you can tell how many phases are actually being used. They
often use tricks like this to reduce their manufacturing costs (i.e.
use the same PCB but only populate the needed components). So you might
display all 3 phases or use some other configuration to decide to only
 display 1 or 2.

I believe that the 49 command class shows instantaneous values, and that
the 50 (meter class) shows accumulated values (with the Reset being used
to reset the accumulations to zero).
