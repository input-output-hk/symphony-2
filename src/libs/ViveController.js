import * as THREE from 'three'

/**
 * @author mrdoob / http://mrdoob.com
 * @author stewdio / http://stewd.io
 */

export default class ViveController extends THREE.Object3D {
  constructor (index) {
    super()
    this.index = index
    this.gamepad = null
    this.axes = [ 0, 0 ]
    this.thumbpadIsPressed = false
    this.triggerIsPressed = false
    this.gripsArePressed = false
    this.menuIsPressed = false
  }

  findGamepad (id) {
    // Iterate across gamepads as Vive Controllers may not be
    // in position 0 and 1.
    let gamepads = navigator.getGamepads && navigator.getGamepads()

    for (let i = 0, j = 0; i < gamepads.length; i++) {
      let gamepad = gamepads[i]
      if (gamepad && (gamepad.id === 'OpenVR Gamepad' || gamepad.id.startsWith('Oculus Touch') || gamepad.id.startsWith('Spatial Controller'))) {
        if (j === id) {
          return gamepad
        }
        j++
      }
    }
  }

  update () {
    this.gamepad = this.findGamepad(this.index)

    if (this.gamepad && typeof this.gamepad.buttons !== 'undefined' && this.gamepad.buttons.length > 1) {
      //  Thumbpad and Buttons.
      if (this.axes[ 0 ] !== this.gamepad.axes[ 0 ] || this.axes[ 1 ] !== this.gamepad.axes[ 1 ]) {
        this.axes[ 0 ] = this.gamepad.axes[ 0 ] //  X axis: -1 = Left, +1 = Right.
        this.axes[ 1 ] = this.gamepad.axes[ 1 ] //  Y axis: -1 = Bottom, +1 = Top.
        this.dispatchEvent({ type: 'axischanged', axes: this.axes })
      }

      if (this.thumbpadIsPressed !== this.gamepad.buttons[0].pressed) {
        this.thumbpadIsPressed = this.gamepad.buttons[0].pressed
        this.dispatchEvent({ type: this.thumbpadIsPressed ? 'thumbpaddown' : 'thumbpadup', axes: this.axes })
      }

      if (this.triggerIsPressed !== this.gamepad.buttons[1].pressed) {
        this.triggerIsPressed = this.gamepad.buttons[1].pressed
        this.dispatchEvent({ type: this.triggerIsPressed ? 'triggerdown' : 'triggerup' })
      }

      if (this.gripsArePressed !== this.gamepad.buttons[2].pressed) {
        this.gripsArePressed = this.gamepad.buttons[2].pressed
        this.dispatchEvent({ type: this.gripsArePressed ? 'gripsdown' : 'gripsup' })
      }

      if (this.menuIsPressed !== this.gamepad.buttons[3].pressed) {
        this.menuIsPressed = this.gamepad.buttons[3].pressed
        this.dispatchEvent({ type: this.menuIsPressed ? 'menudown' : 'menuup' })
      }
    }
  }
}
