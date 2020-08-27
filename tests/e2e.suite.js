/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict'

module.exports = {
  descriptin: 'This suite runs our release tests',
  setup: async (options) => {
    const _ = require('lodash')
    const Bluebird = require('bluebird')
    const {
      join
    } = require('path')
    const {
      homedir
    } = require('os')
    const {
      ensureDirSync
    } = require('fs-extra')
    const utils = require('../lib/utils')
    const BalenaOS = utils.requireComponent('os', 'balenaos')
    const Balena = utils.requireComponent('balena', 'sdk')
    const Worker = require(`../lib/workers/${options.worker}`)

    const teardown = new utils.Teardown()

    return Bluebird.try(async () => {
      ensureDirSync(options.tmpdir)
      const deviceType = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)
      const sshKeyPath = join(homedir(), 'id')

      const sdk = new Balena(options.apiUrl)

      await sdk.loginWithToken(options.apiKey)
      teardown.register(() => {
        return sdk.logout().catch({
          code: 'BalenaNotLoggedIn'
        }, _.noop)
      })

      await sdk.createApplication(options.applicationName, options.deviceType, {
        delta: false
      })
      teardown.register(() => {
        return sdk.removeApplication(options.applicationName)
          .catch({
            code: 'BalenaNotLoggedIn'
          }, _.noop)
          .catch({
            code: 'BalenaApplicationNotFound'
          }, _.noop)
      })

      await sdk.addSSHKey(options.sshKeyLabel, await utils.createSSHKey(sshKeyPath))
      teardown.register(() => {
        return Bluebird.resolve(sdk.removeSSHKey(options.sshKeyLabel)).catch({
          code: 'BalenaNotLoggedIn'
        }, _.noop)
      })

      const uuid = await sdk.generateUUID()
      const deviceApiKey = await sdk.register(options.applicationName, uuid)

      const os = new BalenaOS({
        tmpdir: options.tmpdir,
        deviceType: options.deviceType,
        version: options.balenaOSVersion,
        configuration: {
          balena: await sdk.getDeviceOSConfiguration(
            uuid, deviceApiKey, _.assign({
              version: options.balenaOSVersion
            }, options.configuration)
          ),
          download: new Balena(options.download),
          network: options.network
        }
      })

      await os.fetch()

      const worker = new Worker('main worker', options.deviceType, {
        devicePath: options.device
      })

      await worker.ready()
      await worker.flash(os)
      await worker.on()
      teardown.register(() => {
        return worker.off()
      })

      console.log('Waiting for device to be online')
      await utils.waitUntil(() => {
        return sdk.isDeviceOnline(uuid)
      })

      return {
        balena: {
          sdk,
          uuid,
          sync: utils.requireComponent('balena', 'sync')
        },
        os,
        worker,
        sshKeyPath,
        deviceType,
        teardown
      }
    }).catch(async (error) => {
      await teardown.run(setImmediate)
      throw error
    })
  },
  tests: [
    'device-online.js',
    'os-file-format.js',
    'device-reportOsVersion.js',
    'chrony-ntp-time-sync.js',
    'hostapp-update.js',
    'balena-sync.js',
    'push-container.js',
    'env-variables.js',
    'service-variables.js',
    'balena-device-progress.js',
    'update-supervisor-through-api.js',
    'push-multicontainer.js',
    'move-device-between-applications.js',
    'kernel-module-build.js',
    'reload-supervisor.js',
    'override-lock.js',
    'persistent-logging.js',
    'bluetooth-test.js',
    'push-full-desktop-container.js',
    'enter-container.js',
    'kernel-splash-screen.js',
    'identification-led.js',
    'balena-splash-screen.js',
    'reboot-with-app.js',
    'preload.js',
    'hostapp-update-old-to-new.js',
    'local-mode.js',
    'self-served-hostOs-update.js',
    'modem.js',
    'rpi-serial-uart0.js',
    'rpi-serial-uart1.js',
    'hdmi-uart5.js'
  ]
}
