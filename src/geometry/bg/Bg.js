// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/bg.frag'
import vertexShader from './shaders/bg.vert'

export default class Bg extends Base {
  constructor (args) {
    super(args)

    this.uRadiusMultiplier = 8257.34
    this.uOffset = 0.880

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/saturn/')
      .load([
        '_RT.png', // right
        '_LF.png', // left
        '_UP.png', // top
        '_DN.png', // bottom
        '_FT.png', // front
        '_BK.png' // back
      ])

    this.cubeMapGround = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.material = new BgMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
      envMap: this.cubeMapGround,
      fog: false
    })
  }

  async init () {
    this.geometry = new THREE.SphereBufferGeometry(2000000, 25, 25)

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false

    return this.mesh
  }

  async updateGeometry () {

  }

  update (args) {
    this.material.uniforms.uTime.value = args.time * 0.001
    this.material.uniforms.uCamPos.value = args.camPos
  }
}

class BgMaterial extends THREE.MeshBasicMaterial {
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
