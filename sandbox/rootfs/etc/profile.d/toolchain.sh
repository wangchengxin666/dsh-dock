# Load optional build-time toolchains environment from /opt/toolchain/env.sh.
if [ -r /opt/toolchain/env.sh ]; then
  . /opt/toolchain/env.sh
fi
