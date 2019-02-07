export default class WebVR {
  constructor (args) {
    this.renderer = null
    this.currentSession = null
    this.device = null
    this.cameraDepthFar = 5000000
    this.mode = '' // XR or VR
    this.setupDevice()
    this.VRSupported = false
  }

  setRenderer (renderer) {
    this.renderer = renderer
  }

  setMode (device, mode) {
    this.VRSupported = true
    this.device = device
    this.mode = mode
    this.renderer.vr.setDevice(device)
  }

  setupDevice () {
    if ('xr' in navigator) {
      navigator.xr.requestDevice().then(function (device) {
        device.supportsSession({ immersive: true, exclusive: true })
          .then(function () {
            this.setMode(device, 'XR')
          }.bind(this))
          .catch(this.VRNotFound.bind(this))
      }.bind(this)).catch(this.VRNotFound.bind(this))
    } else if ('getVRDisplays' in navigator) {
      window.addEventListener('vrdisplayconnect', function (event) {
        this.setMode(event.display, 'VR')
      }, false)

      window.addEventListener('vrdisplaydisconnect', function (event) {
        this.VRNotFound().bind(this)
      }, false)

      window.addEventListener('vrdisplaypresentchange', function (event) {

      }, false)

      window.addEventListener('vrdisplayactivate', function (event) {
        event.display.requestPresent([ { source: this.renderer.domElement } ])
      }, false)

      navigator.getVRDisplays()
        .then(function (displays) {
          if (displays.length > 0) {
            this.setMode(displays[0], 'VR')
          } else {
            this.VRNotFound().bind(this)
          }
        }.bind(this)).catch(this.VRNotFound.bind(this))
    } else {
      this.VRNotFound().bind(this)
    }
  }

  enterVR () {
    if (this.device.isPresenting) {
      this.device.exitPresent()
    } else {
      this.device.requestPresent([{
        source: this.renderer.domElement
      }])
    }
  }

  enterXR () {
    if (this.currentSession === null) {
      this.device.requestSession({
        immersive: true,
        exclusive: true
      }).then(this.onSessionStarted)
    } else {
      this.currentSession.end()
    }
  }

  startVRSession () {
    switch (this.mode) {
      case 'VR':
        this.enterVR()
        break

      case 'XR':
        this.enterXR()

        break

      default:
        break
    }
  }

  endVRSession () {
    switch (this.mode) {
      case 'VR':
        this.device.exitPresent()
        break

      case 'XR':
        this.currentSession.end()
        break

      default:
        break
    }
  }

  VRNotFound () {
    this.VRSupported = false
    this.renderer.vr.setDevice(null)
  }
}
