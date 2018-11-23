// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/underside.frag'
import vertexShader from './shaders/underside.vert'

export default class Underside extends Base {
  constructor (args) {
    super(args)

    this.material = new UndersideMaterial({
      transparent: true,
      side: THREE.DoubleSide
    })
  }

  async init () {
    let undersideGeometry = new THREE.PlaneBufferGeometry(this.planeSize + 10, this.planeSize + 10, 1)
    this.underside = new THREE.Mesh(undersideGeometry, this.material)
    this.underside.frustumCulled = false
    this.underside.visible = false

    this.underside.scale.set(1.0, -1.0, 1.0)
    this.underside.position.y = -0.1
    this.underside.updateMatrix()

    let undersideMaterialL = this.material.clone()
    this.undersideL = this.underside.clone()
    this.undersideL.material = undersideMaterialL

    let undersideMaterialR = this.material.clone()
    this.undersideR = this.underside.clone()
    this.undersideR.material = undersideMaterialR

    return {
      underside: this.underside,
      undersideL: this.undersideL,
      undersideR: this.undersideR
    }
  }

  update (time) {
    this.material.uniforms.uTime.value = time
  }
}

class UndersideMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
