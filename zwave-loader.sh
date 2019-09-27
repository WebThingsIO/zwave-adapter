#!/bin/sh
#
# Script for setting LD_LIBRARY_PATH prior to launching the
# the zwave adapter.

NODE_CMD="$1"
ADDON_LOADER="$2"
ZWAVE_ADAPTER_DIR="$3"

OPENZWAVE_LIB_DIR="${ZWAVE_ADAPTER_DIR}/openzwave/lib"
if [ -d "${OPENZWAVE_LIB_DIR}" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    if [ -z "${DYLD_LIBRARY_PATH}" ]; then
      DYLD_LIBRARY_PATH="${OPENZWAVE_LIB_DIR}"
    else
      DYLD_LIBRARY_PATH="${OPENZWAVE_LIB_DIR}:${DYLD_LIBRARY_PATH}"
    fi
    export DYLD_LIBRARY_PATH
  else
    if [ -z "${LD_LIBRARY_PATH}" ]; then
      LD_LIBRARY_PATH="${OPENZWAVE_LIB_DIR}"
    else
      LD_LIBRARY_PATH="${OPENZWAVE_LIB_DIR}:${LD_LIBRARY_PATH}"
    fi
    export LD_LIBRARY_PATH
  fi
fi

OPENZWAVE_CONFIG_DIR="${ZWAVE_ADAPTER_DIR}/openzwave/config"
OPENZWAVE_ORIG_CONFIG_DIR="${ZWAVE_ADAPTER_DIR}/openzwave/config.orig"
if [ ! -d "${OPENZWAVE_CONFIG_DIR}" ]; then
  cp -r "${OPENZWAVE_ORIG_CONFIG_DIR}" "${OPENZWAVE_CONFIG_DIR}"
fi

# Using exec replaces the current process with node
exec ${NODE_CMD} ${ADDON_LOADER} ${ZWAVE_ADAPTER_DIR}
