#!/bin/bash -e

if [ -z "${ADDON_ARCH}" ]; then
  # This means we're running locally. Fake out ADDON_ARCH.
  # This happens when you run ./package.sh locally
  UNAME=$(uname -s)
  case "${UNAME}" in

    Linux)
      ADDON_ARCH=linux-x64
      ;;

    Darwin)
      ADDON_ARCH=darwin-x64
      ;;

    *)
      echo "Unrecognized uname -s: ${UNAME}"
      exit 1
      ;;
  esac
  echo "Faking ADDON_ARCH = ${ADDON_ARCH}"
else
  echo "ADDON_ARCH = ${ADDON_ARCH}"
fi

# For the Raspberry Pi, the version of node which was installed with the
# 0.7.0 gateway clears LD_LIBRARY_PATH, which means that we need to use
# a utility called patchelf. If we're building for the Pi, then verify
# that it's been installed.
if [[ "${ADDON_ARCH}" =~ "linux" ]]; then
  if [[ ! $(type -P patchelf) ]]; then
    echo "patchelf utility doesn't seem to be installed."
    # patchelf should be installed in our raspberry pi cross compiler
    # docker image, so you shouldn't really see this error.
    exit 1
  fi
fi

# Make the C++ symbols be backwards compatible with gcc versions
# prior to 5.1. In particular, the openzwave library suffers
# from this problem.
export CXXFLAGS=-D_GLIBCXX_USE_CXX11_ABI=0

rm -rf node_modules

if [ -z "${ADDON_ARCH}" ]; then
  TARFILE_SUFFIX=
else
  NODE_VERSION="$(node --version)"
  TARFILE_SUFFIX="-${ADDON_ARCH}-${NODE_VERSION/\.*/}"
fi

npm install --production

OZW_PKG="libopenzwave"
OZW_DIR="openzwave"
OZW_LIB_DIR="${OZW_DIR}/lib"
OZW_CONFIG_DIR="${OZW_DIR}/config.orig"
OZW_LIB_VERSION="$(pkg-config --modversion ${OZW_PKG})"
OZW_PKG_LIB_DIR="$(pkg-config --variable=libdir ${OZW_PKG})"

if [ "${ADDON_ARCH}" == "darwin-x64" ]; then
  OZW_LIB_NAME="${OZW_PKG_LIB_DIR}/libopenzwave-${OZW_LIB_VERSION}.dylib"
else
  OZW_LIB_NAME="${OZW_PKG_LIB_DIR}/libopenzwave.so.${OZW_LIB_VERSION}"
fi

rm -rf "${OZW_DIR}"
mkdir -p "${OZW_LIB_DIR}" "${OZW_CONFIG_DIR}"
cp -r "$(pkg-config --variable=sysconfdir ${OZW_PKG})/." "${OZW_CONFIG_DIR}/"
cp "${OZW_LIB_NAME}" "${OZW_LIB_DIR}"

if [[ "${ADDON_ARCH}" =~ "linux" ]]; then
  # Set rpath for the openzwave node module so that it will find our
  # libopenzwave.so.1.x since LD_LIBRARY_PATH doesn't get passed through.
  echo "Patching node-openzwave-shared"
  patchelf --set-rpath '$ORIGIN/../../../../openzwave/lib' node_modules/openzwave-shared/build/Release/openzwave_shared.node
fi

shasum --algorithm 256 manifest.json package.json *.js zwave-loader.sh LICENSE > SHA256SUMS

find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS
find "${OZW_DIR}" -type f -exec shasum --algorithm 256 {} \; >> SHA256SUMS

TARFILE=`npm pack`

tar xzf ${TARFILE}
rm ${TARFILE}
TARFILE_ARCH="${TARFILE/.tgz/${TARFILE_SUFFIX}.tgz}"
cp -r node_modules ./package
cp -r "${OZW_DIR}" ./package
tar czf ${TARFILE_ARCH} package

shasum --algorithm 256 ${TARFILE_ARCH} > ${TARFILE_ARCH}.sha256sum

rm -rf SHA256SUMS package
