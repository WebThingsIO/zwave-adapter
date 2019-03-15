#!/bin/bash -e

# Make the C++ symbols be backwards compatible with gcc versions
# prior to 5.1. In particular, the openzwave library suffers
# from this problem.
export CXXFLAGS=-D_GLIBCXX_USE_CXX11_ABI=0

if [ "$1" == "--dev" ]; then
  PRODUCTION=
else
  PRODUCTION='--production'
fi

rm -rf node_modules
if [ -z "${ADDON_ARCH}" ]; then
  TARFILE_SUFFIX=
else
  NODE_VERSION="$(node --version)"
  TARFILE_SUFFIX="-${ADDON_ARCH}-${NODE_VERSION/\.*/}"
fi
if [ "${ADDON_ARCH}" == "linux-arm" ]; then
  # We assume that CC and CXX are pointing to the cross compilers
  npm install --ignore-scripts ${PRODUCTION}
  npm rebuild --arch=armv6l --target_arch=arm
else
  npm install ${PRODUCTION}
fi

OZW_PKG="libopenzwave"
OZW_DIR="openzwave"
OZW_LIB_DIR="${OZW_DIR}/lib"
OZW_CONFIG_DIR="${OZW_DIR}/config"
OZW_LIB_VERSION="$(pkg-config --modversion ${OZW_PKG})"
OZW_PKG_LIB_DIR="$(pkg-config --variable=libdir ${OZW_PKG})"
OZW_LIB_NAME="${OZW_PKG_LIB_DIR}/libopenzwave.so.${OZW_LIB_VERSION}"

rm -rf "${OZW_DIR}"
mkdir -p "${OZW_LIB_DIR}" "${OZW_CONFIG_DIR}"
cp -r "$(pkg-config --variable=sysconfdir ${OZW_PKG})/." "${OZW_CONFIG_DIR}/"
cp "${OZW_LIB_NAME}" "${OZW_LIB_DIR}"

rm -f SHA256SUMS
sha256sum package.json *.js LICENSE > SHA256SUMS
find "node_modules" -type f -exec sha256sum {} \; >> SHA256SUMS
find "${OZW_DIR}" -type f -exec sha256sum {} \; >> SHA256SUMS
TARFILE="$(npm pack)"
tar xzf ${TARFILE}
rm ${TARFILE}
TARFILE_ARCH="${TARFILE/.tgz/${TARFILE_SUFFIX}.tgz}"
cp -r "node_modules" "./package"
cp -r "${OZW_DIR}" "./package"
tar czf ${TARFILE_ARCH} "package"
rm -rf "package"
echo "Created ${TARFILE_ARCH}"
