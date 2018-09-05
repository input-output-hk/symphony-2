// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/disk.frag'
import vertexShader from './shaders/disk.vert'

export default class Disk extends Base {
  constructor (args) {
    super(args)

    this.material = new DiskMaterial({
      flatShading: true,
      color: 0xffffff,
      // emissive: 0x333333,
      // metalness: 0.9,
      // roughness: 0.1,
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      // roughnessMap: this.roughnessMap
      // metalnessMap: this.roughnessMap
      // normalMap: this.normalMap,
      // normalScale: new THREE.Vector2(0.01, 0.01),
      fog: false
    })
  }

  async init () {
    // set up base geometry
    this.geometry = new THREE.PlaneBufferGeometry(10000000, 10000000, 1, 1)
    this.geometry.rotateX(Math.PI / 2)

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false

    this.mesh.rotateY(Math.PI)
    this.mesh.translateY(-10)

    return this.mesh
  }

  async updateGeometry () {

  }

  update (args) {
    this.material.uniforms.uTime.value = args.time * 0.001
    this.material.uniforms.uCamPos.value = args.camPos
  }
}

class DiskMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.basic.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uCamPos = {
      type: 'v3',
      value: new THREE.Vector3(0, 0, 0)
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
