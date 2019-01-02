// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/glow.frag'
import vertexShader from './shaders/glow.vert'

export default class Glow extends Base {
  constructor (args) {
    super(args)

    this.material = new GlowMaterial({
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      fog: false,
      depthTest: false
    })
  }

  async init () {
    this.geometry = new THREE.SphereBufferGeometry(460000, 100, 100)

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.scale.multiplyScalar(1.002)

    return this.mesh
  }

  update (args) {
    this.material.uniforms.uTime.value = args.time * 0.001

    // this.material.uniforms.uCamPos.value = new THREE.Vector3().subVectors(args.camPos, new THREE.Vector3(0.0, 0.0, 0.0))

    this.material.uniforms.uCamPos.value = args.camPos
  }
}

class GlowMaterial extends THREE.ShaderMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = {}

    this.uniforms.uColor = {
      type: 'c',
      value: new THREE.Color(0x003cff)
    }

    this.uniforms.uCamPos = {
      type: 'v3',
      value: new THREE.Vector3(0.0, 0.0, 0.0)
    }

    this.uniforms.uTime = {
      type: 'f',
      value: 0
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
