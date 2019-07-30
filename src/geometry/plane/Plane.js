// libs
import * as THREE from 'three'

// base geometry class
import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/plane.frag'
import vertexShader from './shaders/plane.vert'

export default class Plane extends Base {
  constructor (args) {
    super(args)

    this.normalMap = new THREE.TextureLoader().load('assets/images/textures/normalMap.jpg')
    this.normalMap.wrapS = THREE.RepeatWrapping
    this.normalMap.wrapT = THREE.RepeatWrapping
    this.normalMap.repeat.set(4, 4)

    this.instanceTotal = 100

    if (this.config.detector.isMobile) {
      this.instanceTotal = 20
    }

    if (this.config.scene.mode === 'lite') {
      this.instanceTotal = 20
    }

    this.blockHeightIndex = {}

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa/')
      .load([
        '0004.jpg',
        '0002.jpg',
        '0006.jpg',
        '0005.jpg',
        '0001.jpg',
        '0003.jpg'
      ])

    this.material = new PlaneMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 1.0,
      roughness: 0.1,
      opacity: 0.5,
      transparent: true,
      side: THREE.FrontSide,
      roughnessMap: this.roughnessMap,
      envMap: this.cubeMap,
      envMapIntensity: 0.7,
      alphaMap: this.alphaMap,
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.001, 0.001)
      // fog: false
    })
  }

  async init (blockGeoData) {
    this.planeOffsetsArray = new Float32Array(this.instanceTotal * 2)
    // this.planeOffsetsArray.fill(9999999, 0, this.instanceTotal * 2)

    this.quatArray = new Float32Array(this.instanceTotal * 4)

    // set up base geometry
    let planeGeo = new THREE.BoxGeometry(this.planeSize + 10, this.planeSize + 10, 3, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    this.geometry.rotateY(Math.PI / 2)
    this.geometry.translate(0, -1.5, 0)

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.quatArray[0] = object.quaternion.x
    this.quatArray[1] = object.quaternion.y
    this.quatArray[2] = object.quaternion.z
    this.quatArray[3] = object.quaternion.w

    this.planeOffsetsArray[0] = blockPosition.x
    this.planeOffsetsArray[1] = blockPosition.z

    this.blockHeightIndex[blockGeoData.blockData.height] = 0

    // attributes
    let planeOffsets = new THREE.InstancedBufferAttribute(this.planeOffsetsArray, 2)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)

    this.geometry.addAttribute('planeOffset', planeOffsets)
    this.geometry.addAttribute('quaternion', quaternions)

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    this.index++

    return this.mesh
  }

  async updateGeometry (blockGeoData) {
    if (this.index + 1 > this.instanceTotal) {
      this.index = 0
    }

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.blockHeightIndex[blockGeoData.blockData.height] = this.index * 2

    this.geometry.attributes.quaternion.array[this.index * 4 + 0] = object.quaternion.x
    this.geometry.attributes.quaternion.array[this.index * 4 + 1] = object.quaternion.y
    this.geometry.attributes.quaternion.array[this.index * 4 + 2] = object.quaternion.z
    this.geometry.attributes.quaternion.array[this.index * 4 + 3] = object.quaternion.w
    this.geometry.attributes.quaternion.needsUpdate = true

    this.geometry.attributes.planeOffset.array[this.index * 2 + 0] = blockPosition.x
    this.geometry.attributes.planeOffset.array[this.index * 2 + 1] = blockPosition.z
    this.geometry.attributes.planeOffset.needsUpdate = true
    this.index++
  }
}

class PlaneMaterial extends THREE.MeshStandardMaterial {
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
