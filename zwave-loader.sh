#!/bin/sh
#
# Script for setting LD_LIBRARY_PATH prior to launching the
# the zwave adapter.

NODE_CMD="$1"
ADDON_LOADER="$2"
ZWAVE_ADAPTER_DIR="$3"

OPENZWAVE_LIB_DIR="${ZWAVE_ADAPTER_DIR}/openzwave/lib"
if [ -d "${OPENZWAVE_LIB_DIR}" ]; then
  if [ -z "${LD_LIBRARY_PATH}" ]; then
    LD_LIBRARY_PATH="${OPENZWAVE_LIB_DIR}"
  else
    LD_LIBRARY_PATH="${LD_LIBRARY_PATH}:${OPENZWAVE_LIB_DIR}"
  fi
  export LD_LIBRARY_PATH
fi

# Using exec replaces the current process with node
exec ${NODE_CMD} ${ADDON_LOADER} ${ZWAVE_ADAPTER_DIR}
