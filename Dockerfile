ARG BALENA_ARCH=generic-amd64

FROM balenalib/${BALENA_ARCH}-alpine-node:16-run AS build-base

WORKDIR /usr/app

# hadolint ignore=DL3018
RUN apk add --no-cache libusb-dev dbus-dev python3 make build-base git linux-headers eudev-dev

COPY package*.json ./

FROM build-base as node-dev

# install locked dev dependencies
RUN npm ci

COPY tsconfig.json ./
COPY typings ./typings
COPY lib ./lib
COPY bin ./bin

# build typescript
RUN npm run build

FROM build-base as node-prod

# install locked production dependencies
RUN npm ci --production

FROM balenalib/${BALENA_ARCH}-alpine-node:16-run

WORKDIR /usr/app

ENV DBUS_SYSTEM_BUS_ADDRESS unix:path=/host/run/dbus/system_bus_socket

# ovmf is only packaged for x86_64 and aarch64 so ignore failures on arm
# hadolint ignore=DL3018
RUN apk add --no-cache \
  openssh-client \
  bluez \
  socat \
  rsync \
  libusb-dev dbus-dev eudev-dev \
  gstreamer-tools gst-plugins-base gst-plugins-bad gst-plugins-good \
  bridge bridge-utils iproute2 dnsmasq iptables \
  qemu-img qemu-system-x86_64 qemu-system-aarch64 \
  python3 py3-pip py3-setuptools \
  mdadm util-linux
  
# hadolint ignore=DL3018
RUN apk add --no-cache uhubctl --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community || true

RUN pip3 install usbsdmux

# create qemu-bridge-helper ACL file
# https://wiki.qemu.org/Features/HelperNetworking
RUN mkdir -p /etc/qemu \
  && echo "allow all" > /etc/qemu/bridge.conf \
  && chmod 0640 /etc/qemu/bridge.conf

COPY --from=node-prod /usr/app/package.json ./
COPY --from=node-prod /usr/app/node_modules ./node_modules
COPY --from=node-dev /usr/app/build ./build

COPY entry.sh entry.sh

CMD ["./entry.sh"]
