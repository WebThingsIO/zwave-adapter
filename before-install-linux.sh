#!/bin/bash -e

# This script is run from .travis.yml before_install section

set -x

sudo apt-get -qq update
sudo apt-get install libudev-dev

git clone -b moziot --single-branch --depth=1 https://github.com/mozilla-iot/open-zwave
make -C open-zwave
sudo make -C open-zwave install
