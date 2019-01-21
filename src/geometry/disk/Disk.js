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

    this.uRadiusMultiplier = 8257.34
    this.uOffset = 0.880

    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')
    // this.normalMap.wrapS = THREE.RepeatWrapping
    // this.normalMap.wrapT = THREE.RepeatWrapping
    // this.normalMap.repeat.set(4, 4)

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.material = new DiskMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.4,
      roughness: 0.3,
      opacity: 1.0,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
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

    // this.mesh.receiveShadow = true

    return this.mesh
  }

  async updateGeometry () {

  }

  update (args) {
    this.material.uniforms.uTime.value = args.time * 0.001
    this.material.uniforms.uCamPos.value = args.camPos
    this.material.uniforms.uRadiusMultiplier.value = this.uRadiusMultiplier
    this.material.uniforms.uOffset.value = this.uOffset
    this.material.uniforms.uMaxHeight.value = args.maxHeight
  }
}

class DiskMaterial extends THREE.MeshStandardMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uCamPos = {
      type: 'v3',
      value: new THREE.Vector3(0, 0, 0)
    }

    this.uniforms.uRadiusMultiplier = {
      type: 'f',
      value: 8257.308
    }

    this.uniforms.uOffset = {
      type: 'f',
      value: 0.540
    }

    this.uniforms.uOriginOffset = {
      type: 'v2',
      value: new THREE.Vector2(0.0, 0.0)
    }

    this.uniforms.uMaxHeight = {
      type: 'f',
      value: 0.0
    }

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
