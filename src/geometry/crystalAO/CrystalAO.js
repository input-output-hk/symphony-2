// libs
import * as THREE from 'three'

import Base from '../base/Base'

// shaders
import fragmentShader from './shaders/crystalAO.frag'
import vertexShader from './shaders/crystalAO.vert'

export default class CrystalAO extends Base {
  constructor (args) {
    super(args)
    this.map = new THREE.TextureLoader().load('assets/images/textures/ao-hexagon.png')

    this.material = new CrystalAOMaterial({
      flatShading: true,
      transparent: true,
      side: THREE.DoubleSide,
      map: this.map,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false
    })

    this.txIndexOffsets = {}
    this.instanceTotal = 10 * 3000
    this.txCount = 0
  }

  async init (blockGeoData) {
    this.offsetsArray = new Float32Array(this.instanceTotal * 3)

    this.scalesArray = new Float32Array(this.instanceTotal)
    this.quatArray = new Float32Array(this.instanceTotal * 4)

    let blockPosition = blockGeoData.blockData.pos

    // set up base geometry
    let planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1)
    let planeBufferGeo = new THREE.BufferGeometry().fromGeometry(planeGeo)
    this.geometry = new THREE.InstancedBufferGeometry().copy(planeBufferGeo)
    this.geometry.rotateX(Math.PI / 2)

    // attributes
    let offsets = new THREE.InstancedBufferAttribute(this.offsetsArray, 3)
    let scales = new THREE.InstancedBufferAttribute(this.scalesArray, 1)
    let quaternions = new THREE.InstancedBufferAttribute(this.quatArray, 4)
    let blockStartTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)
    let blockLoadTimes = new THREE.InstancedBufferAttribute(new Float32Array(this.instanceTotal), 1)

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      offsets,
      quaternions,
      scales
    )

    this.geometry.addAttribute('offset', offsets)
    this.geometry.addAttribute('scale', scales)
    this.geometry.addAttribute('quaternion', quaternions)
    this.geometry.addAttribute('blockStartTime', blockStartTimes)
    this.geometry.addAttribute('blockLoadTime', blockLoadTimes)

    this.txCount += blockGeoData.blockData.n_tx

    this.mesh = new THREE.Mesh(this.geometry, this.material)

    this.mesh.frustumCulled = false

    return this.mesh
  }

  updateBlockStartTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.n_tx; i++) {
      this.geometry.attributes.blockStartTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockStartTime.needsUpdate = true
  }

  updateBlockLoadTimes (blockData) {
    const txIndexOffset = this.txIndexOffsets[blockData.height]
    const offsetTime = window.performance.now()

    for (let i = 0; i < blockData.n_tx; i++) {
      this.geometry.attributes.blockLoadTime.array[txIndexOffset + i] = offsetTime
    }

    this.geometry.attributes.blockLoadTime.needsUpdate = true
  }

  update (time, firstLoop) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uAudioTime.value = time
    this.material.uniforms.uFirstLoop.value = firstLoop
  }

  async updateGeometry (blockGeoData) {
    if (this.txCount + blockGeoData.blockData.n_tx > this.instanceTotal) {
      this.txCount = 0
    }

    let blockPosition = blockGeoData.blockData.pos

    let object = new THREE.Object3D()
    object.position.set(blockPosition.x, 0, blockPosition.z)
    object.lookAt(0, 0, 0)

    this.setTxAttributes(
      object,
      blockGeoData,
      this.geometry.attributes.offset,
      this.geometry.attributes.quaternion,
      this.geometry.attributes.scale
    )

    this.txCount += blockGeoData.blockData.n_tx

    this.updateBlockStartTimes(blockGeoData.blockData)
    this.updateBlockLoadTimes(blockGeoData.blockData)
  }
}

class CrystalAOMaterial extends THREE.MeshBasicMaterial {
  constructor (cfg) {
    super(cfg)
    this.type = 'ShaderMaterial'

    this.uniforms = THREE.ShaderLib.standard.uniforms

    this.uniforms.uTime = {
      type: 'f',
      value: 0.0
    }

    this.uniforms.uFirstLoop = {
      type: 'f',
      value: 1.0
    }

    this.uniforms.uAudioTime = {
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
