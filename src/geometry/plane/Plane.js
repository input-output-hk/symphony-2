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

    this.instanceTotal = 50

    this.cubeMap = new THREE.CubeTextureLoader()
      .setPath('assets/images/textures/cubemaps/playa2/')
      .load([
        '0004.png',
        '0002.png',
        '0006.png',
        '0005.png',
        '0001.png',
        '0003.png'
      ])

    this.material = new PlaneMaterial({
      flatShading: true,
      color: 0xffffff,
      emissive: 0x000000,
      metalness: 0.7,
      roughness: 0.1,
      opacity: 0.7,
      transparent: true,
      side: THREE.DoubleSide,
      envMap: this.cubeMap,
      // bumpMap: this.bumpMap,
      // bumpScale: 0.2
      // roughnessMap: this.roughnessMap
      // metalnessMap: this.roughnessMap
      normalMap: this.normalMap,
      normalScale: new THREE.Vector2(0.02, 0.02)
    })
  }

  async init (blockGeoData) {
    this.planeOffsetsArray = new Float32Array(this.instanceTotal * 2).fill(0.0)
    this.quatArray = new Float32Array(this.instanceTotal * 4)

    // set up base geometry
    let planeGeo = new THREE.BoxGeometry(this.planeSize + 10, this.planeSize + 10, 4, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)
    this.geometry.rotateY(Math.PI / 2)
    this.geometry.translate(0, -2, 0)

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)
    // object.rotateY(1 / (blockHeight + 20))

    this.quatArray[0] = object.quaternion.x
    this.quatArray[1] = object.quaternion.y
    this.quatArray[2] = object.quaternion.z
    this.quatArray[3] = object.quaternion.w

    this.planeOffsetsArray[0] = blockPosition.x
    this.planeOffsetsArray[1] = blockPosition.z

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

    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }
}
